export default function StatCard({ label, value, hint, sub, delta, deltaPositive }) {
  const subText = sub ?? hint
  const accentClass = deltaPositive === false ? 'accent-neg' : 'accent-pos'

  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {(subText || delta != null) && (
        <div className="stat-sub">
          {delta != null && <span className={accentClass}>{delta}</span>}
          {delta != null && subText && ' '}
          {subText}
        </div>
      )}
    </div>
  )
}
