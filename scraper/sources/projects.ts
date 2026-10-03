import { locateProjects } from "../lib/project-geocode";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { newContext, sleep } from "../lib/browser";
import { parseProject, type ProjectPage } from "../lib/project-parser";
import { BlockedError, type Source, type RawListing } from "../types";
import type { Page } from "playwright";

// Official developer sites only. Google discovers new pages on these verified
// domains; arbitrary brokers/aggregators never become "direct from developer".
export const DEVELOPERS = [
  { name: "בוני התיכון", host: "boh.co.il", catalog: "https://www.boh.co.il/", path: /^\/projects\/\d+\/?$/ },
  { name: "Virtue", host: "vgroup.co.il", catalog: "https://vgroup.co.il/", path: /^\/project\/[^/]+\/?$/ },
  { name: "ICR", host: "icrr.co.il", catalog: "https://icrr.co.il/projects/", path: /^\/project\/[^/]+\/?$/ },
  { name: "קבוצת שבירו", host: "ramishbiros.co.il", catalog: "https://ramishbiros.co.il/", path: /^\/(?!contact|privacy|about|accessibility|shbiropaylate)[^/]+\/?$/ },
  { name: "פרשקובסקי", host: "prashkovsky.co.il", catalog: "https://www.prashkovsky.co.il/sitemap/", path: /^\/projects?\/[^/]+\/?$/ },
] as const;
function developerFor(url: string) {
  try { const u = new URL(url); return DEVELOPERS.find((d) => (u.hostname === d.host || u.hostname.endsWith(`.${d.host}`)) && d.path.test(decodeURI(u.pathname))); } catch { return undefined; }
}
async function html(url: string): Promise<string> {
  const r = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { "User-Agent": "diraBot/1.0 (+https://github.com/Lio311/dira-bot)", "Accept-Language": "he-IL" } });
  if (r.status === 403 || r.status === 429) throw new BlockedError(`HTTP ${r.status}: ${new URL(url).hostname}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${new URL(url).hostname}`);
  if (!developerFor(r.url) && !DEVELOPERS.some((d) => new URL(r.url).hostname.replace(/^www\./, "") === d.host)) throw new Error("Redirected off developer domain");
  const text = await r.text();
  if (/press & hold|Just a moment|captcha-delivery|Radware|verify you are human/i.test(text)) throw new BlockedError(`Challenge: ${new URL(url).hostname}`);
  return text;
}

