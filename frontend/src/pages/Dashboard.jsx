import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie,
} from 'recharts'
import { AnalyticsAPI, LeadsAPI } from '../api'
import { useAuth } from '../context/AuthContext.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import SegmentTag from '../components/SegmentTag.jsx'

/* ── colour tokens ── */
const C = {
  blue: '#2355f5', blueBg: '#eaefff',
  green: '#0ea854', greenBg: '#e6f7ee',
  orange: '#e8610a', orangeBg: '#fdeede',
  purple: '#7132e8', purpleBg: '#f0e8ff',
  teal: '#0b9384', tealBg: '#e0f5f2',
  amber: '#c97c08', amberBg: '#fcf2dc',
  muted: '#9399b8',
}

const STAT_CONFIG = [
  { key: 'total_leads',  label: 'Total Leads',  color: C.blue,   bg: C.blueBg,   icon: '📋' },
  { key: 'in_drip',      label: 'In Drip',      color: C.teal,   bg: C.tealBg,   icon: '💧' },
  { key: 'emailed',      label: 'Emailed',       color: C.amber,  bg: C.amberBg,  icon: '📧' },
  { key: 'engaged',      label: 'Engaged',       color: C.orange, bg: C.orangeBg, icon: '🤝' },
  { key: 'qualified',    label: 'Qualified',     color: C.green,  bg: C.greenBg,  icon: '✅' },
  { key: 'transferred',  label: 'Transferred',   color: C.purple, bg: C.purpleBg, icon: '🚀' },
]

/* ── shared section wrapper ── */
function Section({ title, children, right, noPad }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
        {right}
      </div>
      <div className={noPad ? '' : 'card-body'}>{children}</div>
    </section>
  )
}

