import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Header from './Header'

const TABS = ['Summary', 'Trends', 'Charges', 'Demographics', 'Detention', 'Recidivism']

// Pierce County, WA — 2020 Decennial Census (P8/P9)
const CENSUS_POP = {
  'White (non-Hispanic)':          569815,
  'Black/African American':         66006,
  'Hispanic/Latino':               111811,
  'Asian':                          63460,
  'American Indian/Alaska Native':  12777,
  'Pacific Islander':               18844,
  'Two or More Races':             116126,
  'Other':                          48471,
}
const CENSUS_TOTAL = 921130

function normalizeRace(e) {
  const eth = (e.Ethnicity || e.ethnicity || '').toUpperCase()
  if (eth.includes('HISPANIC') && !eth.includes('NON')) return 'Hispanic/Latino'
  const r = (e.Race || e.race || '').toUpperCase()
  if (r.includes('WHITE'))                                          return 'White (non-Hispanic)'
  if (r.includes('BLACK'))                                          return 'Black/African American'
  if (r.includes('ASIAN'))                                          return 'Asian'
  if (r.includes('INDIAN') || r.includes('ALASKA'))                return 'American Indian/Alaska Native'
  if (r.includes('PACIFIC') || r.includes('HAWAIIAN') || r.includes('ISLANDER')) return 'Pacific Islander'
  if (r.includes('MULTI') || r.includes('TWO') || r.includes('MORE')) return 'Two or More Races'
  if (r && r !== 'UNKNOWN' && r !== '')                            return 'Other'
  return null
}

function HBar({ label, value, max, count }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div className="hbar-row">
      <div className="hbar-label">{label}</div>
      <div className="hbar-track"><div className="hbar-fill" style={{ width: `${pct}%` }} /></div>
      <div className="hbar-count">{typeof count === 'number' ? count.toLocaleString() : count}</div>
    </div>
  )
}

function SBox({ value, label, sub }) {
  return (
    <div className="sbox">
      <div className="sbox-val">{value}</div>
      <div className="sbox-label">{label}</div>
      {sub && <div className="sbox-sub">{sub}</div>}
    </div>
  )
}

function parseStay(e) {
  if (e.status !== 'released' || !e.releasedAt || !e.bookingDate) return null
  const rel = new Date(e.releasedAt)
  const book = new Date(e.bookingDate)
  if (isNaN(rel) || isNaN(book)) return null
  const d = (rel - book) / 86400000
  return d >= 0 && d < 1000 ? d : null
}

