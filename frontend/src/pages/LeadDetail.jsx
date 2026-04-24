import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LeadsAPI, EventsAPI, DripAPI, CrmAPI } from '../api'
import StatusBadge from '../components/StatusBadge.jsx'
import SegmentTag from '../components/SegmentTag.jsx'

const SQUARE_COLORS = ['#2355f5', '#0ea854', '#e8610a', '#7132e8', '#0b9384', '#c97c08', '#e02020']
function colorForCompany(name) {
  if (!name) return SQUARE_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return SQUARE_COLORS[h % SQUARE_COLORS.length]
}

const STATUS_PILLS = [
  { label: 'Raw',         value: 'raw' },
  { label: 'Emailed',     value: 'emailed' },
  { label: 'Engaged',     value: 'engaged' },
  { label: 'Qualified',   value: 'qualified' },
  { label: 'Transferred', value: 'transferred' },
  { label: 'Recycled',    value: 'recycled' },
]

const EVENT_TYPE_OPTIONS = [
  { label: 'Call connected',  value: 'call_connected' },
  { label: 'Call no answer',  value: 'call_no_answer' },
  { label: 'Email sent',      value: 'email_sent' },
  { label: 'Meeting set',     value: 'meeting_set' },
  { label: 'WhatsApp sent',   value: 'whatsapp_sent' },
  { label: 'Note',            value: 'note' },
]

const CHANNEL_FOR_TYPE = (t = '') => {
  const s = t.toLowerCase()
  if (s.includes('email')) return 'email'
  if (s.includes('linkedin')) return 'linkedin'
  if (s.includes('whatsapp') || s.includes('wa_')) return 'whatsapp'
  if (s.includes('call') || s.includes('phone') || s.includes('meeting')) return 'call'
  if (s.includes('note')) return 'note'
  return 'default'
}

const CHANNEL_COLORS = {
  email:    '#2355f5',
  linkedin: '#7132e8',
  whatsapp: '#0b9384',
  call:     '#c97c08',
  note:     '#9399b8',
  default:  '#2355f5',
}
const CHANNEL_GLYPH = {
  email:    'E',
  linkedin: 'L',
  whatsapp: 'W',
  call:     'C',
  note:     'N',
  default:  'E',
}

function formatRelative(iso) {
  if (!iso) return ''
  const then = new Date(iso)
  if (isNaN(then.getTime())) return ''
  const now = new Date()
  const diffMs = now - then
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.round(hr / 24)
  if (days < 7) return `${days}d ago`
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

function KV({ label, value }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div className="field-value">{value || '—'}</div>
    </div>
  )
}