export async function extractProjectPage(page: Page, markup: string, url: string): Promise<ProjectPage> {
  await page.setContent(markup, { waitUntil: "domcontentloaded" });
  return page.evaluate((url) => {
    const originalTitle = document.title;
    const meta = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
    const root = (document.querySelector("main") || document.querySelector(".project__content") || document.body).cloneNode(true) as HTMLElement;
    root.querySelectorAll("script,style,noscript,nav,header,footer,form,select,.elementor-location-popup,[role=dialog],.website-section,.language-toggle,.start-inner,.project__related").forEach((e) => e.remove());
    // Counters are initially rendered as zero. Read their advertised target instead.
    root.querySelectorAll<HTMLElement>("[data-to-value]").forEach((e) => { e.textContent = e.dataset.toValue || e.textContent; });
    root.querySelectorAll("a").forEach((e) => { const href = e.getAttribute("href"); if (href && /\/projects?\//.test(href) && !url.includes(href)) e.remove(); });
    document.body.replaceChildren(root);
    let text = root.innerText || root.textContent || "";
    text = text.split(/פרויקטים נוספים|מוזמנים לדבר איתנו|משרד המכירות|השאירו פרטים|לפרטים נוספים|IN THE MEDIA/i)[0];
    // Normalize HTML whitespace into logical lines before price attribution.
    text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
    const heading = root.querySelector("h1")?.textContent?.trim();
    const title = heading || originalTitle.split(/\s[|–-]\s/)[0];
    const stageText = [...root.querySelectorAll<HTMLElement>("h1,h2,h3,.status,.project-status")].map((e) => e.textContent?.trim()).filter(Boolean).join("\n");
    const identity = heading || `${title}\n${text.slice(0, 150)}`;
    // Never use a footer's corporate-office address as the project address.
    const street = heading?.match(/^(.+?\d[\d\s,־–-]*)(?:,|\s+(?:הרצליה|תל אביב|גבעתיים|רמת גן|קרי[תי]ת אונו|רעננה|רמת השרון|נתניה))/)?.[1] || null;
    return { title, identity, text, image: meta ? new URL(meta, url).href : null, street, stageText: `${stageText}\n${text.slice(0, 250)}` };
  }, url);
}

export const projects: Source = {
  key: "projects",
  skip: () => process.env.FORCE_PROJECTS === "1" || new Date().getUTCHours() < 8 ? null : "Developer projects are checked daily (00:00 UTC slot)",
  async run({ cities }) {
    const context = await newContext();
    // Parse public HTML only; no third-party ads, trackers or personal accounts.
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const candidates = new Map<string, string>();
    const catalogHints = new Map<string, string>();
    const warnings: string[] = [];
    const blocked = new Set<string>();
    let catalogsRead = 0;
    const cachePath = process.env.PROJECT_DISCOVERY_CACHE || ".project-discovery-cache.json";
    let cache: { searchedAt: string; cities: string; urls: string[] } | null = null;
    if (existsSync(cachePath)) { try { cache = JSON.parse(readFileSync(cachePath, "utf8")); } catch {} }
    for (const d of DEVELOPERS) {
      try {
        await page.setContent(await html(d.catalog), { waitUntil: "domcontentloaded" });
        const links = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => ({ href: a.getAttribute("href")!, hint: (a.closest(".swiper-slide")?.textContent || "").replace(/\s+/g, " ").trim() })));
        for (const l of links) {
          const u = new URL(l.href, d.catalog); u.search = ""; u.hash = "";
          if (developerFor(u.href)) { candidates.set(u.href, d.name); if (l.hint) catalogHints.set(u.href, l.hint); }
        }
        catalogsRead++;
      } catch (e) { warnings.push(`${d.name}: ${(e as Error).message}`); if (e instanceof BlockedError) blocked.add(d.name); }
      await sleep(1000);
    }
    const cityKey = cities.map((c) => c.key).sort().join(",");
    const weeklyDue = !cache || cache.cities !== cityKey || Date.now() - new Date(cache.searchedAt).getTime() >= 7 * 86_400_000;
    if (process.env.SERPAPI_API_KEY && weeklyDue) {
      const discovered: string[] = [];
      let complete = true;
      for (const city of cities) {
        try {
          const endpoint = new URL("https://serpapi.com/search.json");
          endpoint.search = new URLSearchParams({ engine: "google", q: `פרויקטים חדשים ${city.he} 4 5 חדרים (${DEVELOPERS.map((d) => `site:${d.host}`).join(" OR ")})`, hl: "iw", gl: "il", num: "10", api_key: process.env.SERPAPI_API_KEY }).toString();
          const res = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(`Search unavailable (HTTP ${res.status})`);
          for (const result of data.organic_results || []) {
            const d = developerFor(result.link);
            if (d) { const u = new URL(result.link); u.search = ""; u.hash = ""; candidates.set(u.href, d.name); discovered.push(u.href); }
          }
        } catch { complete = false; warnings.push(`Google discovery unavailable for ${city.he}; check search quota/key`); break; }
        await sleep(1000);
      }
      // Never mark a partial/failed discovery as successfully refreshed.
      if (complete) { cache = { searchedAt: new Date().toISOString(), cities: cityKey, urls: [...new Set(discovered)] }; writeFileSync(cachePath, JSON.stringify(cache)); }
    } else if (!process.env.SERPAPI_API_KEY) warnings.push("Google discovery not connected (SERPAPI_API_KEY); scanning official developer catalogs only");
    for (const url of cache?.urls || []) { const d = developerFor(url); if (d) candidates.set(url, d.name); }
    // Configured explicit URLs are also restricted to verified developer domains.
    for (const url of (process.env.PROJECT_URLS || "").split(",").filter(Boolean)) { const d = developerFor(url.trim()); if (d) candidates.set(url.trim(), d.name); }
    const listings: RawListing[] = [];
    const max = Math.max(1, Math.min(200, Number(process.env.PROJECT_MAX_PAGES) || 150));
    try {
      const groups = DEVELOPERS.map((d) => [...candidates].filter(([, name]) => name === d.name));
      const ordered: [string, string][] = [];
      while (groups.some((g) => g.length)) for (const group of groups) { const item = group.shift(); if (item) ordered.push(item); }
      for (const [url, developer] of ordered.slice(0, max)) {
        if (blocked.has(developer)) continue;
        try {
          const fields = await extractProjectPage(page, await html(url), url);
          const hint = catalogHints.get(url);
          if (hint) fields.text += `\n${hint}`;
          const project = parseProject(fields, url, developer, cities);
          if (project) listings.push(project);
        } catch (e) {
          warnings.push(`${url}: ${(e as Error).message}`);
          if (e instanceof BlockedError) blocked.add(developer);
        }
        await sleep(1000);
      }
    } finally { await context.close(); }
    if (!catalogsRead && !listings.length) throw new Error("No developer catalogs could be read");
    if (candidates.size > max) warnings.push(`Project page cap reached (${max}/${candidates.size}); raise PROJECT_MAX_PAGES for full coverage`);
    warnings.push(...await locateProjects(listings, cities));
    return { listings, warnings };
  },
};
