import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Header from './Header'
import StatBar from './StatBar'

function HBar({ label, value, max, pct }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div className="hbar-row">
      <div className="hbar-label">{label}</div>
      <div className="hbar-track"><div className="hbar-fill" style={{ width: `${width}%` }} /></div>
      <div className="hbar-count">{value.toLocaleString()}{pct != null ? ` · ${pct}%` : ''}</div>
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

export default function StatsPage() {
  const [log, setLog] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('./data/change_log.json').then(r => r.json()),
      fetch('./data/status.json').then(r => r.json()),
    ]).then(([l, s]) => { setLog(l); setStatus(s); setLoading(false) })
  }, [])

  const s = useMemo(() => {
    if (!log.length) return null
    const total = log.length
    const inCustody = log.filter(e => e.status === 'in_custody').length
    const released = log.filter(e => e.status === 'released').length

    const chargeCt = {}
    for (const e of log)
      for (const c of (e.charges || []))
        if (c.charge) chargeCt[c.charge] = (chargeCt[c.charge] || 0) + 1

    const raceCt = {}, sexCt = {}
    for (const e of log) {
      const r = e.Race || e.race || 'Unknown'
      const sx = e.Sex || e.sex || 'Unknown'
      raceCt[r] = (raceCt[r] || 0) + 1
      sexCt[sx] = (sexCt[sx] || 0) + 1
    }

    const topCharges = Object.entries(chargeCt).sort((a, b) => b[1] - a[1]).slice(0, 15)
    const topRaces = Object.entries(raceCt).sort((a, b) => b[1] - a[1]).slice(0, 8)
    const topSex = Object.entries(sexCt).sort((a, b) => b[1] - a[1])

    return { total, inCustody, released, topCharges, topRaces, topSex }
  }, [log])

  return (
    <div className="app">
      <Header />
      {status && <StatBar status={status} />}
      <div className="controls">
        <div className="filter-tabs">
          <Link to="/">In Custody</Link>
          <Link to="/released">Released</Link>
          <Link to="/history">History</Link>
          <Link to="/stats" className="active">Stats</Link>
        </div>
      </div>

      {loading || !s ? (
        <div className="loading">Loading stats...</div>
      ) : (
        <div className="stats-wrap">
          <div className="sboxes">
            <SBox value={s.total.toLocaleString()} label="Total Bookings" />
            <SBox value={s.inCustody.toLocaleString()} label="In Custody" />
            <SBox value={s.released.toLocaleString()} label="Releases Tracked" />
          </div>

          <h3 className="stats-h3">Top Charges</h3>
          {s.topCharges.map(([c, n]) => (
            <HBar key={c} label={c} value={n} max={s.topCharges[0][1]} />
          ))}

          <h3 className="stats-h3 stats-h3-gap">Race</h3>
          {s.topRaces.map(([r, n]) => (
            <HBar key={r} label={r} value={n} max={s.total} pct={((n / s.total) * 100).toFixed(1)} />
          ))}

          <h3 className="stats-h3 stats-h3-gap">Sex</h3>
          {s.topSex.map(([sx, n]) => (
            <HBar key={sx} label={sx} value={n} max={s.total} pct={((n / s.total) * 100).toFixed(1)} />
          ))}
        </div>
      )}
    </div>
  )
}
