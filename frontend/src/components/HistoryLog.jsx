export default function HistoryLog({ entries }) {
  if (!entries || entries.length === 0) {
    return <div className="empty">No history records available.</div>
  }

  // Use bookingDate for bookings, releasedAt for releases
  function eventDate(entry) {
    if (entry.status === 'released' && entry.releasedAt) {
      return entry.releasedAt.split(',')[0].trim()
    }
    return entry.bookingDate || entry.firstSeen?.split(',')[0].trim() || ''
  }

  // Sort: released entries by releasedAt desc, booked entries by bookingDate desc
  // Use a combined sort key for the flat list
  function sortKey(entry) {
    const d = entry.status === 'released' && entry.releasedAt
      ? new Date(entry.releasedAt)
      : new Date(entry.bookingDate || 0)
    return isNaN(d) ? 0 : d.getTime()
  }

  const sorted = [...entries].sort((a, b) => sortKey(b) - sortKey(a))

  // Group by event date
  const groups = []
  const seen = {}
  for (const entry of sorted) {
    const date = eventDate(entry)
    if (!seen[date]) {
      seen[date] = []
      groups.push({ date, entries: seen[date] })
    }
    seen[date].push(entry)
  }

  return (
    <div className="history-log">
      <div className="log-count">{entries.length} record{entries.length !== 1 ? 's' : ''}</div>
      {groups.map(({ date, entries: group }) => (
        <div key={date}>
          <div className="date-separator">{date}</div>
          {group.map((entry, i) => {
            const isReleased = entry.status === 'released'
            return (
              <div key={i} className="history-entry">
                <span className={`history-type ${isReleased ? 'history-released' : 'history-booked'}`}>
                  {isReleased ? 'Released' : 'Booked'}
                </span>
                <span className="history-name">{entry.name}</span>
                {entry.facility && <span className="history-facility">{entry.facility}</span>}
                <span className="history-date">
                  {isReleased ? entry.releasedAt : entry.bookingDate}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
