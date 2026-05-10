export default function HistoryLog({ entries }) {
  if (!entries || entries.length === 0) {
    return <div className="empty">No history records available.</div>
  }

  return (
    <div className="history-log">
      <div className="log-count">{entries.length} record{entries.length !== 1 ? 's' : ''}</div>
      {entries.map((entry, i) => {
        const isReleased = entry.status === 'released'
        return (
          <div key={i} className="history-entry">
            <span className={`history-type ${isReleased ? 'history-released' : 'history-booked'}`}>
              {isReleased ? 'Released' : 'Booked'}
            </span>
            <span className="history-name">{entry.name}</span>
            {entry.facility && <span className="history-facility">{entry.facility}</span>}
            <span className="history-date">
              {isReleased ? entry.releasedAt : entry.firstSeen}
            </span>
          </div>
        )
      })}
    </div>
  )
}
