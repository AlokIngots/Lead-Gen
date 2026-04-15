import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CampaignsAPI, TemplatesAPI, UsersAPI } from '../api'
import SegmentTag from '../components/SegmentTag.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

const SEGMENTS = ['all', 'pumps', 'valves', 'pneumatics', 'defense', 'stockholders', 'cnc', 'forging', 'others']
const CHANNELS = [
  { value: 'email',      label: 'Email',      color: '#2355f5', bg: '#eaefff' },
  { value: 'linkedin',   label: 'LinkedIn',   color: '#7132e8', bg: '#f0e8ff' },
  { value: 'whatsapp',   label: 'WhatsApp',   color: '#0b9384', bg: '#e0f5f2' },
  { value: 'call_alert', label: 'Call Alert', color: '#c97c08', bg: '#fcf2dc' },
]
const CONDITIONS = [
  { value: '',                       label: 'No condition' },
  { value: 'email_opened',           label: 'Only if email opened' },
  { value: 'linkedin_connected',     label: 'Only if LinkedIn connected' },
  { value: 'email_opened_2plus',     label: 'Only if email opened 2+ times' },
  { value: 'score_gte_30',           label: 'Only if score ≥ 30' },
]

const TABS = [
  { id: 'all',     label: 'All campaigns' },
  { id: 'builder', label: 'Sequence builder' },
  { id: 'enroll',  label: 'Enroll leads' },
]

function channelMeta(value) {
  return CHANNELS.find(c => c.value === value) || { label: value, color: '#505575', bg: '#eef0f6' }
}

function nextStatus(s) {
  if (s === 'draft' || s === 'paused') return 'active'
  if (s === 'active') return 'paused'
  return 'active'
}

// ---------------- Tab 1: All campaigns ----------------
function CampaignsGrid({ campaigns, onSelect, onNew }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {campaigns.map(c => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className="card"
          style={{ textAlign: 'left', padding: 18, cursor: 'pointer', font: 'inherit' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#141626', margin: 0, lineHeight: 1.3 }}>{c.name}</h3>
            <StatusBadge status={c.status} />
          </div>
          <div style={{ marginBottom: 12 }}><SegmentTag segment={c.segment_filter} /></div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '0 0 14px', minHeight: 32, overflow: 'hidden' }}>
            {c.description || '—'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, paddingTop: 14, borderTop: '1.5px solid #e4e7f0', textAlign: 'center' }}>
            <div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#141626' }}>{c.step_count}</div>
              <div className="stat-label" style={{ fontSize: 9 }}>steps</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#141626' }}>{c.enrolled_count}</div>
              <div className="stat-label" style={{ fontSize: 9 }}>enrolled</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#0ea854' }}>{c.reply_rate}%</div>
              <div className="stat-label" style={{ fontSize: 9 }}>reply</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#7132e8' }}>{c.qualified_count}</div>
              <div className="stat-label" style={{ fontSize: 9 }}>qualified</div>
            </div>
          </div>
        </button>
      ))}
      <button
        onClick={onNew}
        style={{
          background: 'transparent',
          border: '2px dashed #e4e7f0',
          borderRadius: 10,
          padding: 18,
          minHeight: 200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9399b8',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <span style={{ fontSize: 32, lineHeight: 1, marginBottom: 6, fontWeight: 300 }}>+</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>New campaign</span>
      </button>
    </div>
  )
}

