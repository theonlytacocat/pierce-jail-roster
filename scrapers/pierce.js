import { chromium } from 'playwright';

const ROSTER_URL  = 'https://linxonline.co.pierce.wa.us/linxweb/Booking/GetJailRoster.cfm';
const DETAIL_BASE = 'https://linxonline.co.pierce.wa.us/linxweb/Booking/GetBooking.cfm?booking_id=';

// Parse Julian-day-encoded booking ID into a date string
// e.g. 2026109041 → year=2026, day=109 → April 19, 2026
function bookingIdToDate(id) {
  try {
    const s = String(id);
    if (s.length < 7) return null;
    const year = parseInt(s.slice(0, 4));
    const day  = parseInt(s.slice(4, 7));
    const d = new Date(year, 0);
    d.setDate(day);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { return null; }
}

// Extract only the demographic fields we care about from detail page HTML
function parseDetail(html) {
  // Key-value pairs from adjacent TD cells — only keep known demographic fields
  const WANTED_KEYS = ['age', 'sex', 'gender', 'race', 'height', 'weight', 'hair', 'eyes'];
  const kvPairs = {};
  const tdRe = /<td[^>]*>\s*([^<]{1,60}?)\s*<\/td>\s*<td[^>]*>\s*([^<]{1,200}?)\s*<\/td>/gi;
  let m;
  while ((m = tdRe.exec(html)) !== null) {
    const key = m[1].replace(/[:\s]+$/, '').trim();
    const val = m[2].trim();
    if (key && val && WANTED_KEYS.includes(key.toLowerCase())) {
      kvPairs[key] = val;
    }
  }

  // Extract charges table
  const charges = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tbl = tableMatch[0];
    const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (rows.length < 2) continue;
    const headers = (rows[0].match(/<t[hd][^>]*>([^<]*)<\/t[hd]>/gi) || [])
      .map(h => h.replace(/<[^>]+>/g, '').trim().toLowerCase());
    if (!headers.some(h => /charge|violation|offense/i.test(h))) continue;
    for (let i = 1; i < rows.length; i++) {
      const cells = (rows[i].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [])
        .map(c => c.replace(/<[^>]+>/g, '').trim());
      if (cells.length === 0 || cells.every(c => !c)) continue;
      const charge = {};
      headers.forEach((h, idx) => {
        if (cells[idx] && cells[idx].length < 300) charge[h] = cells[idx];
      });
      if (Object.keys(charge).length > 0) charges.push(charge);
    }
    break; // only use the first matching table
  }

  return { kvPairs, charges };
}

export async function scrapeRoster() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log('Loading roster page...');
    await page.goto(ROSTER_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('table tr td', { timeout: 20000 }).catch(() => {});

    const html = await page.content();

    const inmates = [];
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      const row = rowMatch[0];
      if (!row.includes('GetBooking.cfm')) continue;

      const nameMatch    = row.match(/<td[^>]*nowrap[^>]*>\s*([^<]+)\s*<\/td>/i);
      const bookingMatch = row.match(/booking_id=(\d+)/);
      const facilityMatch    = row.match(/<td[^>]*>\s*((?:Main|New) Jail)\s*<\/td>/i);
      const releaseDateMatch = row.match(/<td[^>]*>\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*<\/td>/i);

      if (!nameMatch || !bookingMatch) continue;

      inmates.push({
        name:          nameMatch[1].trim(),
        bookingNumber: bookingMatch[1],
        facility:      facilityMatch ? facilityMatch[1].trim() : null,
        releaseDate:   releaseDateMatch ? releaseDateMatch[1].trim() : null,
        bookingDate:   bookingIdToDate(bookingMatch[1]),
        status:        releaseDateMatch ? 'released' : 'in_custody',
      });
    }

    console.log(`Parsed ${inmates.length} inmates from roster`);
    return inmates;
  } finally {
    await browser.close();
  }
}

// Scrape detail pages for a batch of booking numbers in ONE shared browser session.
// Returns a map of bookingNumber → { kvPairs, charges }
export async function scrapeDetailBatch(bookingNumbers) {
  if (bookingNumbers.length === 0) return {};

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  const results = {};

  try {
    // Hit roster once to pass CAPTCHA — then reuse the session for all detail pages
    console.log('  Opening browser session for detail pages...');
    await page.goto(ROSTER_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('table tr td', { timeout: 20000 }).catch(() => {});

    for (const bookingNumber of bookingNumbers) {
      try {
        await page.goto(DETAIL_BASE + bookingNumber, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForSelector('table', { timeout: 10000 }).catch(() => {});
        const html = await page.content();
        results[bookingNumber] = parseDetail(html);
      } catch (err) {
        console.warn(`  Detail fetch failed for ${bookingNumber}:`, err.message);
        results[bookingNumber] = { kvPairs: {}, charges: [] };
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}
