const STATUS_COLORS = {
  new:          { color: '#505575', bg: '#eef0f6' },
  raw:          { color: '#505575', bg: '#eef0f6' },
  contacted:    { color: '#2355f5', bg: '#eaefff' },
  emailed:      { color: '#2355f5', bg: '#eaefff' },
  engaged:      { color: '#e8610a', bg: '#fdeede' },
  qualified:    { color: '#0ea854', bg: '#e6f7ee' },
  proposal:     { color: '#7132e8', bg: '#f0e8ff' },
  negotiation:  { color: '#c97c08', bg: '#fcf2dc' },
  won:          { color: '#0ea854', bg: '#e6f7ee' },
  lost:         { color: '#e02020', bg: '#fde8e8' },
  nurture:      { color: '#0b9384', bg: '#e0f5f2' },
  disqualified: { color: '#9399b8', bg: '#eef0f6' },
  transferred:  { color: '#7132e8', bg: '#f0e8ff' },
  draft:        { color: '#505575', bg: '#eef0f6' },
  active:       { color: '#0ea854', bg: '#e6f7ee' },
  paused:       { color: '#c97c08', bg: '#fcf2dc' },
  completed:    { color: '#2355f5', bg: '#eaefff' },
  archived:     { color: '#9399b8', bg: '#eef0f6' },
}

export default function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.new
  return (
    <span className="badge" style={{ background: s.bg, color: s.color }}>
      <span className="badge-dot" style={{ background: s.color }} />
      {status}
    </span>
  )
}