function NewCampaignModal({ open, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', segment_filter: 'all', qualification_threshold: 30, description: '',
  })
  const create = useMutation({
    mutationFn: () => CampaignsAPI.create({
      name: form.name,
      segment_filter: form.segment_filter,
      description: form.description,
      status: 'draft',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      onClose()
      setForm({ name: '', segment_filter: 'all', qualification_threshold: 30, description: '' })
    },
  })
  if (!open) return null
  return (
    <ModalShell title="New campaign" onClose={onClose}>
      <Field label="Campaign name">
        <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Industry segment">
        <select className="select" value={form.segment_filter} onChange={e => setForm({ ...form, segment_filter: e.target.value })}>
          {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Qualification threshold (score)">
        <input
          type="number" min={0} max={100} className="input"
          value={form.qualification_threshold}
          onChange={e => setForm({ ...form, qualification_threshold: Number(e.target.value) })}
        />
      </Field>
      <Field label="Description">
        <textarea rows={3} className="textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
      </Field>
      <div className="modal-footer" style={{ marginLeft: -20, marginRight: -20, marginBottom: -20 }}>
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button
          onClick={() => create.mutate()}
          disabled={!form.name || create.isPending}
          className="btn btn-primary"
        >
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </ModalShell>
  )
}

// ---------------- Tab 2: Sequence builder ----------------
function SequenceBuilder({ campaignId, onPickCampaign }) {
  const qc = useQueryClient()
  const [selectedStepId, setSelectedStepId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: CampaignsAPI.list,
  })
  const { data: campaign } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => CampaignsAPI.get(campaignId),
    enabled: !!campaignId,
  })
  const { data: steps = [], isLoading: stepsLoading } = useQuery({
    queryKey: ['campaign-steps', campaignId],
    queryFn: () => CampaignsAPI.steps(campaignId),
    enabled: !!campaignId,
  })

  useEffect(() => {
    if (steps.length && !steps.find(s => s.id === selectedStepId)) {
      setSelectedStepId(steps[0].id)
    }
  }, [steps, selectedStepId])

  const updateStatus = useMutation({
    mutationFn: () => CampaignsAPI.update(campaignId, { ...campaign, status: nextStatus(campaign.status) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId] })
      qc.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })

  const removeStep = useMutation({
    mutationFn: (sid) => CampaignsAPI.removeStep(campaignId, sid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign-steps', campaignId] }),
  })

  if (!campaignId) {
    return (
      <div className="card card-pad">
        <p className="secondary" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>Pick a campaign to edit its sequence:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {campaigns.map(c => (
            <button key={c.id} onClick={() => onPickCampaign(c.id)} className="chip">
              {c.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const selectedStep = steps.find(s => s.id === selectedStepId)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
      {/* Left: step list */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">{campaign?.name || '…'}</h3>
            <div style={{ marginTop: 6 }}><StatusBadge status={campaign?.status} /></div>
          </div>
          <button
            onClick={() => updateStatus.mutate()}
            disabled={!campaign}
            className="btn btn-ghost btn-sm"
          >
            {campaign?.status === 'active' ? 'Pause' : 'Activate'}
          </button>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stepsLoading && <div className="muted" style={{ fontSize: 12 }}>Loading steps…</div>}
          {!stepsLoading && steps.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No steps yet</div>}
          {steps.map((s, idx) => {
            const m = channelMeta(s.channel)
            const active = s.id === selectedStepId
            return (
              <div
                key={s.id}
                onClick={() => setSelectedStepId(s.id)}
                style={{
                  cursor: 'pointer',
                  border: '1.5px solid',
                  borderColor: active ? '#2355f5' : '#e4e7f0',
                  background: active ? '#eaefff' : '#fff',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span className="seg-tag" style={{ color: m.color, background: m.bg }}>{m.label}</span>
                  <span className="mono muted" style={{ fontSize: 10 }}>Day {s.delay_days}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#141626' }}>Step {idx + 1}</div>
                <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.condition_json?.condition || 'no condition'}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeStep.mutate(s.id) }}
                  style={{ marginTop: 4, fontSize: 10, color: '#e02020', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}
                >delete</button>
              </div>
            )
          })}
          <button
            onClick={() => setAddOpen(true)}
            style={{
              padding: '10px 0',
              fontSize: 12,
              fontWeight: 600,
              background: 'transparent',
              border: '1.5px dashed #e4e7f0',
              borderRadius: 7,
              color: '#9399b8',
              cursor: 'pointer',
              marginTop: 4,
            }}
          >+ Add step</button>
        </div>
      </div>

      {/* Right: step editor */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Step editor</h3>
        </div>
        <div className="card-body">
          {selectedStep
            ? <StepEditor key={selectedStep.id} campaignId={campaignId} step={selectedStep} />
            : <div className="muted" style={{ fontSize: 13 }}>Select a step on the left to edit it.</div>}
        </div>
      </div>

      {addOpen && <AddStepModal campaignId={campaignId} nextOrder={(steps[steps.length - 1]?.step_order || 0) + 1} onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function StepEditor({ campaignId, step }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    channel: step.channel,
    delay_days: step.delay_days,
    template_id: step.template_id || '',
    subject: step.condition_json?.subject || '',
    body: step.condition_json?.body || '',
    condition: step.condition_json?.condition || '',
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', form.channel],
    queryFn: () => TemplatesAPI.list({ channel: form.channel === 'call_alert' ? 'call_script' : form.channel }).catch(() => []),
  })

  const save = useMutation({
    mutationFn: () => CampaignsAPI.updateStep(campaignId, step.id, {
      step_order: step.step_order,
      channel: form.channel,
      delay_days: Number(form.delay_days) || 0,
      delay_hours: 0,
      template_id: form.template_id || null,
      condition_json: {
        subject: form.subject || null,
        body: form.body || null,
        condition: form.condition || null,
      },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign-steps', campaignId] }),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Channel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CHANNELS.map(c => (
            <button
              key={c.value}
              onClick={() => setForm({ ...form, channel: c.value })}
              className={`chip${form.channel === c.value ? ' active' : ''}`}
            >{c.label}</button>
          ))}
        </div>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Day offset">
          <input type="number" min={0} className="input" value={form.delay_days} onChange={e => setForm({ ...form, delay_days: e.target.value })} />
        </Field>
        <Field label="Template">
          <select className="select" value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })}>
            <option value="">— none —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      {form.channel === 'email' && (
        <Field label="Email subject">
          <input className="input" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
        </Field>
      )}
      <Field label="Body">
        <textarea rows={5} className="textarea" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
          placeholder="Use {{contact_name}} and {{company}} as variables" />
      </Field>
      <Field label="Send condition">
        <select className="select" value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}>
          {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn btn-primary">
          {save.isPending ? 'Saving…' : 'Save step'}
        </button>
      </div>
    </div>
  )
}

function AddStepModal({ campaignId, nextOrder, onClose }) {
  const qc = useQueryClient()
  const [channel, setChannel] = useState('email')
  const [day, setDay] = useState(0)
  const create = useMutation({
    mutationFn: () => CampaignsAPI.addStep(campaignId, {
      step_order: nextOrder,
      channel,
      delay_days: Number(day) || 0,
      delay_hours: 0,
      condition_json: {},
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign-steps', campaignId] })
      onClose()
    },
  })
  return (
    <ModalShell title="Add step" onClose={onClose}>
      <Field label="Channel">
        <select className="select" value={channel} onChange={e => setChannel(e.target.value)}>
          {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Day offset">
        <input type="number" min={0} className="input" value={day} onChange={e => setDay(e.target.value)} />
      </Field>
      <div className="modal-footer" style={{ marginLeft: -20, marginRight: -20, marginBottom: -20 }}>
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={() => create.mutate()} disabled={create.isPending} className="btn btn-primary">
          {create.isPending ? 'Adding…' : 'Add step'}
        </button>
      </div>
    </ModalShell>
  )
}

// ---------------- Tab 3: Enroll ----------------
function EnrollTab({ campaignId, onPickCampaign }) {
  const qc = useQueryClient()
  const [filters, setFilters] = useState({
    industry_segment: 'all',
    status: 'raw',
    country: 'all',
    exclude_already_enrolled: true,
    assigned_sc: '',
    min_score: 0,
  })

  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: CampaignsAPI.list })
  const { data: scs = [] } = useQuery({ queryKey: ['users', 'sc'], queryFn: () => UsersAPI.list({ role: 'sc' }) })

  const buildPayload = () => ({
    industry_segment: filters.industry_segment,
    status: filters.status,
    country: filters.country,
    exclude_already_enrolled: filters.exclude_already_enrolled,
    assigned_sc: filters.assigned_sc || null,
    min_score: Number(filters.min_score) || 0,
  })

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['enroll-preview', campaignId, filters],
    queryFn: () => CampaignsAPI.enrollPreview(campaignId, buildPayload()),
    enabled: !!campaignId,
    keepPreviousData: true,
  })

  const enroll = useMutation({
    mutationFn: () => CampaignsAPI.enroll(campaignId, buildPayload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      qc.invalidateQueries({ queryKey: ['enroll-preview', campaignId] })
    },
  })

  if (!campaignId) {
    return (
      <div className="card card-pad">
        <p className="secondary" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>Pick a campaign to enroll leads into:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {campaigns.map(c => (
            <button key={c.id} onClick={() => onPickCampaign(c.id)} className="chip">
              {c.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const selectedCampaign = campaigns.find(c => c.id === campaignId)
  const wouldEnroll = preview?.would_enroll ?? 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Filters &mdash; {selectedCampaign?.name}</h3>
          <StatusBadge status={selectedCampaign?.status} />
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Segment">
              <select className="select" value={filters.industry_segment} onChange={e => setFilters({ ...filters, industry_segment: e.target.value })}>
                {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="select" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
                <option value="all">all</option>
                <option value="raw">raw</option>
                <option value="emailed">emailed</option>
                <option value="engaged">engaged</option>
              </select>
            </Field>
            <Field label="Country">
              <input className="input" value={filters.country} onChange={e => setFilters({ ...filters, country: e.target.value })} placeholder="all or specific country" />
            </Field>
            <Field label="Min score">
              <input type="number" min={0} max={100} className="input" value={filters.min_score} onChange={e => setFilters({ ...filters, min_score: e.target.value })} />
            </Field>
            <Field label="Assign SC">
              <select className="select" value={filters.assigned_sc} onChange={e => setFilters({ ...filters, assigned_sc: e.target.value })}>
                <option value="">— none —</option>
                {scs.map(u => <option key={u.emp_code} value={u.emp_code}>{u.emp_code} — {u.name}</option>)}
              </select>
            </Field>
            <Field label="Exclude already enrolled">
              <select className="select" value={filters.exclude_already_enrolled ? 'yes' : 'no'} onChange={e => setFilters({ ...filters, exclude_already_enrolled: e.target.value === 'yes' })}>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </Field>
          </div>
          <ul className="secondary" style={{ fontSize: 11.5, listStyle: 'disc', paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
            <li>Leads matching the filters will be added to <code>lead_drip_state</code> at step 0.</li>
            <li>Enrollment runs immediately — first touchpoint is queued for now.</li>
            <li>If an SC is selected, all matched leads are reassigned to that SC.</li>
            <li>Already-enrolled leads are skipped when the toggle is on.</li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="card-header">
          <h3 className="card-title">Matching leads</h3>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div className="mono" style={{ fontSize: 36, fontWeight: 700, color: '#141626', letterSpacing: '-1px', lineHeight: 1 }}>
            {previewLoading ? '…' : (preview?.matched ?? 0).toLocaleString()}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            <span className="mono">{wouldEnroll.toLocaleString()}</span> new ·{' '}
            <span className="mono">{(preview?.matched - wouldEnroll || 0).toLocaleString()}</span> already enrolled
          </div>
          <button
            onClick={() => enroll.mutate()}
            disabled={enroll.isPending || wouldEnroll === 0}
            className="btn btn-primary btn-lg"
            style={{ marginTop: 'auto', width: '100%' }}
          >
            {enroll.isPending ? 'Enrolling…' : `Enroll ${wouldEnroll.toLocaleString()} leads`}
          </button>
          {enroll.isSuccess && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#0ea854', fontWeight: 600 }}>
              Enrolled {enroll.data.enrolled} (skipped {enroll.data.skipped_existing} duplicates)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------- Shared UI bits ----------------
function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function ModalShell({ title, children, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3 className="card-title">{title}</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

// ---------------- Page ----------------
export default function Campaigns() {
  const [tab, setTab] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)

  const { data: campaigns = [], isLoading, isError } = useQuery({
    queryKey: ['campaigns'],
    queryFn: CampaignsAPI.list,
  })

  const openBuilder = (id) => { setSelectedId(id); setTab('builder') }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Campaigns</h1>
          <div className="page-subtitle">Build sequences, enroll leads, track engagement.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="tab-bar">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`tab${tab === t.id ? ' active' : ''}`}
              >{t.label}</button>
            ))}
          </div>
          <button onClick={() => setNewOpen(true)} className="btn btn-primary">+ New campaign</button>
        </div>
      </div>

      {isLoading && <div className="muted">Loading…</div>}
      {isError && <div style={{ color: '#e02020' }}>Failed to load campaigns.</div>}

      {!isLoading && !isError && tab === 'all' && (
        <CampaignsGrid campaigns={campaigns} onSelect={openBuilder} onNew={() => setNewOpen(true)} />
      )}
      {!isLoading && tab === 'builder' && (
        <SequenceBuilder campaignId={selectedId} onPickCampaign={setSelectedId} />
      )}
      {!isLoading && tab === 'enroll' && (
        <EnrollTab campaignId={selectedId} onPickCampaign={setSelectedId} />
      )}

      <NewCampaignModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}