function parseHt(h) {
  const m = String(h || '').match(/(\d+)'(\d+)/)
  return m ? +m[1] * 12 + +m[2] : null
}

function parseWt(w) {
  const m = String(w || '').match(/(\d+)/)
  return m ? +m[1] : null
}

function fmtHt(i) { return `${Math.floor(i / 12)}'${i % 12}"` }

function fmtDays(d) {
  if (d < 1) return `${Math.round(d * 24)}h`
  return `${d.toFixed(1)}d`
}

function fmtDuration(days) {
  if (days == null) return '—'
  const mins = Math.round(days * 1440)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function med(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function top(obj, n = 20) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
}

function compute(log) {
  if (!log.length) return null
  const released = log.filter(e => e.status === 'released')
  const stays = released.map(parseStay).filter(d => d !== null)

  const byMonth = {}
  for (const e of log) {
    if (!e.bookingDate) continue
    const parts = e.bookingDate.split('/')
    if (parts.length < 3) continue
    const k = `${parts[2]}-${parts[0].padStart(2, '0')}`
    byMonth[k] = (byMonth[k] || 0) + 1
  }

  const chargeCt = {}
  for (const e of log)
    for (const c of (e.charges || []))
      if (c.charge) chargeCt[c.charge] = (chargeCt[c.charge] || 0) + 1

  const facCt = {}
  for (const e of log) {
    const f = e.facility || 'Unknown'
    facCt[f] = (facCt[f] || 0) + 1
  }

  const raceCt = {}, genderCt = {}
  for (const e of log) {
    const r = e.Race || e.race || 'Unknown'
    const g = e.Gender || e.gender || e.Sex || e.sex || 'Unknown'
    raceCt[r] = (raceCt[r] || 0) + 1
    genderCt[g] = (genderCt[g] || 0) + 1
  }

  // Day of week from bookingDate
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const byDow = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
  for (const e of log) {
    if (!e.bookingDate) continue
    const d = new Date(e.bookingDate)
    if (!isNaN(d)) byDow[DOW[d.getDay()]]++
  }

  const stayByCh = {}
  for (const e of released) {
    const d = parseStay(e)
    if (d === null) continue
    for (const c of (e.charges || []))
      if (c.charge && !/^WA\d+/i.test(c.charge)) {
        stayByCh[c.charge] = stayByCh[c.charge] || []
        stayByCh[c.charge].push(d)
      }
  }
  const detention = Object.entries(stayByCh)
    .filter(([, a]) => a.length >= 3)
    .map(([charge, a]) => ({ charge, avg: a.reduce((x, y) => x + y, 0) / a.length, med: med(a), n: a.length }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 25)

  // Release day of week
  const byReleaseDow = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
  for (const e of released) {
    if (!e.releasedAt) continue
    const d = new Date(e.releasedAt)
    if (!isNaN(d)) byReleaseDow[DOW[d.getDay()]]++
  }

  // Time served stats
  const relWithStay = released
    .map(e => ({ name: e.name, days: parseStay(e) }))
    .filter(e => e.days !== null)
    .sort((a, b) => a.days - b.days)
  const pctUnder24h = stays.length ? ((stays.filter(d => d < 1).length / stays.length) * 100).toFixed(1) : 0
  const shortestStay = relWithStay[0] || null
  const longestHistorical = relWithStay[relWithStay.length - 1] || null
  const longestCurrent = log
    .filter(e => e.status === 'in_custody' && e.bookingDate)
    .map(e => {
      const booked = new Date(e.bookingDate)
      return { name: e.name, bookingDate: e.bookingDate, days: !isNaN(booked) ? (Date.now() - booked) / 86400000 : 0 }
    })
    .sort((a, b) => b.days - a.days)[0] || null

  // Recidivism with charges
  const nameCt = {}
  for (const e of log) if (e.name) nameCt[e.name] = (nameCt[e.name] || 0) + 1
  const nameCharges = {}
  for (const e of log) {
    if (!e.name || nameCt[e.name] < 2) continue
    if (!nameCharges[e.name]) nameCharges[e.name] = new Set()
    for (const c of (e.charges || [])) if (c.charge) nameCharges[e.name].add(c.charge)
  }
  const repeats = Object.entries(nameCt)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ name, n, charges: nameCharges[name] ? [...nameCharges[name]].join(', ') : '—' }))

  const totalCharges = log.reduce((s, e) => s + (e.charges?.length || 0), 0)

  const raceCensus = {}
  for (const e of log) {
    const r = normalizeRace(e)
    if (r) raceCensus[r] = (raceCensus[r] || 0) + 1
  }
  const raceCensusTotal = Object.values(raceCensus).reduce((a, b) => a + b, 0)

  return {
    total: log.length,
    inCustody: log.filter(e => e.status === 'in_custody').length,
    released: released.length,
    avgStay: stays.length ? stays.reduce((a, b) => a + b, 0) / stays.length : 0,
    medStay: med(stays),
    avgCharges: log.length ? totalCharges / log.length : 0,
    byMonth: Object.entries(byMonth).sort(),
    byDow, byReleaseDow,
    chargeCt, facCt, raceCt, genderCt,
    detention,
    pctUnder24h, shortestStay, longestHistorical, longestCurrent,
    repeats,
    uniqueNames: Object.keys(nameCt).length,
    raceCensus, raceCensusTotal,
  }
}

