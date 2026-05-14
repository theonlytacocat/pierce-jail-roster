import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Header from './Header'

const TABS = ['Summary', 'Trends', 'Charges', 'Demographics', 'Detention', 'Recidivism']

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
      if (c.charge) {
        stayByCh[c.charge] = stayByCh[c.charge] || []
        stayByCh[c.charge].push(d)
      }
  }
  const detention = Object.entries(stayByCh)
    .filter(([, a]) => a.length >= 3)
    .map(([charge, a]) => ({ charge, avg: a.reduce((x, y) => x + y, 0) / a.length, med: med(a), n: a.length }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 25)

  const nameCt = {}
  for (const e of log) if (e.name) nameCt[e.name] = (nameCt[e.name] || 0) + 1
  const repeats = Object.entries(nameCt).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])

  const totalCharges = log.reduce((s, e) => s + (e.charges?.length || 0), 0)

  return {
    total: log.length,
    inCustody: log.filter(e => e.status === 'in_custody').length,
    released: released.length,
    avgStay: stays.length ? stays.reduce((a, b) => a + b, 0) / stays.length : 0,
    medStay: med(stays),
    avgCharges: log.length ? totalCharges / log.length : 0,
    byMonth: Object.entries(byMonth).sort(),
    byDow,
    chargeCt, facCt, raceCt, genderCt,
    detention, repeats,
    uniqueNames: Object.keys(nameCt).length,
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
  return (
    <>
      <h3 className="stats-h3">Bookings by Month</h3>
      {s.byMonth.map(([m, n]) => <HBar key={m} label={m} value={n} max={maxM} count={n} />)}
      <h3 className="stats-h3 stats-h3-gap">Bookings by Day of Week</h3>
      {dowEntries.map(([day, n]) => <HBar key={day} label={day} value={n} max={maxDow} count={n} />)}
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
  return (
    <>
      <h3 className="stats-h3">Race</h3>
      {raceE.map(([r, n]) => <HBar key={r} label={r} value={n} max={s.total} count={n} />)}
      <h3 className="stats-h3 stats-h3-gap">Gender</h3>
      {genderE.map(([g, n]) => <HBar key={g} label={g} value={n} max={s.total} count={n} />)}
    </>
  )
}

function DetentionTab({ s }) {
  if (!s.detention.length) return <div className="stats-note">Not enough release data yet.</div>
  return (
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
          <thead><tr><th>Name</th><th>Bookings</th></tr></thead>
          <tbody>
            {s.repeats.slice(0, 30).map(([name, n]) => (
              <tr key={name}><td>{name}</td><td>{n}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

