import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { AnalyticsAPI } from '../api'
import { useAuth } from '../context/AuthContext.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import SegmentTag from '../components/SegmentTag.jsx'

const FUNNEL_COLORS = {
  raw:         '#9399b8',
  emailed:     '#2355f5',
  engaged:     '#e8610a',
  qualified:   '#0ea854',
  transferred: '#7132e8',
}

function Section({ title, children, right }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
        {right}
      </div>
      <div className="card-body">{children}</div>
    </section>
  )
}

function Funnel({ rows }) {
  const max = Math.max(...rows.map(r => r.count), 1)
  return (
    <div>
      {rows.map(r => {
        const width = `${Math.max((r.count / max) * 100, 2)}%`
        return (
          <div key={r.status} className="funnel-row">
            <div className="funnel-meta">
              <span className="name">{r.status}</span>
              <span className="val">{r.count.toLocaleString()} &middot; {r.percent}%</span>
            </div>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width, background: FUNNEL_COLORS[r.status] || '#2355f5' }}>
                {r.count > 0 && r.count.toLocaleString()}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SegmentReplyChart({ segments }) {
  const data = segments
    .filter(s => s.total > 0)
    .map(s => ({ name: s.segment, rate: s.reply_rate, total: s.total }))
  if (data.length === 0) {
    return <div className="muted" style={{ textAlign: 'center', padding: '32px 0', fontSize: 13 }}>No data yet</div>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 36, 200)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 8 }}>
        <XAxis type="number" hide domain={[0, 'dataMax + 5']} />
        <YAxis dataKey="name" type="category" width={92} tickLine={false} axisLine={false}
               style={{ fontSize: 11, fill: '#505575', fontFamily: 'Plus Jakarta Sans' }} />
        <Tooltip
          formatter={(val, _name, props) => [`${val}% · ${props.payload.total.toLocaleString()} leads`, 'reply rate']}
          cursor={{ fill: '#f7f8fb' }}
          contentStyle={{ borderRadius: 8, border: '1.5px solid #e4e7f0', fontSize: 12 }}
        />
        <Bar dataKey="rate" fill="#2355f5" radius={[3, 3, 3, 3]}>
          <LabelList dataKey="total" position="right" style={{ fontSize: 11, fill: '#9399b8', fontFamily: 'JetBrains Mono' }} />
          {data.map((_, i) => <Cell key={i} fill="#2355f5" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function ActiveCampaigns({ campaigns }) {
  if (campaigns.length === 0) {
    return <div className="muted" style={{ textAlign: 'center', padding: '32px 0', fontSize: 13 }}>No active campaigns</div>
  }
  return (
    <div>
      {campaigns.map((c, i) => (
        <div
          key={c.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 0',
            borderTop: i === 0 ? 'none' : '1.5px solid #e4e7f0',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#141626' }}>{c.name}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
              <SegmentTag segment={c.segment} />
              <StatusBadge status={c.status} />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: '#141626' }}>{c.enrolled.toLocaleString()}</div>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>enrolled</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: '#0ea854' }}>{c.reply_rate}%</div>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>reply</div>
          </div>
          <Link to="/campaigns" className="btn btn-ghost btn-sm">View</Link>
        </div>
      ))}
    </div>
  )
}

function SCTable({ rows }) {
  if (rows.length === 0) {
    return <div className="muted" style={{ textAlign: 'center', padding: '32px 0', fontSize: 13 }}>No SC users</div>
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>SC</th>
          <th>Code</th>
          <th style={{ textAlign: 'right' }}>Assigned</th>
          <th style={{ textAlign: 'right' }}>Emailed</th>
          <th style={{ textAlign: 'right' }}>Engaged</th>
          <th style={{ textAlign: 'right' }}>Qualified</th>
          <th style={{ textAlign: 'right' }}>Reply rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.emp_code}>
            <td style={{ fontWeight: 700 }}>{r.name}</td>
            <td className="mono muted">{r.emp_code}</td>
            <td className="mono" style={{ textAlign: 'right' }}>{r.assigned.toLocaleString()}</td>
            <td className="mono" style={{ textAlign: 'right' }}>{r.emailed.toLocaleString()}</td>
            <td className="mono" style={{ textAlign: 'right' }}>{r.engaged.toLocaleString()}</td>
            <td className="mono" style={{ textAlign: 'right', color: '#7132e8', fontWeight: 700 }}>{r.qualified.toLocaleString()}</td>
            <td className="mono" style={{ textAlign: 'right', color: '#0ea854', fontWeight: 700 }}>{r.reply_rate}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatSkeleton() {
  return (
    <div className="stat-card">
      <div style={{ height: 10, width: 70, background: '#eef0f6', borderRadius: 4 }} />
      <div style={{ height: 22, width: 80, background: '#eef0f6', borderRadius: 4, marginTop: 10 }} />
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: AnalyticsAPI.dashboard,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  const updated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'
  const firstName = (user?.name || '').split(' ')[0] || 'there'

  if (isLoading) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Welcome back, {firstName}</h1>
          <div className="page-subtitle">Loading your pipeline…</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
          {Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div>
        <h1 className="page-title">Dashboard</h1>
        <div className="card card-pad" style={{ marginTop: 16, color: '#e02020', borderColor: '#fde8e8', background: '#fde8e8' }}>
          Failed to load dashboard data.
        </div>
      </div>
    )
  }

  const { stats, funnel, segments, active_campaigns, sc_performance } = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Welcome back, {firstName}</h1>
          <div className="page-subtitle">Here is what is happening across your pipeline today.</div>
        </div>
        <div className="muted mono" style={{ fontSize: 11 }}>
          updated {updated} &middot; auto 60s
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
        <StatCard label="Total leads"  value={stats.total_leads.toLocaleString()} />
        <StatCard label="In drip"      value={stats.in_drip.toLocaleString()} />
        <StatCard label="Emailed"      value={stats.emailed.toLocaleString()} />
        <StatCard label="Engaged"      value={stats.engaged.toLocaleString()} />
        <StatCard label="Qualified"    value={stats.qualified.toLocaleString()} />
        <StatCard label="Transferred"  value={stats.transferred.toLocaleString()} />
      </div>

      <Section title="Pipeline funnel">
        <Funnel rows={funnel} />
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Section title="Reply rate by segment">
          <SegmentReplyChart segments={segments} />
        </Section>
        <Section
          title="Active campaigns"
          right={<Link to="/campaigns" className="btn btn-ghost btn-sm">All campaigns &rsaquo;</Link>}
        >
          <ActiveCampaigns campaigns={active_campaigns} />
        </Section>
      </div>

      <Section title="SC performance">
        <div style={{ marginLeft: -16, marginRight: -16, marginBottom: -16 }}>
          <SCTable rows={sc_performance} />
        </div>
      </Section>
    </div>
  )
}