export default function DeepStatsPage() {
  const [log, setLog] = useState([])
  const [status, setStatus] = useState(null)
  const [tab, setTab] = useState('Summary')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('./data/change_log.json').then(r => r.json()),
      fetch('./data/status.json').then(r => r.json()),
    ]).then(([l, s]) => { setLog(l); setStatus(s); setLoading(false) })
  }, [])

  const s = useMemo(() => compute(log), [log])

  return (
    <div className="app">
      <Header />
      <div className="controls">
        <div className="filter-tabs">
          <Link to="/">In Custody</Link>
          <Link to="/released">Released</Link>
          <Link to="/history">History</Link>
          <Link to="/stats">Stats</Link>
        </div>
      </div>

      {loading || !s ? (
        <div className="loading">Loading stats...</div>
      ) : (
        <div className="stats-wrap">
          <div className="stats-meta">{s.total.toLocaleString()} total bookings · {status?.lastUpdated}</div>
          <div className="stats-tabs">
            {TABS.map(t => (
              <button key={t} className={`stats-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {tab === 'Summary' && <SummaryTab s={s} />}
          {tab === 'Trends' && <TrendsTab s={s} />}
          {tab === 'Charges' && <ChargesTab s={s} />}
          {tab === 'Demographics' && <DemographicsTab s={s} />}
          {tab === 'Detention' && <DetentionTab s={s} />}
          {tab === 'Recidivism' && <RecidivismTab s={s} />}
        </div>
      )}
    </div>
  )
}

function SummaryTab({ s }) {
  const facEntries = Object.entries(s.facCt).sort((a, b) => b[1] - a[1])
  const facMax = facEntries[0]?.[1] || 1
  return (
    <>
      <div className="sboxes">
        <SBox value={s.total.toLocaleString()} label="Total Bookings" />
        <SBox value={s.inCustody.toLocaleString()} label="In Custody" />
        <SBox value={s.released.toLocaleString()} label="Releases Tracked" />
        <SBox value={s.avgStay.toFixed(1)} label="Avg Stay (days)" sub={`median ${s.medStay.toFixed(1)}d`} />
        <SBox value={s.avgCharges.toFixed(1)} label="Avg Charges / Inmate" />
      </div>
      <h3 className="stats-h3">Facility</h3>
      {facEntries.map(([f, n]) => <HBar key={f} label={f} value={n} max={facMax} count={n} />)}
    </>
  )
}

function TrendsTab({ s }) {
  const maxM = Math.max(...s.byMonth.map(([, v]) => v), 1)
  const dowEntries = Object.entries(s.byDow)
  const maxDow = Math.max(...dowEntries.map(([, v]) => v), 1)
  const relDowEntries = Object.entries(s.byReleaseDow)
  const maxRelDow = Math.max(...relDowEntries.map(([, v]) => v), 1)
  return (
    <>
      <h3 className="stats-h3">Bookings by Month</h3>
      {s.byMonth.map(([m, n]) => <HBar key={m} label={m} value={n} max={maxM} count={n} />)}
      <h3 className="stats-h3 stats-h3-gap">Bookings by Day of Week</h3>
      {dowEntries.map(([day, n]) => <HBar key={day} label={day} value={n} max={maxDow} count={n} />)}
      <h3 className="stats-h3 stats-h3-gap">Releases by Day of Week</h3>
      {relDowEntries.map(([day, n]) => <HBar key={day} label={day} value={n} max={maxRelDow} count={n} />)}
    </>
  )
}

function ChargesTab({ s }) {
  const tc = top(s.chargeCt, 25)
  const max = tc[0]?.[1] || 1
  return (
    <>
      <h3 className="stats-h3">Most Common Charges (top 25)</h3>
      {tc.map(([c, n]) => <HBar key={c} label={c} value={n} max={max} count={n} />)}
    </>
  )
}

function DemographicsTab({ s }) {
  const raceE = top(s.raceCt, 10)
  const genderE = top(s.genderCt, 5)
  const unknownPct = s.total > 0 ? ((1 - s.raceCensusTotal / s.total) * 100).toFixed(0) : 0

  const compRows = Object.entries(CENSUS_POP)
    .map(([group, countyPop]) => {
      const jailCount = s.raceCensus[group] || 0
      const jailPct = s.raceCensusTotal > 0 ? jailCount / s.raceCensusTotal * 100 : 0
      const countyPct = countyPop / CENSUS_TOTAL * 100
      const ratio = countyPct > 0 ? jailPct / countyPct : null
      return { group, jailPct, countyPct, ratio, jailCount }
    })
    .filter(r => r.jailCount > 0)
    .sort((a, b) => (b.ratio || 0) - (a.ratio || 0))

  return (
    <>
      <h3 className="stats-h3">Race (raw LINX values)</h3>
      {raceE.map(([r, n]) => <HBar key={r} label={r} value={n} max={s.total} count={n} />)}
      <h3 className="stats-h3 stats-h3-gap">Gender</h3>
      {genderE.map(([g, n]) => <HBar key={g} label={g} value={n} max={s.total} count={n} />)}

      <h3 className="stats-h3 stats-h3-gap">Representation vs. County Population</h3>
      <div className="stats-note" style={{ marginBottom: '0.75rem' }}>
        2020 U.S. Census · ratio = jail % ÷ county % · 1.00× is proportionate · {unknownPct}% of bookings excluded (no race/ethnicity data)
      </div>
      <table className="stats-table">
        <thead>
          <tr>
            <th>Race/Ethnicity</th>
            <th>Jail %</th>
            <th>County %</th>
            <th>Ratio</th>
          </tr>
        </thead>
        <tbody>
          {compRows.map(({ group, jailPct, countyPct, ratio }) => (
            <tr key={group}>
              <td>{group}</td>
              <td>{jailPct.toFixed(1)}%</td>
              <td>{countyPct.toFixed(1)}%</td>
              <td style={{
                color: ratio >= 2 ? '#E88A6A' : ratio >= 1.25 ? '#C5A87A' : ratio < 0.75 ? '#5A7A66' : '#8AAA96',
                fontWeight: ratio >= 1.5 ? 500 : 400,
              }}>
                {ratio == null ? '—' : `${ratio.toFixed(2)}×`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function DetentionTab({ s }) {
  return (
    <>
      <div className="sboxes" style={{ marginBottom: '2rem' }}>
        <div className="sbox">
          <div className="sbox-val">{s.pctUnder24h}%</div>
          <div className="sbox-label">Released in &lt;24 Hours</div>
          <div className="sbox-sub">{s.stays?.filter ? '' : ''}{s.released > 0 ? `${Math.round(s.released * s.pctUnder24h / 100)} of ${s.released}` : '—'}</div>
        </div>
        {s.shortestStay && (
          <div className="sbox">
            <div className="sbox-val">{fmtDuration(s.shortestStay.days)}</div>
            <div className="sbox-label">Shortest Stay</div>
            <div className="sbox-sub">{s.shortestStay.name}</div>
          </div>
        )}
        {s.longestHistorical && (
          <div className="sbox">
            <div className="sbox-val">{fmtDuration(s.longestHistorical.days)}</div>
            <div className="sbox-label">Longest Historical Stay</div>
            <div className="sbox-sub">{s.longestHistorical.name}</div>
          </div>
        )}
        {s.longestCurrent && (
          <div className="sbox">
            <div className="sbox-val">{fmtDuration(s.longestCurrent.days)}</div>
            <div className="sbox-label">Current Longest Stay</div>
            <div className="sbox-sub">In since {s.longestCurrent.bookingDate}</div>
          </div>
        )}
      </div>

      {!s.detention.length ? (
        <div className="stats-note">Not enough release data yet for charge breakdown.</div>
      ) : (
        <>
          <h3 className="stats-h3">Avg Detention by Charge</h3>
          <div className="stats-note">Released bookings only · ≥3 data points per charge</div>
          <table className="stats-table">
            <thead><tr><th>Charge</th><th>Avg</th><th>Median</th><th>n</th></tr></thead>
            <tbody>
              {s.detention.map(r => (
                <tr key={r.charge}>
                  <td>{r.charge}</td>
                  <td>{fmtDays(r.avg)}</td>
                  <td>{fmtDays(r.med)}</td>
                  <td>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

function RecidivismTab({ s }) {
  const pct = s.uniqueNames ? ((s.repeats.length / s.uniqueNames) * 100).toFixed(1) : 0
  return (
    <>
      <div className="stats-note stats-note-gap">
        Repeat rate {pct}% · {s.repeats.length} repeat individuals · {s.uniqueNames.toLocaleString()} unique tracked
      </div>
      {s.repeats.length === 0 ? (
        <div className="stats-note">No repeat bookings yet.</div>
      ) : (
        <table className="stats-table">
          <thead><tr><th>Name</th><th>Bookings</th><th>Charges</th></tr></thead>
          <tbody>
            {s.repeats.slice(0, 30).map(r => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.n}</td>
                <td style={{ color: '#8AAA96', fontSize: '0.72rem' }}>{r.charges}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