/* ── stat card ── */
function MetricCard({ label, value, color, bg, icon, pct }) {
  return (
    <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value" style={{ color }}>{value}</div>
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>
          {icon}
        </div>
      </div>
      {pct !== undefined && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            height: 4, background: '#eef0f6', borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${Math.min(pct, 100)}%`,
              background: color, borderRadius: 2,
              transition: 'width .6s ease',
            }} />
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontWeight: 600 }}>
            {pct}% of total
          </div>
        </div>
      )}
    </div>
  )
}

/* ── conversion mini-card ── */
function ConversionRate({ label, value, color }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '14px 8px',
      background: '#f7f8fb', borderRadius: 8,
    }}>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-.5px' }}>
        {value}%
      </div>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 4 }}>
        {label}
      </div>
    </div>
  )
}

/* ── leads by segment bar chart ── */
const SEG_COLORS = [C.blue, C.green, C.orange, C.purple, C.teal, C.amber, '#e02020', '#9399b8']

function SegmentBarChart({ segments }) {
  const data = segments
    .filter(s => s.total > 0)
    .sort((a, b) => b.total - a.total)
    .map(s => ({ name: s.segment.charAt(0).toUpperCase() + s.segment.slice(1), total: s.total }))
  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>
        No segment data yet
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 40, 200)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 8 }}>
        <XAxis type="number" hide />
        <YAxis dataKey="name" type="category" width={100} tickLine={false} axisLine={false}
               style={{ fontSize: 11, fill: '#505575', fontFamily: 'Plus Jakarta Sans' }} />
        <Tooltip
          formatter={(val) => [`${val.toLocaleString()} leads`, '']}
          cursor={{ fill: '#f7f8fb' }}
          contentStyle={{ borderRadius: 8, border: '1.5px solid #e4e7f0', fontSize: 12 }}
        />
        <Bar dataKey="total" radius={[4, 4, 4, 4]} barSize={22}>
          <LabelList dataKey="total" position="right"
            formatter={v => v.toLocaleString()}
            style={{ fontSize: 11, fill: '#505575', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }} />
          {data.map((_, i) => <Cell key={i} fill={SEG_COLORS[i % SEG_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ── status breakdown donut ── */
const STATUS_COLORS = {
  raw: '#9399b8', emailed: '#2355f5', engaged: '#e8610a',
  qualified: '#0ea854', transferred: '#7132e8',
}

function StatusDonut({ rows, total }) {
  const data = rows.map(r => ({
    name: r.status.charAt(0).toUpperCase() + r.status.slice(1),
    value: r.count,
    color: STATUS_COLORS[r.status] || '#9399b8',
  }))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ flex: '0 0 180px' }}>
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={data} dataKey="value" cx="50%" cy="50%"
              innerRadius={50} outerRadius={80} paddingAngle={2}
              stroke="none"
            >
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip
              formatter={(val) => [`${val.toLocaleString()} leads`, '']}
              contentStyle={{ borderRadius: 8, border: '1.5px solid #e4e7f0', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: '#505575' }}>{d.name}</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: '#141626' }}>
              {d.value.toLocaleString()}
            </span>
            <span className="mono" style={{ fontSize: 11, color: C.muted, width: 40, textAlign: 'right' }}>
              {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── segment details table ── */
function SegmentTable({ segments }) {
  const data = segments.filter(s => s.total > 0).sort((a, b) => b.total - a.total)
  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>
        No segment data
      </div>
    )
  }
  const grandTotal = data.reduce((s, r) => s + r.total, 0)
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Segment</th>
          <th style={{ textAlign: 'right' }}>Leads</th>
          <th style={{ textAlign: 'right' }}>Share</th>
          <th style={{ width: 90 }}>Distribution</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r, i) => {
          const share = grandTotal > 0 ? ((r.total / grandTotal) * 100) : 0
          return (
            <tr key={r.segment}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: SEG_COLORS[i % SEG_COLORS.length], flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{r.segment}</span>
                </div>
              </td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                {r.total.toLocaleString()}
              </td>
              <td className="mono" style={{ textAlign: 'right', color: C.muted }}>
                {share.toFixed(1)}%
              </td>
              <td>
                <div style={{ height: 6, background: '#eef0f6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${share}%`,
                    background: SEG_COLORS[i % SEG_COLORS.length], borderRadius: 3,
                    transition: 'width .6s ease',
                  }} />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ── active campaigns ── */
function ActiveCampaigns({ campaigns }) {
  if (campaigns.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
        <div style={{ fontSize: 13, color: C.muted }}>No active campaigns</div>
        <Link to="/campaigns" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
          Create campaign
        </Link>
      </div>
    )
  }
  return (
    <div>
      {campaigns.map((c, i) => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px',
          borderBottom: i === campaigns.length - 1 ? 'none' : '1.5px solid #e4e7f0',
          transition: 'background .12s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#f9fafd'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: C.blueBg, color: C.blue,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, flexShrink: 0,
          }}>
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#141626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
              <SegmentTag segment={c.segment} />
              <StatusBadge status={c.status} />
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#141626' }}>
              {c.enrolled.toLocaleString()}
            </div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px', color: C.muted, marginTop: 2, fontWeight: 600 }}>
              enrolled
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: c.reply_rate > 0 ? C.green : C.muted }}>
              {c.reply_rate}%
            </div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px', color: C.muted, marginTop: 2, fontWeight: 600 }}>
              reply
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── SC performance table ── */
function SCTable({ rows }) {
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
        <div style={{ fontSize: 13, color: C.muted }}>No SC performance data</div>
      </div>
    )
  }
  const maxAssigned = Math.max(...rows.map(r => r.assigned), 1)
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Sales Coordinator</th>
          <th style={{ textAlign: 'right' }}>Assigned</th>
          <th style={{ textAlign: 'right' }}>Emailed</th>
          <th style={{ textAlign: 'right' }}>Engaged</th>
          <th style={{ textAlign: 'right' }}>Qualified</th>
          <th style={{ textAlign: 'right' }}>Reply Rate</th>
          <th style={{ width: 100 }}>Progress</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const progress = maxAssigned > 0 ? (r.assigned / maxAssigned) * 100 : 0
          return (
            <tr key={r.emp_code}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: C.blueBg, color: C.blue,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>
                    {(r.name || '?').charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
                    <div className="mono" style={{ fontSize: 10, color: C.muted }}>{r.emp_code}</div>
                  </div>
                </div>
              </td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{r.assigned.toLocaleString()}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{r.emailed.toLocaleString()}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{r.engaged.toLocaleString()}</td>
              <td className="mono" style={{ textAlign: 'right', color: C.purple, fontWeight: 700 }}>{r.qualified.toLocaleString()}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                <span style={{
                  color: r.reply_rate >= 10 ? C.green : r.reply_rate >= 5 ? C.amber : C.muted,
                }}>
                  {r.reply_rate}%
                </span>
              </td>
              <td>
                <div style={{ height: 6, background: '#eef0f6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${progress}%`,
                    background: C.blue, borderRadius: 3,
                    transition: 'width .6s ease',
                  }} />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ── auto-assign card (admin only) ── */
const SEGMENTS = ['pumps', 'valves', 'pneumatics', 'defense', 'stockholders', 'cnc', 'forging', 'others']

function AutoAssignCard({ unassignedCount, onAssigned }) {
  const [segment, setSegment] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleAssign = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const body = {}
      if (segment) body.segment = segment
      const res = await LeadsAPI.autoAssign(body)
      setResult(res)
      if (onAssigned) onAssigned()
    } catch (err) {
      setError(err.response?.data?.detail || 'Auto-assign failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">Lead Auto-Assignment</h2>
        <div className="mono" style={{ fontSize: 12, color: C.orange, fontWeight: 700 }}>
          {unassignedCount.toLocaleString()} unassigned
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <select
            value={segment}
            onChange={e => setSegment(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e4e7f0',
              fontSize: 13, color: '#505575', background: '#fff', minWidth: 180,
            }}
          >
            <option value="">All segments</option>
            {SEGMENTS.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={handleAssign}
            disabled={loading || unassignedCount === 0}
          >
            {loading ? 'Assigning...' : 'Auto-Assign Leads'}
          </button>
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: '#fde8e8', color: '#e02020', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#141626', marginBottom: 10 }}>
              Assigned {result.total_assigned.toLocaleString()} leads
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(result.distribution).map(([code, count]) => (
                <div key={code} style={{
                  padding: '8px 14px', borderRadius: 8, background: C.blueBg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80,
                }}>
                  <span className="mono" style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{code}</span>
                  <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: C.blue }}>{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* ── skeleton loader ── */
function DashboardSkeleton({ firstName }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 className="page-title">Welcome back, {firstName}</h1>
        <div className="page-subtitle">Loading your pipeline...</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="stat-card" style={{ minHeight: 90 }}>
            <div style={{ height: 10, width: 70, background: '#eef0f6', borderRadius: 4 }} />
            <div style={{ height: 22, width: 80, background: '#eef0f6', borderRadius: 4, marginTop: 12 }} />
            <div style={{ height: 4, width: '100%', background: '#eef0f6', borderRadius: 2, marginTop: 14 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {[1, 2].map(i => (
          <div key={i} className="card" style={{ minHeight: 200 }}>
            <div className="card-header">
              <div style={{ height: 14, width: 120, background: '#eef0f6', borderRadius: 4 }} />
            </div>
            <div className="card-body">
              {[1, 2, 3].map(j => (
                <div key={j} style={{ height: 20, background: '#eef0f6', borderRadius: 4, marginBottom: 12 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── main dashboard ── */
export default function Dashboard() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: AnalyticsAPI.dashboard,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  const firstName = (user?.name || '').split(' ')[0] || 'there'
  const updated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'

  if (isLoading) return <DashboardSkeleton firstName={firstName} />

  if (isError || !data) {
    return (
      <div>
        <h1 className="page-title">Dashboard</h1>
        <div className="card card-pad" style={{ marginTop: 16, color: '#e02020', borderColor: '#fde8e8', background: '#fde8e8' }}>
          Failed to load dashboard data. Please try refreshing.
        </div>
      </div>
    )
  }

  const { stats, funnel, segments, active_campaigns, sc_performance } = data

  // compute conversion rates
  const emailRate = stats.total_leads > 0 ? ((stats.emailed / stats.total_leads) * 100).toFixed(1) : '0.0'
  const qualRate = stats.total_leads > 0 ? ((stats.qualified / stats.total_leads) * 100).toFixed(1) : '0.0'
  const engageRate = stats.emailed > 0 ? ((stats.engaged / stats.emailed) * 100).toFixed(1) : '0.0'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Welcome back, {firstName}</h1>
          <div className="page-subtitle">Here is what is happening across your pipeline today.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="mono" style={{ fontSize: 11, color: C.muted }}>
            updated {updated} · auto 60s
          </div>
          <Link to="/leads" className="btn btn-primary btn-sm">View Leads</Link>
        </div>
      </div>

      {/* ── stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
        {STAT_CONFIG.map(({ key, label, color, bg, icon }) => (
          <MetricCard
            key={key}
            label={label}
            value={stats[key].toLocaleString()}
            color={color}
            bg={bg}
            icon={icon}
            pct={key !== 'total_leads' && stats.total_leads > 0
              ? +((stats[key] / stats.total_leads) * 100).toFixed(1)
              : undefined}
          />
        ))}
      </div>

      {/* ── auto-assign (admin only) ── */}
      {user?.role === 'admin' && (
        <AutoAssignCard
          unassignedCount={stats.unassigned ?? stats.total_leads - (sc_performance || []).reduce((s, r) => s + r.assigned, 0)}
          onAssigned={() => queryClient.invalidateQueries({ queryKey: ['analytics-dashboard'] })}
        />
      )}

      {/* ── conversion rates ── */}
      <div className="card card-pad">
        <div style={{ display: 'flex', gap: 14 }}>
          <ConversionRate label="Email Rate" value={emailRate} color={C.blue} />
          <ConversionRate label="Engage Rate" value={engageRate} color={C.orange} />
          <ConversionRate label="Qualification Rate" value={qualRate} color={C.green} />
        </div>
      </div>

      {/* ── two-column: segments + status breakdown ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Section title="Leads by Segment">
          <SegmentBarChart segments={segments} />
        </Section>
        <Section title="Status Breakdown">
          <StatusDonut rows={funnel} total={stats.total_leads} />
        </Section>
      </div>

      {/* ── two-column: campaigns + top segments detail ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Section
          title="Active Campaigns"
          right={<Link to="/campaigns" className="btn btn-ghost btn-sm">All campaigns ›</Link>}
          noPad
        >
          <ActiveCampaigns campaigns={active_campaigns} />
        </Section>
        <Section title="Segment Details" noPad>
          <SegmentTable segments={segments} />
        </Section>
      </div>

      {/* ── SC performance ── */}
      <Section title="SC Performance" noPad>
        <SCTable rows={sc_performance} />
      </Section>
    </div>
  )
}
