import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ locale: "he-IL", viewport: { width: 1300, height: 850 }, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  const reqs: string[] = [];
  p.on("request", (r) => { const u = r.url(); if (/onmap\.co\.il/.test(u) && !/\.(js|css|png|jpg|webp|svg|woff)/.test(u)) reqs.push(u); });
  await p.goto("https://www.onmap.co.il/search/homes/buy/netanya", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(7000);
  await p.locator('[class*="propertyInfo"]').first().click();
  await p.waitForTimeout(4000);
  const info = await p.evaluate(() => ({
    canonical: document.querySelector('link[rel=canonical]')?.getAttribute("href"),
    og: document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
    hrefs: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!).filter((h) => /property|homes\/|share|whatsapp|wa\.me/i.test(h)).slice(0, 15),
    buttons: [...document.querySelectorAll("button,[role=button]")].map((x) => (x.textContent || x.getAttribute("aria-label") || "").trim()).filter((t) => /שת|share|העתק|copy/i.test(t)).slice(0, 8),
  }));
  console.log(JSON.stringify(info, null, 1));
  const share = p.locator('button:has-text("שיתוף"), [aria-label*="שית"], [class*="share" i]').first();
  if (await share.count()) {
    await share.click().catch(() => {});
    await p.waitForTimeout(1500);
    const after = await p.evaluate(() => [...document.querySelectorAll("a[href], input")].map((e) => (e as HTMLAnchorElement).href || (e as HTMLInputElement).value).filter((h) => h && /onmap|wa\.me|whatsapp|facebook/i.test(h)).slice(0, 10));
    console.log("after share click:", after);
    try { console.log("clipboard:", await p.evaluate(() => navigator.clipboard.readText())); } catch {}
  } else console.log("no share button found");
  const sm = await fetch("https://www.onmap.co.il/sitemap.xml"); const t = await sm.text();
  console.log("sitemap", sm.status, t.slice(0, 600));
  await b.close();
})();
