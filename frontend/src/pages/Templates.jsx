import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TemplatesAPI } from '../api'
import SegmentTag from '../components/SegmentTag.jsx'

const CHANNEL_COLORS = {
  email:       { color: '#2355f5', bg: '#eaefff' },
  linkedin:    { color: '#7132e8', bg: '#f0e8ff' },
  whatsapp:    { color: '#0b9384', bg: '#e0f5f2' },
  sms:         { color: '#c97c08', bg: '#fcf2dc' },
  call_script: { color: '#e8610a', bg: '#fdeede' },
}
const CHANNELS = ['email', 'linkedin', 'whatsapp', 'sms', 'call_script']
const SEGMENTS = ['', 'pumps', 'valves', 'pneumatics', 'defense', 'stockholders', 'cnc', 'forging', 'others']

function ChannelBadge({ channel }) {
  const c = CHANNEL_COLORS[channel] || { color: '#505575', bg: '#eef0f6' }
  return <span className="seg-tag" style={{ color: c.color, background: c.bg }}>{channel}</span>
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function TemplateModal({ initial, onClose }) {
  const qc = useQueryClient()
  const editing = !!initial?.id
  const [form, setForm] = useState({
    name: initial?.name || '',
    channel: initial?.channel || 'email',
    segment: initial?.segment || '',
    subject: initial?.subject || '',
    body: initial?.body || '',
  })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        channel: form.channel,
        subject: form.subject || null,
        body: form.body,
        segment: form.segment || null,
        active: true,
      }
      return editing
        ? TemplatesAPI.update(initial.id, payload)
        : TemplatesAPI.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      onClose()
    },
  })

  const remove = useMutation({
    mutationFn: () => TemplatesAPI.remove(initial.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      onClose()
    },
  })

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3 className="card-title">{editing ? 'Edit template' : 'New template'}</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }}>✕</button>
        </div>
        <div className="modal-body">
          <Field label="Name">
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Channel">
              <select className="select" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Segment">
              <select className="select" value={form.segment} onChange={e => setForm({ ...form, segment: e.target.value })}>
                {SEGMENTS.map(s => <option key={s} value={s}>{s || '— none —'}</option>)}
              </select>
            </Field>
          </div>
          {form.channel === 'email' && (
            <Field label="Subject">
              <input className="input" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            </Field>
          )}
          <Field label="Body">
            <textarea rows={6} className="textarea" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
              placeholder="Use {{contact_name}} and {{company}}" />
          </Field>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            {editing && (
              <button onClick={() => remove.mutate()} disabled={remove.isPending} className="btn btn-danger">
                Delete
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button onClick={() => save.mutate()} disabled={!form.name || !form.body || save.isPending} className="btn btn-primary">
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Templates() {
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const { data: templates = [], isLoading, isError } = useQuery({
    queryKey: ['templates'],
    queryFn: () => TemplatesAPI.list(),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Templates</h1>
          <div className="page-subtitle">Reusable message templates by channel.</div>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary">+ New template</button>
      </div>

      {isLoading && <div className="muted">Loading…</div>}
      {isError && <div style={{ color: '#e02020' }}>Failed to load templates.</div>}

      {!isLoading && !isError && templates.length === 0 && (
        <div className="card card-pad" style={{ textAlign: 'center', color: '#9399b8', padding: 40 }}>
          No templates yet
        </div>
      )}

      {!isLoading && !isError && templates.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => setEditing(t)}
              className="card"
              style={{ textAlign: 'left', padding: 18, cursor: 'pointer', font: 'inherit' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#141626', margin: 0 }}>{t.name}</h3>
                <ChannelBadge channel={t.channel} />
              </div>
              {t.segment && <div style={{ marginBottom: 10 }}><SegmentTag segment={t.segment} /></div>}
              {t.subject && (
                <div style={{ marginBottom: 8 }}>
                  <div className="field-label">Subject</div>
                  <div style={{ fontSize: 12, color: '#141626', fontWeight: 600 }}>{t.subject}</div>
                </div>
              )}
              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, maxHeight: 60, overflow: 'hidden' }}>
                {t.body ? (t.body.length > 140 ? t.body.slice(0, 140) + '…' : t.body) : '—'}
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && <TemplateModal onClose={() => setCreating(false)} />}
      {editing && <TemplateModal initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
