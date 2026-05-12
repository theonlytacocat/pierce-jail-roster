import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { scrapeRoster, scrapeDetailBatch } from './scrapers/pierce.js';
import { nowPST } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ROSTER_FILE = path.join(DATA_DIR, 'roster.json');
const LOG_FILE    = path.join(DATA_DIR, 'change_log.json');
const STATUS_FILE = path.join(DATA_DIR, 'status.json');

// On first run the whole roster is "new". Fetching details for 500+ people
// in one go is too slow. Skip details if there are too many new bookings —
// the next run will pick up any genuinely new people with details.
const DETAIL_BATCH_LIMIT = 30;

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  return fallback;
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data));
}

async function run() {
  console.log(`[${nowPST()}] Running Pierce County scrape...`);

  let roster = readJSON(ROSTER_FILE, {});
  let log    = readJSON(LOG_FILE, []);

  let inmates;
  try {
    inmates = await scrapeRoster();
  } catch (err) {
    console.error('Roster fetch failed:', err.message);
    process.exit(1);
  }

  if (inmates.length === 0) {
    console.log('Got 0 inmates — skipping to avoid wiping data.');
    process.exit(0);
  }

  const currentIds  = new Set(inmates.map(i => i.bookingNumber));
  const previousIds = new Set(Object.keys(roster));

  // New bookings
  const newBookings = inmates.filter(i => !previousIds.has(i.bookingNumber));
  console.log(`  ${newBookings.length} new booking(s) found`);

  // Fetch details — skip if too many new (first run) to avoid timeouts
  let detailMap = {};
  if (newBookings.length > 0 && newBookings.length <= DETAIL_BATCH_LIMIT) {
    console.log(`  Fetching details for ${newBookings.length} new booking(s)...`);
    try {
      detailMap = await scrapeDetailBatch(newBookings.map(i => i.bookingNumber));
    } catch (err) {
      console.warn('  Detail batch failed:', err.message);
    }
  } else if (newBookings.length > DETAIL_BATCH_LIMIT) {
    console.log(`  Skipping details (${newBookings.length} new bookings — likely first run)`);
  }

  for (const inmate of newBookings) {
    console.log(`  NEW: ${inmate.name}`);
    const detail = detailMap[inmate.bookingNumber] || { kvPairs: {}, charges: [] };
    const hasDetail = !!detailMap[inmate.bookingNumber];

    const entry = {
      bookingNumber: inmate.bookingNumber,
      name:          inmate.name,
      facility:      inmate.facility,
      bookingDate:   inmate.bookingDate,
      status:        'in_custody',
      firstSeen:     nowPST(),
      releasedAt:    null,
      charges:       detail.charges,
      hasDetail,
      ...detail.kvPairs,
    };

    roster[inmate.bookingNumber] = entry;
    log.unshift(entry);
  }

  // Backfill details for existing entries that were skipped on first run
  const BACKFILL_BATCH = 30;
  const needsDetail = Object.values(roster)
    .filter(e => !e.hasDetail && e.status === 'in_custody')
    .slice(0, BACKFILL_BATCH)
    .map(e => e.bookingNumber);

  if (needsDetail.length > 0) {
    console.log(`  Backfilling details for ${needsDetail.length} existing booking(s)...`);
    try {
      const backfillMap = await scrapeDetailBatch(needsDetail);
      for (const id of needsDetail) {
        const detail = backfillMap[id];
        if (!detail) continue;
        roster[id] = { ...roster[id], charges: detail.charges, hasDetail: true, ...detail.kvPairs };
        const logEntry = log.find(e => e.bookingNumber === id);
        if (logEntry) Object.assign(logEntry, { charges: detail.charges, hasDetail: true, ...detail.kvPairs });
      }
      console.log(`  Backfill done.`);
    } catch (err) {
      console.warn('  Backfill failed:', err.message);
    }
  }

  // Releases — in previous roster but not in current scrape
  const releasedIds = new Set([
    ...[...previousIds].filter(id => !currentIds.has(id) && roster[id]?.status === 'in_custody'),
    ...inmates
      .filter(i => i.status === 'released' && roster[i.bookingNumber]?.status === 'in_custody')
      .map(i => i.bookingNumber),
  ]);

  for (const id of releasedIds) {
    const inmate = roster[id];
    if (!inmate) continue;
    console.log(`  RELEASED: ${inmate.name}`);
    const releasedAt = inmates.find(i => i.bookingNumber === id)?.releaseDate || nowPST();
    roster[id].status     = 'released';
    roster[id].releasedAt = releasedAt;
    const logEntry = log.find(e => e.bookingNumber === id);
    if (logEntry) {
      logEntry.status     = 'released';
      logEntry.releasedAt = releasedAt;
    }
  }

  writeJSON(ROSTER_FILE, roster);
  writeJSON(LOG_FILE, log);

  const inCustody = Object.values(roster).filter(i => i.status === 'in_custody').length;
  writeJSON(STATUS_FILE, { inCustody, lastUpdated: nowPST() });

  console.log(`[${nowPST()}] Done. ${newBookings.length} new, ${releasedIds.size} released. ${inCustody} in custody.`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
