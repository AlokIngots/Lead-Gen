import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LeadsAPI } from '../api'
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
  red: '#e02020', redBg: '#fde8e8',
  muted: '#9399b8',
}

const STAT_CONFIG = [
  { key: 'total_assigned',  label: 'Total Assigned',  color: C.blue,   bg: C.blueBg   },
  { key: 'pending_contact', label: 'Pending Contact', color: C.amber,  bg: C.amberBg  },
  { key: 'awaiting_reply',  label: 'Awaiting Reply',  color: C.teal,   bg: C.tealBg   },
  { key: 'engaged',         label: 'Engaged',         color: C.orange, bg: C.orangeBg },
  { key: 'qualified',       label: 'Qualified',       color: C.green,  bg: C.greenBg  },
]

const TABS = [
  { key: 'urgent',          label: 'Urgent',          color: C.red,    bg: C.redBg    },
  { key: 'recent_leads',    label: 'New Leads',       color: C.blue,   bg: C.blueBg   },
  { key: 'high_score',      label: 'High Priority',   color: C.orange, bg: C.orangeBg },
  { key: 'needs_followup',  label: 'Needs Follow-up', color: C.amber,  bg: C.amberBg  },
]

/* ── stat card ── */
function MiniStat({ label, value, color, bg }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value" style={{ color }}>{value}</div>
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', background: color,
          }} />
        </div>
      </div>
    </div>
  )
}

/* ── lead row ── */
function LeadRow({ lead, isUrgent }) {
  return (
    <tr>
      <td>
        <Link to={`/leads/${lead.id}`} style={{ fontWeight: 600, color: '#141626', textDecoration: 'none' }}>
          {lead.company_name}
        </Link>
      </td>
      <td>{lead.contact_name || <span className="muted">--</span>}</td>
      <td><SegmentTag segment={lead.industry_segment} /></td>
      <td className="mono" style={{ fontWeight: 700, textAlign: 'right' }}>{lead.score}</td>
      <td><StatusBadge status={lead.status} /></td>
      <td>
        {isUrgent && lead.next_action_at ? (
          <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>
            {new Date(lead.next_action_at).toLocaleDateString()}
          </span>
        ) : lead.created_at ? (
          <span className="muted" style={{ fontSize: 11 }}>
            {new Date(lead.created_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="muted">--</span>
        )}
      </td>
      <td>
        <Link to={`/leads/${lead.id}`} className="btn btn-ghost btn-sm">View</Link>
      </td>
    </tr>
  )
}

/* ── lead table ── */
function LeadTable({ leads, isUrgent }) {
  if (!leads || leads.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>
        No leads in this section
      </div>
    )
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Company</th>
          <th>Contact</th>
          <th>Segment</th>
          <th style={{ textAlign: 'right' }}>Score</th>
          <th>Status</th>
          <th>{isUrgent ? 'Due' : 'Date'}</th>
          <th style={{ width: 60 }}></th>
        </tr>
      </thead>
      <tbody>
        {leads.map(lead => (
          <LeadRow key={lead.id} lead={lead} isUrgent={isUrgent} />
        ))}
      </tbody>
    </table>
  )
}

/* ── skeleton ── */
function TasksSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 className="page-title">My Tasks</h1>
        <div className="page-subtitle">Loading your tasks...</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="stat-card" style={{ minHeight: 80 }}>
            <div style={{ height: 10, width: 70, background: '#eef0f6', borderRadius: 4 }} />
            <div style={{ height: 22, width: 60, background: '#eef0f6', borderRadius: 4, marginTop: 12 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ minHeight: 200 }}>
        <div className="card-header">
          <div style={{ height: 14, width: 120, background: '#eef0f6', borderRadius: 4 }} />
        </div>
        <div className="card-body">
          {[1, 2, 3].map(j => (
            <div key={j} style={{ height: 20, background: '#eef0f6', borderRadius: 4, marginBottom: 12 }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── main page ── */
export default function MyTasks() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('urgent')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: LeadsAPI.myTasks,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  const firstName = (user?.name || '').split(' ')[0] || 'there'

  if (isLoading) return <TasksSkeleton />

  if (isError || !data) {
    return (
      <div>
        <h1 className="page-title">My Tasks</h1>
        <div className="card card-pad" style={{ marginTop: 16, color: C.red, borderColor: C.redBg, background: C.redBg }}>
          Failed to load tasks. Please try refreshing.
        </div>
      </div>
    )
  }

  const { summary } = data
  const activeTabConfig = TABS.find(t => t.key === activeTab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">My Tasks</h1>
          <div className="page-subtitle">Your daily work queue, {firstName}.</div>
        </div>
        <Link to="/leads" className="btn btn-primary btn-sm">All Leads</Link>
      </div>

      {/* ── summary stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {STAT_CONFIG.map(({ key, label, color, bg }) => (
          <MiniStat
            key={key}
            label={label}
            value={(summary[key] || 0).toLocaleString()}
            color={color}
            bg={bg}
          />
        ))}
      </div>

      {/* ── tab bar ── */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: 0, padding: 0, borderBottom: '1.5px solid #e4e7f0' }}>
          {TABS.map(tab => {
            const count = (data[tab.key] || []).length
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  color: isActive ? tab.color : C.muted,
                  borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
                  transition: 'all .15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px',
                    borderRadius: 8, background: isActive ? tab.bg : '#eef0f6',
                    color: isActive ? tab.color : C.muted,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div>
          <LeadTable
            leads={data[activeTab] || []}
            isUrgent={activeTab === 'urgent'}
          />
        </div>
      </div>
    </div>
  )
}
