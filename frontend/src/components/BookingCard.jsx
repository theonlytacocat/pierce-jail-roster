import { useState } from 'react'

function formatTimeServed(firstSeen, releasedAt) {
  if (!firstSeen || !releasedAt) return null
  const start = new Date(firstSeen)
  const end = new Date(releasedAt)
  if (isNaN(start) || isNaN(end) || end <= start) return null
  const totalMins = Math.floor((end - start) / 60000)
  const days = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins = totalMins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export default function BookingCard({ entry }) {
  const [open, setOpen] = useState(false)
  const isReleased = entry.status === 'released'

  // Extract demographic fields — detail page returns kvPairs merged into entry
  const age      = entry.age      || entry['Age']      || null
  const sex      = entry.sex      || entry['Sex']      || entry['Gender'] || null
  const race     = entry.race     || entry['Race']     || null
  const height   = entry.height   || entry['Height']   || null
  const weight   = entry.weight   || entry['Weight']   || null

  return (
    <div className={`card ${isReleased ? 'card-released' : 'card-custody'}`}>
      <div className="card-header" onClick={() => setOpen(!open)}>
        <div className="card-left">
          <div className="card-name">
            {entry.name}
            {isReleased && formatTimeServed(entry.firstSeen, entry.releasedAt) && (
              <span className="time-served">{formatTimeServed(entry.firstSeen, entry.releasedAt)}</span>
            )}
          </div>
          <div className="card-meta">
            Booking #{entry.bookingNumber}
            {entry.bookingDate && <> &nbsp;·&nbsp; Booked: {entry.bookingDate}</>}
            {entry.facility && <> &nbsp;·&nbsp; {entry.facility}</>}
          </div>
        </div>
        <div className="card-right">
          <span className={`badge ${isReleased ? 'badge-released' : 'badge-custody'}`}>
            {isReleased ? 'Released' : 'In Custody'}
          </span>
          <span className="card-toggle">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="card-body">
          {isReleased && entry.releasedAt && (
            <div className="card-release-row">
              Released: {entry.releasedAt}
              {formatTimeServed(entry.firstSeen, entry.releasedAt) && (
                <span className="time-served-label">Time served: {formatTimeServed(entry.firstSeen, entry.releasedAt)}</span>
              )}
            </div>
          )}

          {(age || sex || race || height || weight) && (
            <div className="card-description">
              {age    && <div className="desc-row"><span>Age</span><span>{age}</span></div>}
              {sex    && <div className="desc-row"><span>Sex</span><span>{sex}</span></div>}
              {race   && <div className="desc-row"><span>Race</span><span>{race}</span></div>}
              {height && <div className="desc-row"><span>Height</span><span>{height}</span></div>}
              {weight && <div className="desc-row"><span>Weight</span><span>{weight}</span></div>}
            </div>
          )}

          {entry.charges && entry.charges.length > 0 && (
            <div className="card-charges">
              <div className="charges-title">Charges ({entry.charges.length})</div>
              {entry.charges.map((c, i) => (
                <div key={i} className="charge-row">
                  <div className="charge-violation">
                    {c.charge || c.violation || c['charge description'] || c['offense'] || JSON.stringify(c)}
                    {c.counts && c.counts !== '1' && <span style={{ opacity: 0.55 }}> ×{c.counts}</span>}
                  </div>
                  {c.bail != null && (
                    <div className="charge-bail">Bail: ${Number(c.bail).toLocaleString()}</div>
                  )}
                  {c.chargingAgency && (
                    <div className="charge-agency">Agency: {c.chargingAgency}</div>
                  )}
                  {c.jurisdiction && (
                    <div className="charge-court">Court: {c.jurisdiction}</div>
                  )}
                  {c.causeNumber && (
                    <div className="charge-court">Case: {c.causeNumber}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