function ScoreCircle({ score }) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0))
  const color = clamped >= 70 ? 'var(--green)' : clamped >= 40 ? 'var(--orange)' : '#9399b8'
  const label = clamped >= 70 ? 'Qualified / Above threshold' : clamped >= 40 ? 'Engaged' : 'Raw'
  const r = 52
  const c = 2 * Math.PI * r
  const dash = (clamped / 100) * c
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div className="score-circle">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#eef0f6" strokeWidth="10" />
          <circle
            cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="score-circle-num mono">{clamped}</div>
      </div>
      <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  const qc = useQueryClient()

  const [evType, setEvType] = useState('call_connected')
  const [evNotes, setEvNotes] = useState('')
  const [crmMsg, setCrmMsg] = useState(null)

  const { data: lead, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => LeadsAPI.get(id),
  })

  const { data: eventsResp } = useQuery({
    queryKey: ['events', id],
    queryFn: () => EventsAPI.list({ lead_id: id }),
    enabled: !!id,
  })
  const events = (Array.isArray(eventsResp) ? eventsResp : eventsResp?.items) || []
  const sortedEvents = [...events].sort((a, b) => {
    const ta = new Date(a.created_at || a.event_at || 0).getTime()
    const tb = new Date(b.created_at || b.event_at || 0).getTime()
    return tb - ta
  })

  const { data: drip, isError: dripError } = useQuery({
    queryKey: ['drip', id],
    queryFn: async () => {
      try { return await DripAPI.get(id) } catch (e) { return null }
    },
    enabled: !!id,
    retry: false,
  })

  const updateMutation = useMutation({
    mutationFn: (patch) => LeadsAPI.patch(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] }),
  })

  const logEventMutation = useMutation({
    mutationFn: (body) => EventsAPI.log(body),
    onSuccess: () => {
      setEvNotes('')
      qc.invalidateQueries({ queryKey: ['events', id] })
      qc.invalidateQueries({ queryKey: ['lead', id] })
    },
  })

  const dripPause = useMutation({
    mutationFn: () => DripAPI.pause(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drip', id] }),
  })
  const dripResume = useMutation({
    mutationFn: () => DripAPI.resume(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drip', id] }),
  })

  const crmHandoff = useMutation({
    mutationFn: () => CrmAPI.handoff(id),
    onSuccess: () => {
      setCrmMsg({ ok: true, text: 'Pushed to CRM' })
      qc.invalidateQueries({ queryKey: ['lead', id] })
    },
    onError: (err) => {
      setCrmMsg({ ok: false, text: `Failed: ${err?.response?.data?.detail || err?.message || 'error'}` })
    },
  })

  if (isLoading) {
    return <div className="muted" style={{ textAlign: 'center', padding: 60 }}>Loading…</div>
  }
  if (isError || !lead) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div className="muted" style={{ marginBottom: 12 }}>Lead not found</div>
        <Link to="/leads" className="btn btn-ghost">&lsaquo; Back to leads</Link>
      </div>
    )
  }

  const initials = (lead.company_name || '?').trim().slice(0, 2).toUpperCase()
  const score = Number(lead.score) || 0

  const breakdown = (() => {
    const map = new Map()
    for (const ev of events) {
      const t = ev.event_type || ev.action || 'event'
      const cur = map.get(t) || { count: 0, sum: 0, hasDelta: false }
      cur.count += 1
      if (typeof ev.score_delta === 'number') {
        cur.sum += ev.score_delta
        cur.hasDelta = true
      }
      map.set(t, cur)
    }
    return Array.from(map.entries())
  })()

  const onLogActivity = (e) => {
    e.preventDefault()
    if (!evType) return
    logEventMutation.mutate({ lead_id: id, event_type: evType, notes: evNotes })
  }

  const dripExists = !dripError && drip && (drip.id || drip.campaign_name || drip.total_steps)
  const dripStatus = drip?.status || 'active'
  const totalSteps = Number(drip?.total_steps) || 0
  const currentStep = Number(drip?.current_step) || 0

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/leads" className="muted">All leads</Link>
        <span className="muted"> / </span>
        <span style={{ color: 'var(--text)', fontWeight: 700 }}>{lead.company_name}</span>
      </div>

      <div className="lead-detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
              <div
                className="company-square mono"
                style={{
                  background: colorForCompany(lead.company_name),
                  width: 64, height: 64, borderRadius: 12, fontSize: 22, fontWeight: 700,
                }}
              >
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-.3px' }}>
                  {lead.company_name}
                </h1>
                <div className="secondary" style={{ marginTop: 4, fontSize: 13 }}>
                  {lead.contact_name || '—'}{lead.designation ? ` · ${lead.designation}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  {lead.email && <span>✉ {lead.email}</span>}
                  {lead.phone && <span>☎ {lead.phone}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <SegmentTag segment={lead.industry_segment} />
                  <StatusBadge status={lead.status} />
                  {lead.source && (
                    <span className="seg-tag" style={{ color: 'var(--blue)', background: 'var(--blue-light)' }}>
                      {lead.source}
                    </span>
                  )}
                  {lead.dnc_flag && <span className="seg-tag" style={{ color: 'var(--red)', background: 'var(--red-light)' }}>DNC</span>}
                  {lead.bounce_flag && <span className="seg-tag" style={{ color: 'var(--amber)', background: 'var(--amber-light)' }}>BOUNCE</span>}
                </div>
              </div>
            </div>

            <hr className="divider" style={{ margin: '24px 0' }} />

            <div className="kv-grid">
              <KV label="Country" value={lead.country} />
              <KV label="Source" value={lead.source} />
              <KV label="Grade Interest" value={lead.grade_interest} />
              <KV label="SC Assigned" value={lead.assigned_sc} />
              <KV label="Campaign" value={lead.campaign_name || lead.campaign} />
              <KV label="Last Activity" value={lead.last_activity_at ? formatRelative(lead.last_activity_at) : null} />
              <KV label="Employee Count" value={lead.employee_count} />
              <KV label="Import Batch" value={lead.import_batch} />
            </div>

            <div style={{ marginTop: 24 }}>
              <div className="field-label">Status</div>
              <div className="status-pill-row">
                {STATUS_PILLS.map(p => {
                  const active = (lead.status || '').toLowerCase() === p.value
                  return (
                    <button
                      key={p.value}
                      type="button"
                      className={`status-pill${active ? ' active' : ''}`}
                      onClick={() => updateMutation.mutate({ status: p.value })}
                      disabled={updateMutation.isPending}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Activity timeline</h2>
              <span className="muted" style={{ fontSize: 11 }}>{sortedEvents.length} events</span>
            </div>
            <div className="card-body">
              {sortedEvents.length === 0 ? (
                <div className="muted" style={{ fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
                  No activity recorded yet
                </div>
              ) : (
                <div className="timeline">
                  {sortedEvents.map((ev, i) => {
                    const channel = CHANNEL_FOR_TYPE(ev.event_type || ev.action)
                    const color = CHANNEL_COLORS[channel] || CHANNEL_COLORS.default
                    const glyph = CHANNEL_GLYPH[channel] || 'E'
                    const ts = ev.created_at || ev.event_at
                    const delta = ev.score_delta
                    return (
                      <div className="timeline-item" key={ev.id || i}>
                        <div className="timeline-dot" style={{ background: color }}>{glyph}</div>
                        <div className="timeline-body">
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                              {(ev.event_type || ev.action || 'event').replace(/_/g, ' ')}
                            </div>
                            <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{formatRelative(ts)}</div>
                          </div>
                          {(ev.notes || ev.description) && (
                            <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                              {ev.notes || ev.description}
                            </div>
                          )}
                          {typeof delta === 'number' && delta !== 0 && (
                            <span
                              className="mono"
                              style={{
                                display: 'inline-block', marginTop: 6, padding: '2px 7px',
                                fontSize: 10, fontWeight: 700, borderRadius: 4,
                                background: delta > 0 ? 'var(--green-light)' : 'var(--red-light)',
                                color: delta > 0 ? 'var(--green)' : 'var(--red)',
                              }}
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <hr className="divider" style={{ margin: '20px 0 16px' }} />

              <form onSubmit={onLogActivity} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <select className="select" value={evType} onChange={e => setEvType(e.target.value)}>
                  {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <textarea
                  className="input"
                  placeholder="Notes…"
                  rows={2}
                  value={evNotes}
                  onChange={e => setEvNotes(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={logEventMutation.isPending}>
                    {logEventMutation.isPending ? 'Logging…' : 'Log activity'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Lead score</h2>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ScoreCircle score={score} />
              <div>
                <div className="field-label" style={{ marginBottom: 8 }}>Score breakdown</div>
                {breakdown.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12 }}>No events yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {breakdown.map(([type, info]) => (
                      <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{type.replace(/_/g, ' ')}</span>
                        <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {info.hasDelta ? (info.sum >= 0 ? `+${info.sum}` : info.sum) : `×${info.count}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid var(--border)', paddingTop: 12 }}>
                <span className="field-label" style={{ margin: 0 }}>Segment threshold</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>70 pts</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Drip status</h2>
            </div>
            <div className="card-body">
              {!dripExists ? (
                <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                  Not enrolled in any drip campaign
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{drip.campaign_name || 'Drip campaign'}</div>
                  <div className="drip-progress">
                    {Array.from({ length: totalSteps }).map((_, i) => {
                      let bg = '#eef0f6'
                      if (i < currentStep) bg = 'var(--green)'
                      else if (i === currentStep) bg = 'var(--blue)'
                      return <div key={i} className="drip-step" style={{ background: bg }} />
                    })}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Step {currentStep} of {totalSteps} complete
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {dripStatus === 'paused' ? (
                      <button className="btn btn-ghost" onClick={() => dripResume.mutate()} disabled={dripResume.isPending} style={{ flex: 1 }}>
                        Resume
                      </button>
                    ) : (
                      <button className="btn btn-ghost" onClick={() => dripPause.mutate()} disabled={dripPause.isPending} style={{ flex: 1 }}>
                        Pause drip
                      </button>
                    )}
                    <button className="btn btn-ghost" style={{ flex: 1 }}>Re-enroll</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(lead.status || '').toLowerCase() === 'qualified' && (
            <div className="card crm-card">
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', letterSpacing: '.8px' }}>
                  READY TO TRANSFER
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <KV label="SC name" value={lead.assigned_sc} />
                  <KV label="CRM stage" value="New Enquiry" />
                  <KV label="Grade interest" value={lead.grade_interest} />
                </div>
                <button
                  className="btn"
                  style={{ background: 'var(--green)', color: '#fff', borderColor: 'var(--green)', fontWeight: 700, padding: '10px 14px' }}
                  onClick={() => crmHandoff.mutate()}
                  disabled={crmHandoff.isPending}
                >
                  {crmHandoff.isPending ? 'Pushing…' : 'Push to CRM →'}
                </button>
                {crmMsg && (
                  <div style={{ fontSize: 11, color: crmMsg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {crmMsg.text}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Contact details</h2>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className="mono" style={{ color: 'var(--blue)', fontSize: 12, textDecoration: 'none' }}>
                  ✉ {lead.email}
                </a>
              ) : lead.linkedin_url && !lead.has_email ? (
                <div style={{ fontSize: 12, color: '#7132e8', fontStyle: 'italic', fontWeight: 600 }}>
                  ✉ LinkedIn only — email pending
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>✉ —</div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text)' }}>
                ☎ {lead.phone || <span className="muted">—</span>}
              </div>
              {lead.linkedin_url && (
                <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'underline', fontSize: 12 }}>
                  LinkedIn profile
                </a>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid var(--border)', paddingTop: 10 }}>
                <span className="field-label" style={{ margin: 0 }}>WhatsApp eligible</span>
                {score >= 30 ? (
                  <span className="seg-tag" style={{ color: 'var(--green)', background: 'var(--green-light)' }}>✓ Yes</span>
                ) : (
                  <span className="seg-tag" style={{ color: 'var(--red)', background: 'var(--red-light)' }}>⚠ Score too low</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
