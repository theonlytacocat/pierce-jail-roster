import { useState } from 'react'

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
          <div className="card-name">{entry.name}</div>
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
            <div className="card-release-row">Released: {entry.releasedAt}</div>
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
                    {c.violation || c['charge description'] || c['offense'] || c['charge'] || JSON.stringify(c)}
                  </div>
                  {(c.bail || c['bail amount'] || c.bondAmount) && (
                    <div className="charge-bail">
                      Bail: {c.bail || c['bail amount'] || c.bondAmount}
                    </div>
                  )}
                  {(c['court date'] || c.courtDate || c.nextCourtDate) && (
                    <div className="charge-court">
                      Court: {c['court date'] || c.courtDate || c.nextCourtDate}
                    </div>
                  )}
                  {(c.agency || c.arrestAgency || c['arresting agency']) && (
                    <div className="charge-agency">
                      Agency: {c.agency || c.arrestAgency || c['arresting agency']}
                    </div>
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
