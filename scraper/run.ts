import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { writeFileSync } from "node:fs";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "../src/db/client";
import { listings, scrapeRuns, type NewListing } from "../src/db/schema";
import { closeBrowser } from "./lib/browser";
import { renderEmail, sendEmail } from "./lib/email";
import { normalize, saveListings, type PriceDrop } from "./lib/store";
import { verifyRemoved } from "./lib/verify-removed";
import { yad2 } from "./sources/yad2";
import { onmap } from "./sources/onmap";
import { homeless } from "./sources/homeless";
import { madlan } from "./sources/madlan";
import { facebookGroups, facebookMarketplace } from "./sources/facebook";
import { BlockedError, type Source } from "./types";

const ALL: Source[] = [yad2, onmap, homeless, madlan, facebookGroups, facebookMarketplace];

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const only = flag("only")?.split("=")[1]?.split(",");
const dry = !!flag("dry");
const noEmail = !!flag("no-email");
const noVerify = !!flag("no-verify");

const log = (...m: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...m);

async function main() {
  const sources = only ? ALL.filter((s) => only.includes(s.key)) : ALL;
  const db = dry ? null : getDb();
  if (db) await migrate(db, { migrationsFolder: "drizzle" });

  const warnings: string[] = [];
  const drops: PriceDrop[] = [];
  const dryRows: NewListing[] = [];
  let anySucceeded = false;

  for (const source of sources) {
    const skip = source.skip?.();
    if (skip) {
      log(`${source.key}: skipped (${skip})`);
      if (db) await db.insert(scrapeRuns).values({ source: source.key, status: "skipped", message: skip, finishedAt: new Date() });
      continue;
    }

    log(`${source.key}: start`);
    const [run] = db ? await db.insert(scrapeRuns).values({ source: source.key, status: "running" }).returning() : [];
    try {
      const res = await source.run();
      const kept = res.listings.map(normalize).filter((l): l is NewListing => l !== null);
      log(`${source.key}: ${res.listings.length} scraped, ${kept.length} match criteria`);
      res.warnings.forEach((w) => log(`  ⚠ ${w}`));
      warnings.push(...res.warnings.map((w) => `${source.key}: ${w}`));

      let inserted = 0;
      if (db) {
        const saved = await saveListings(db, kept);
        inserted = saved.inserted.length;
        drops.push(...saved.priceDrops);
      } else dryRows.push(...kept);

      if (db && run)
        await db
          .update(scrapeRuns)
          .set({
            status: "ok",
            found: kept.length,
            inserted,
            finishedAt: new Date(),
            message: res.warnings.slice(0, 5).join(" · ") || null,
          })
          .where(eq(scrapeRuns.id, run.id));
      log(`${source.key}: ${inserted} new`);
      anySucceeded = true;
    } catch (e) {
      const blocked = e instanceof BlockedError;
      const msg = (e as Error).message;
      log(`${source.key}: ${blocked ? "BLOCKED" : "ERROR"} ${msg}`);
      warnings.push(`${source.key} ${blocked ? "blocked" : "failed"}`);
      if (db && run)
        await db
          .update(scrapeRuns)
          .set({ status: blocked ? "blocked" : "error", message: msg.slice(0, 500), finishedAt: new Date() })
          .where(eq(scrapeRuns.id, run.id));
    }
  }
  // Confirm take-downs of listings the scrapes stopped seeing (their own pages, gently).
  if (db && !noVerify) await verifyRemoved(db, sources.map((s) => s.key));
  await closeBrowser();

  if (dry) {
    writeFileSync("dry-run.json", JSON.stringify(dryRows, null, 2));
    log(`dry run: ${dryRows.length} listings written to dry-run.json`);
    return anySucceeded;
  }

  // Everything not yet emailed, excluding cross-site duplicates and ads already taken down.
  const fresh = await db!
    .select()
    .from(listings)
    .where(and(isNull(listings.notifiedAt), isNull(listings.duplicateOf), isNull(listings.removedAt)));
  if (noEmail || (!fresh.length && !drops.length)) {
    log(noEmail ? "email disabled for this run" : "nothing new to email");
  } else {
    try {
      const { subject, html } = renderEmail(fresh, drops, warnings);
      await sendEmail(subject, html);
      log(`email sent: ${subject}`);
      await db!
        .update(listings)
        .set({ notifiedAt: new Date() })
        .where(inArray(listings.id, fresh.map((l) => l.id)));
    } catch (e) {
      log(`email not sent: ${(e as Error).message}`);
    }
  }
  // Duplicates never get their own email; mark them so they don't pile up.
  await db!
    .update(listings)
    .set({ notifiedAt: new Date() })
    .where(and(isNull(listings.notifiedAt), isNotNull(listings.duplicateOf)));
  return anySucceeded;
}

main()
  .then(async (ok) => {
    await closeDb();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (e) => {
    console.error(e);
    await closeBrowser();
    await closeDb();
    process.exit(1);
  });
