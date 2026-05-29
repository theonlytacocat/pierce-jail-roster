// One-time script: strip WA statute rows from charges in existing data files.
// Statute codes (WA2700000...) were stored as charges by the old parser before
// the filter was added to parseDetail(). Released entries never get re-backfilled
// so this is the only way to clean them up.
//
// Run: node scripts/cleanup-statutes.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

const isStatute = c => c.charge && /^WA\d+/i.test(c.charge);

function strip(charges) {
  if (!Array.isArray(charges)) return charges;
  return charges.filter(c => !isStatute(c));
}

const roster = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'roster.json'), 'utf-8'));
const log    = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'change_log.json'), 'utf-8'));

let rFixed = 0, lFixed = 0;

for (const id of Object.keys(roster)) {
  const before = roster[id].charges?.length ?? 0;
  roster[id].charges = strip(roster[id].charges);
  if ((roster[id].charges?.length ?? 0) < before) rFixed++;
}

for (const entry of log) {
  const before = entry.charges?.length ?? 0;
  entry.charges = strip(entry.charges);
  if ((entry.charges?.length ?? 0) < before) lFixed++;
}

fs.writeFileSync(path.join(DATA_DIR, 'roster.json'),    JSON.stringify(roster));
fs.writeFileSync(path.join(DATA_DIR, 'change_log.json'), JSON.stringify(log));

console.log(`Done. Cleaned ${rFixed} roster entries, ${lFixed} log entries.`);
