# diraBot

Finds 4–5 room apartments for sale between ₪2M and ₪4.5M in Tel Aviv, Herzliya, Givatayim, Ramat Gan, Savyon, Kiryat Ono, Raanana, Ramat HaSharon and Netanya, ranks them by city priority, emails the new ones every 8 hours, and shows everything on a dashboard.

## How it fits together

```
GitHub Actions (every 8h) ──► scraper/run.ts ──► Neon Postgres ◄── Next.js dashboard (Vercel)
                                    │
                                    └──► Gmail (nodemailer): new listings + price drops
```

Email alerts go to `NOTIFY_TO` plus every confirmed subscriber. Visitors sign up from the dashboard (double opt-in, stored in the `subscribers` table); each subscriber gets their own message with an unsubscribe link and one-click `List-Unsubscribe` headers.

| Source | Method | Notes |
|---|---|---|
| Yad2 | Playwright, reads the page's `__NEXT_DATA__` | Radware sometimes challenges; then falls back to the `parsebird/yad2-real-estate-scraper` Apify actor |
| OnMap | Public JSON API | Filters by city + rooms; price filtered locally |
| Homeless | Playwright, one city board per run | Cloudflare challenges repeat visits, so cities rotate by 8h slot |
| Madlan | Apify actor `parsebird/madlan-real-estate-scraper` | Madlan's own site has a press-and-hold CAPTCHA |
| Facebook groups | Apify actor `apify/facebook-groups-scraper` | Public groups only, no personal account involved; Hebrew text parsed for price/rooms/m² |
| FB Marketplace | Apify actor `swerve/fb-marketplace-scraper` | Opt-in (`FB_MARKETPLACE=1`), the priciest source |
| Developer projects | Public official catalogs + optional SerpApi Google discovery | BOH, Virtue, ICR, Shviro and Prashkovsky; relevant 4–5 room types, including unpublished prices |

The dashboard switches between **Resale apartments**, **Projects** and **All**, including the map. Project markers show project names. Address, street and approximate city locations are distinguished in project details; projects sharing a city location are grouped. Prices remain attached to their room type; a general project minimum never becomes a 4/5-room price. Project prices are excluded from apartment medians. **Newest to oldest** uses the source publication date when available, otherwise the date first discovered by the bot.

Projects are checked daily. Google discovery refreshes weekly (one search per tracked city) and stays within verified developer domains. Set `SERPAPI_API_KEY` in GitHub Actions secrets; Vercel does not run the scheduled scraper. Without a key, the official catalogs still run. Configure `PROJECT_MAX_PAGES` (150 by default) and optional verified `PROJECT_URLS`. Street/address coordinates use cached OpenStreetMap data through Photon, with a paced limit of 15 new lookups per run; unmatched locations fall back to an explicitly approximate city point. Run `FORCE_PROJECTS=1 npm run scrape -- --only=projects --no-email --no-push --no-verify` for a maintenance scan. Apply pending migrations before deploying the dashboard.

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

- **Vercel**: import the repo, set `DATABASE_URL`. For the "Get alerts by email" sign-up, also set `SMTP_USER`, `SMTP_PASS` (same Gmail App Password) and `DASHBOARD_URL`; without SMTP the form says alerts aren't available yet.
- **GitHub → Settings → Secrets and variables → Actions**: `DATABASE_URL`, `APIFY_TOKEN`, `FB_GROUP_URLS`, `SMTP_USER`, `SMTP_PASS` (Gmail App Password), `NOTIFY_TO`, `DASHBOARD_URL`.
- Run the workflow once by hand from the Actions tab to verify. GitHub pauses scheduled workflows after 60 days without commits; re-enable from the Actions tab if that happens.

## Mobile push notifications

The header bell enables notifications on the first click and offers **Turn off on this device** once enabled. After permission has been granted, future visits restore the subscription automatically, without another prompt. Alerts summarize new listings and observed price changes after each scan, independently of email. Opt-in starts from now (no historical backlog). Delivery failures leave the device cursor unchanged for the next run; expired subscriptions (404/410) are removed. Turning off affects only that device. No offline page caching is installed.

Setup:
1. Run `npx web-push generate-vapid-keys` once. Keep the private key secret and retain the same pair; changing it requires devices to subscribe again.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a real `mailto:` contact) in both Vercel environment variables and GitHub Actions secrets.
3. Apply the migration with `npx tsx scraper/tools/migrate.ts` before deploying the dashboard, then redeploy Vercel. The scraper also applies pending migrations automatically.
4. On iPhone/iPad with iOS 16.4+, use **Share → Add to Home Screen**, open the icon, and tap the header bell to allow notifications. On Android use a compatible browser such as Chrome. HTTPS is required except for localhost.
5. Verify with a real device: opt in, run a scan that finds a new listing or price change, close the app and confirm receipt; tap the notification to open the dashboard. Turn off and confirm no further delivery. Desktop checks cannot verify iOS background delivery.

Use `--no-push` to skip push delivery on a maintenance scan (`--no-email` skips email only); `--dry` never sends either kind of alert. The setup requires no native app or paid notification service. If keys or the database are missing, the dashboard shows an unavailable message and email continues normally.

Run `npm run test:push` to verify backlog/duplicate suppression, price-change digests, provider validation, retry/expiry handling, and notification display/click behavior without sending real alerts.
