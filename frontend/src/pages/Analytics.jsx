import { useQuery } from '@tanstack/react-query'
import { AnalyticsAPI } from '../api'
import StatCard from '../components/StatCard.jsx'
import SegmentTag from '../components/SegmentTag.jsx'

const STAGE_COLORS = {
  new:          '#9399b8',
  contacted:    '#2355f5',
  qualified:    '#0ea854',
  proposal:     '#7132e8',
  negotiation:  '#c97c08',
  won:          '#0ea854',
  lost:         '#e02020',
  nurture:      '#0b9384',
  disqualified: '#9399b8',
}

export default function Analytics() {
  const { data: summary }  = useQuery({ queryKey: ['summary'],  queryFn: AnalyticsAPI.summary })
  const { data: funnel }   = useQuery({ queryKey: ['funnel'],   queryFn: AnalyticsAPI.funnel })
  const { data: segments } = useQuery({ queryKey: ['segments'], queryFn: AnalyticsAPI.segments })

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title">Analytics</h1>
        <div className="page-subtitle">Pipeline performance across stages and segments.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total leads" value={summary?.total_leads?.toLocaleString() ?? '—'} />
        <StatCard label="Qualified"   value={summary?.qualified?.toLocaleString() ?? '—'} />
        <StatCard label="Won"         value={summary?.won?.toLocaleString() ?? '—'} />
        <StatCard label="DNC"         value={summary?.dnc?.toLocaleString() ?? '—'} />
        <StatCard label="Bounced"     value={summary?.bounced?.toLocaleString() ?? '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Funnel</h2>
          </div>
          <div className="card-body">
            {(funnel?.stages || []).map(s => {
              const pct = funnel?.total ? Math.round((s.count / funnel.total) * 100) : 0
              const color = STAGE_COLORS[s.status] || '#2355f5'
              return (
                <div key={s.status} className="funnel-row">
                  <div className="funnel-meta">
                    <span className="name">{s.status}</span>
                    <span className="val">{s.count.toLocaleString()} ({pct}%)</span>
                  </div>
                  <div className="funnel-track">
                    <div className="funnel-fill" style={{ width: `${pct}%`, background: color }}>
                      {pct > 8 && `${pct}%`}
                    </div>
                  </div>
                </div>
              )
            })}
            {(!funnel?.stages || funnel.stages.length === 0) && (
              <div className="muted" style={{ fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No funnel data</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">By segment</h2>
          </div>
          <div style={{ marginBottom: -1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Segment</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Qualified</th>
                  <th style={{ textAlign: 'right' }}>Won</th>
                </tr>
              </thead>
              <tbody>
                {(segments || []).map(row => (
                  <tr key={row.segment}>
                    <td><SegmentTag segment={row.segment} /></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{row.total.toLocaleString()}</td>
                    <td className="mono" style={{ textAlign: 'right', color: '#0ea854', fontWeight: 700 }}>{row.qualified.toLocaleString()}</td>
                    <td className="mono" style={{ textAlign: 'right', color: '#7132e8', fontWeight: 700 }}>{row.won.toLocaleString()}</td>
                  </tr>
                ))}
                {(!segments || segments.length === 0) && (
                  <tr><td colSpan="4" style={{ textAlign: 'center', color: '#9399b8', padding: 24 }}>No segment data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
