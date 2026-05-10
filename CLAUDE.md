# Pierce County Jail Roster — Project Context

## What it is
A public jail roster monitor for Pierce County, WA. Scrapes the LINX sheriff's site every 30 minutes, tracks bookings and releases, and displays them on a public website.

## URLs
- **Live site:** https://theonlytacocat.github.io/pierce-jail-roster/ (after GitHub Pages setup)
- **GitHub repo:** https://github.com/theonlytacocat/pierce-jail-roster
- **Source data:** Pierce County LINX — https://linxonline.co.pierce.wa.us/linxweb/Booking/GetJailRoster.cfm

## Architecture
- **Scraper:** `scrape.js` — standalone Node.js script, runs via GitHub Actions cron every 30 min
- **Frontend:** React + Vite, served as static files on GitHub Pages (`gh-pages` branch)
- **Data storage:** JSON files committed to git in `data/` — no server, no database
- **Hosting cost:** $0

## Key Technical Notes
- Pierce County LINX uses reCAPTCHA Enterprise that auto-submits a POST — requires **Playwright** (headless Chromium) to bypass; simple HTTP requests won't work
- Booking IDs encode the date: `2026109041` = year 2026, Julian day 109 (April 19), sequence 041
- Detail pages require hitting the roster first (same browser session) to pass CAPTCHA

## Key Files
- `scrape.js` — main scraper script, writes all data/*.json files
- `scrapers/pierce.js` — Playwright-based scraper logic (roster + detail pages)
- `utils.js` — `nowPST()` helper with `hourCycle: 'h23'` (prevents midnight 24:xx bug)
- `data/change_log.json` — full history of all bookings/releases
- `data/roster.json` — current roster state
- `data/status.json` — {inCustody, lastUpdated}
- `.github/workflows/scrape.yml` — GitHub Actions workflow (scrape + build + deploy)
- `frontend/src/App.jsx` — React app, HashRouter, fetches from ./data/*.json
- `frontend/vite.config.js` — base: './' for GitHub Pages compatibility

## Data Format
- `change_log.json` is an array of booking entries, newest first
- Each entry: bookingNumber, name, status (in_custody/released), firstSeen, releasedAt, facility, charges[], age, sex, race, height, weight
- `firstSeen` format: "MM/DD/YYYY, HH:MM:SS" (PST)

## Color Scheme
- Green theme (not blue like Kitsap)
- Background: #111614, Primary green: #3A6647, Accent: #7AAA8A

## Related Projects
- **Kitsap Jail Roster** — https://theonlytacocat.github.io/ksco-scraper/ (HTML scraper, no CAPTCHA)
- **Mason County Jail Roster** — https://alexasroster.com (PDF-based, still on Railway)
