const SEGMENT_COLORS = {
  pumps:        { color: '#2355f5', bg: '#eaefff' },
  valves:       { color: '#0b9384', bg: '#e0f5f2' },
  pneumatics:   { color: '#0ea854', bg: '#e6f7ee' },
  defense:      { color: '#505575', bg: '#eef0f6' },
  stockholders: { color: '#c97c08', bg: '#fcf2dc' },
  cnc:          { color: '#e8610a', bg: '#fdeede' },
  forging:      { color: '#e02020', bg: '#fde8e8' },
  others:       { color: '#7132e8', bg: '#f0e8ff' },
  all:          { color: '#505575', bg: '#eef0f6' },
}

export default function SegmentTag({ segment }) {
  if (!segment) return null
  const s = SEGMENT_COLORS[segment] || SEGMENT_COLORS.others
  return (
    <span className="seg-tag" style={{ color: s.color, background: s.bg }}>
      {segment}
    </span>
  )
}
