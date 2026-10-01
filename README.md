# diraBot

Finds 4–5 room apartments for sale between ₪2M and ₪4.5M in Tel Aviv, Herzliya, Givatayim, Ramat Gan, Savyon, Kiryat Ono and Netanya, ranks them by city priority, emails the new ones every 8 hours, and shows everything on a dashboard.

## How it fits together

```
GitHub Actions (every 8h) ──► scraper/run.ts ──► Neon Postgres ◄── Next.js dashboard (Vercel)
                                    │
                                    └──► Gmail (nodemailer): new listings + price drops
```

| Source | Method | Notes |
|---|---|---|
| Yad2 | Playwright, reads the page's `__NEXT_DATA__` | Radware sometimes challenges; then falls back to the `parsebird/yad2-real-estate-scraper` Apify actor |
| OnMap | Public JSON API | Filters by city + rooms; price filtered locally |
| Homeless | Playwright, one city board per run | Cloudflare challenges repeat visits, so cities rotate by 8h slot |
| Madlan | Apify actor `parsebird/madlan-real-estate-scraper` | Madlan's own site has a press-and-hold CAPTCHA |
| Facebook groups | Apify actor `apify/facebook-groups-scraper` | Public groups only, no personal account involved; Hebrew text parsed for price/rooms/m² |
| FB Marketplace | Apify actor `swerve/fb-marketplace-scraper` | Opt-in (`FB_MARKETPLACE=1`), the priciest source |

Apify sources run once a day (00:00 UTC run) unless `APIFY_EVERY_RUN=1`.

Duplicates: `(source, external_id)` is unique; a loose fingerprint (city + street + number + rooms + m², or post text for Facebook) links the same flat across sites so it shows once, with "also on …".

Taken-down ads: missing from a scrape proves nothing, since each run reads only the newest pages. After the sources run, `scraper/lib/verify-removed.ts` checks a few listings per source that no scrape has seen for 3+ days, using each listing's own page. OnMap's API reports `is_active:false` or 404. On Homeless the ad says "עסקה זו כבר נסגרה" or redirects to the home page. On Yad2 the signal is a 404 or a "removed" page. A bot challenge stops that source's checks for the run, and nothing gets recorded. Madlan listings count as removed after 21 days unseen, which is a weaker signal. Facebook posts are never removed. Removed listings get `removed_at`, never get emailed and show under "Not relevant" on the dashboard. If a later scrape sees one again, `removed_at` is cleared. Tuning: `VERIFY_PER_SOURCE` (15), `VERIFY_STALE_DAYS` (3), `VERIFY_RECHECK_DAYS` (2), `MADLAN_GONE_DAYS` (21). To skip the checks, pass `--no-verify`.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npx playwright install chromium
npm run scrape -- --only=onmap --no-email   # --dry writes dry-run.json without a DB
npm run dev
```

Other scripts: `npm run db:generate` after schema changes (migrations apply automatically on each scrape), `npm run db:studio`, and `npx tsx scraper/tools/find-groups.ts` to discover public Facebook groups.

## Deployment

- **Vercel**: import the repo, set `DATABASE_URL`.
- **GitHub → Settings → Secrets and variables → Actions**: `DATABASE_URL`, `APIFY_TOKEN`, `FB_GROUP_URLS`, `SMTP_USER`, `SMTP_PASS` (Gmail App Password), `NOTIFY_TO`, `DASHBOARD_URL`.
- Run the workflow once by hand from the Actions tab to verify. GitHub pauses scheduled workflows after 60 days without commits; re-enable from the Actions tab if that happens.
