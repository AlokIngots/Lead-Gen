export default function ScoreBar({ score = 0 }) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0))
  const color =
    clamped >= 70 ? '#0ea854'
    : clamped >= 40 ? '#c97c08'
    : '#e02020'

  return (
    <div className="score-cell">
      <div className="score-track">
        <div className="score-fill" style={{ width: `${clamped}%`, background: color }} />
      </div>
      <span className="score-num">{clamped}</span>
    </div>
  )
}
