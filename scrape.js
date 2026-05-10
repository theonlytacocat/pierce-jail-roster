import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { scrapeRoster, scrapeDetail } from './scrapers/pierce.js';
import { nowPST } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ROSTER_FILE  = path.join(DATA_DIR, 'roster.json');
const LOG_FILE     = path.join(DATA_DIR, 'change_log.json');
const STATUS_FILE  = path.join(DATA_DIR, 'status.json');

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  return fallback;
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
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
  for (const inmate of newBookings) {
    console.log(`  NEW: ${inmate.name}`);

    let detail = null;
    try {
      detail = await scrapeDetail(inmate.bookingNumber);
    } catch (err) {
      console.warn(`  Detail fetch failed for ${inmate.bookingNumber}:`, err.message);
    }

    const entry = {
      bookingNumber: inmate.bookingNumber,
      name: inmate.name,
      facility: inmate.facility,
      bookingDate: inmate.bookingDate,
      status: 'in_custody',
      firstSeen: nowPST(),
      releasedAt: null,
      charges: detail?.charges || [],
      ...(detail?.kvPairs || {}),
    };

    roster[inmate.bookingNumber] = entry;
    log.unshift({ type: 'BOOKED', ...entry });
  }

  // Releases — in previous roster but not in current scrape
  const released = [...previousIds].filter(
    id => !currentIds.has(id) && roster[id]?.status === 'in_custody'
  );

  // Also handle explicit release dates from the roster
  for (const inmate of inmates) {
    if (inmate.status === 'released' && roster[inmate.bookingNumber]?.status === 'in_custody') {
      released.push(inmate.bookingNumber);
    }
  }

  for (const id of [...new Set(released)]) {
    const inmate = roster[id];
    if (!inmate) continue;
    console.log(`  RELEASED: ${inmate.name}`);
    const releasedAt = inmates.find(i => i.bookingNumber === id)?.releaseDate || nowPST();
    roster[id].status = 'released';
    roster[id].releasedAt = releasedAt;
    const logEntry = log.find(e => e.bookingNumber === id);
    if (logEntry) {
      logEntry.status = 'released';
      logEntry.releasedAt = releasedAt;
    }
  }

  writeJSON(ROSTER_FILE, roster);
  writeJSON(LOG_FILE, log);

  const inCustody = Object.values(roster).filter(i => i.status === 'in_custody').length;
  writeJSON(STATUS_FILE, { inCustody, lastUpdated: nowPST() });

  console.log(`[${nowPST()}] Done. ${newBookings.length} new, ${released.length} released. ${inCustody} in custody.`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
