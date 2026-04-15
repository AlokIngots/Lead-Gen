import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { LeadsAPI, CampaignsAPI, UsersAPI } from '../api'
import StatusBadge from '../components/StatusBadge.jsx'
import SegmentTag from '../components/SegmentTag.jsx'
import ScoreBar from '../components/ScoreBar.jsx'

const SEGMENTS = ['pumps','valves','pneumatics','defense','stockholders','cnc','forging','others']
const STATUSES = ['raw','new','emailed','engaged','contacted','qualified','transferred','proposal','negotiation','won','lost','nurture','disqualified']

const SQUARE_COLORS = ['#2355f5', '#0ea854', '#e8610a', '#7132e8', '#0b9384', '#c97c08', '#e02020']

function colorForCompany(name) {
  if (!name) return SQUARE_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return SQUARE_COLORS[h % SQUARE_COLORS.length]
}

function Modal({ open, title, onClose, onSubmit, submitLabel = 'Save', submitDisabled = false, children, error }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="card-title">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={submitDisabled} onClick={onSubmit}>{submitLabel}</button>
        </div>
      </div>
    </div>
  )
}

function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

const CSV_COLS = [
  'id','company_name','contact_name','designation','email','phone','city','state',
  'industry_segment','status','score','assigned_sc','source','dnc_flag','bounce_flag',
]

export default function LeadsList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({
    q: '', status: '', industry_segment: '', assigned_sc: '',
    dnc: false, bounce: false,
    page: 1, page_size: 50,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', filters],
    queryFn: () => LeadsAPI.list(filters),
  })

  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [activeModal, setActiveModal] = useState(null)
  const [mutationError, setMutationError] = useState('')

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }))
  const total = data?.total || 0
  const start = total === 0 ? 0 : (filters.page - 1) * filters.page_size + 1
  const end = Math.min(filters.page * filters.page_size, total)

  const visibleIds = useMemo(() => (data?.items || []).map(l => l.id), [data])
  const visibleSelectedCount = visibleIds.filter(id => selectedIds.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected

  const headerCheckRef = useRef(null)
  useEffect(() => {
    if (headerCheckRef.current) headerCheckRef.current.indeterminate = someVisibleSelected
  }, [someVisibleSelected])

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())

  const closeModal = () => { setActiveModal(null); setMutationError('') }

  const bulkPatchMutation = useMutation({
    mutationFn: (body) => LeadsAPI.bulkPatch(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      clearSelection()
      closeModal()
    },
    onError: (err) => setMutationError(err?.response?.data?.detail || err.message || 'Update failed'),
  })

  const enrollMutation = useMutation({
    mutationFn: ({ campaignId, ids }) => CampaignsAPI.enroll(campaignId, { lead_ids: ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      clearSelection()
      closeModal()
    },
    onError: (err) => setMutationError(err?.response?.data?.detail || err.message || 'Enroll failed'),
  })

  const exportSelectedCsv = () => {
    const items = (data?.items || []).filter(l => selectedIds.has(l.id))
    if (items.length === 0) return
    const header = CSV_COLS.join(',')
    const rows = items.map(l => CSV_COLS.map(c => csvEscape(l[c])).join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `leads-${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ---- Modal state ----
  const [scValue, setScValue] = useState('')
  const [campaignValue, setCampaignValue] = useState('')
  const [statusValue, setStatusValue] = useState('')

  useEffect(() => {
    if (activeModal === null) {
      setScValue(''); setCampaignValue(''); setStatusValue('')
    }
  }, [activeModal])

  const usersQuery = useQuery({
    queryKey: ['users', 'sc'],
    queryFn: () => UsersAPI.list().then(d => d).catch(() => []),
    enabled: activeModal === 'sc',
  })
  const campaignsQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => CampaignsAPI.list(),
    enabled: activeModal === 'campaign',
  })

  const scList = useMemo(() => {
    const raw = usersQuery.data
    if (!Array.isArray(raw)) return []
    return raw.filter(u => !u.role || String(u.role).toLowerCase() === 'sc')
  }, [usersQuery.data])

  const campaignList = useMemo(() => {
    const raw = campaignsQuery.data
    if (!Array.isArray(raw)) return []
    const active = raw.filter(c => c.status === 'active')
    return active.length > 0 ? active : raw
  }, [campaignsQuery.data])

  const selectedArray = () => Array.from(selectedIds)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Leads</h1>
          <div className="page-subtitle">
            <span className="mono">{total.toLocaleString()}</span> leads in pipeline
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost">Export</button>
          <button className="btn btn-primary">+ New Lead</button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulk-bar">
          <div className="bulk-bar-label">{selectedIds.size} lead{selectedIds.size === 1 ? '' : 's'} selected</div>
          <div className="bulk-bar-actions">
            <button className="btn" onClick={() => setActiveModal('sc')}>Assign SC</button>
            <button className="btn" onClick={() => setActiveModal('campaign')}>Enroll in Campaign</button>
            <button className="btn" onClick={() => setActiveModal('status')}>Change Status</button>
            <button className="btn" onClick={exportSelectedCsv}>Export CSV</button>
            <button className="btn" onClick={clearSelection}>Clear selection</button>
          </div>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          className="input"
          style={{ width: 260 }}
          placeholder="Search company, contact, email, phone"
          value={filters.q}
          onChange={e => set('q', e.target.value)}
        />
        <select className="select" style={{ width: 160 }} value={filters.industry_segment} onChange={e => set('industry_segment', e.target.value)}>
          <option value="">All segments</option>
          {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" style={{ width: 160 }} value={filters.status} onChange={e => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          className="input"
          style={{ width: 160 }}
          placeholder="Assigned SC"
          value={filters.assigned_sc}
          onChange={e => set('assigned_sc', e.target.value)}
        />
        <button
          className={`chip${filters.dnc ? ' active' : ''}`}
          onClick={() => set('dnc', !filters.dnc)}
        >DNC</button>
        <button
          className={`chip${filters.bounce ? ' active' : ''}`}
          onClick={() => set('bounce', !filters.bounce)}
        >Bounce</button>
      </div>

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  ref={headerCheckRef}
                  type="checkbox"
                  className="row-checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </th>
              <th>Company</th>
              <th>Contact</th>
              <th>Segment</th>
              <th>Status</th>
              <th>Score</th>
              <th>SC</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '36px 0', color: '#9399b8' }}>Loading…</td></tr>
            )}
            {isError && (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '36px 0', color: '#e02020' }}>Failed to load leads</td></tr>
            )}
            {data?.items?.map(lead => {
              const initial = (lead.company_name || '?').trim().charAt(0).toUpperCase()
              const onRowClick = (e) => {
                if (e.target.closest('.no-row-nav')) return
                navigate(`/leads/${lead.id}`)
              }
              return (
                <tr key={lead.id} onClick={onRowClick} style={{ cursor: 'pointer' }}>
                  <td
                    className="no-row-nav"
                    onClick={e => e.stopPropagation()}
                    style={{ width: 40 }}
                  >
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                  <td>
                    <div className="company-cell">
                      <div className="company-square" style={{ background: colorForCompany(lead.company_name) }}>
                        {initial}
                      </div>
                      <div>
                        <div className="company-name">
                          {lead.company_name}
                          {lead.dnc_flag && <span className="seg-tag" style={{ marginLeft: 8, color: '#e02020', background: '#fde8e8' }}>DNC</span>}
                          {lead.bounce_flag && <span className="seg-tag" style={{ marginLeft: 6, color: '#c97c08', background: '#fcf2dc' }}>BOUNCE</span>}
                        </div>
                        <div className="company-meta">{lead.email || lead.phone || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{lead.contact_name || '—'}</div>
                    <div className="company-meta">{lead.designation || ''}</div>
                  </td>
                  <td><SegmentTag segment={lead.industry_segment} /></td>
                  <td><StatusBadge status={lead.status} /></td>
                  <td><ScoreBar score={lead.score} /></td>
                  <td className="mono muted">{lead.assigned_sc || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="table-pagination">
          <div className="info">
            Showing <span className="mono text-pri">{start}</span>–<span className="mono text-pri">{end}</span> of <span className="mono text-pri">{total.toLocaleString()}</span>
          </div>
          <div className="pages">
            <button
              className="btn btn-ghost btn-sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
            >&lsaquo; Prev</button>
            <button className="btn btn-primary btn-sm" style={{ minWidth: 32 }}>{filters.page}</button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={!data || filters.page * filters.page_size >= total}
              onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
            >Next &rsaquo;</button>
          </div>
        </div>
      </div>

      <Modal
        open={activeModal === 'sc'}
        title="Assign Sales Coordinator"
        onClose={closeModal}
        submitLabel={bulkPatchMutation.isPending ? 'Assigning…' : 'Assign'}
        submitDisabled={!scValue || bulkPatchMutation.isPending}
        onSubmit={() => {
          setMutationError('')
          bulkPatchMutation.mutate({ ids: selectedArray(), assigned_sc: scValue })
        }}
        error={mutationError}
      >
        <div>
          <label className="field-label">Sales Coordinator</label>
          {usersQuery.isLoading ? (
            <div className="muted">Loading users…</div>
          ) : scList.length > 0 ? (
            <select className="select" value={scValue} onChange={e => setScValue(e.target.value)}>
              <option value="">Select an SC…</option>
              {scList.map(u => (
                <option key={u.ecode || u.emp_code} value={u.ecode || u.emp_code}>
                  {(u.name || u.ecode || u.emp_code)} ({u.ecode || u.emp_code})
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              placeholder="Enter emp_code (e.g. EMP018)"
              value={scValue}
              onChange={e => setScValue(e.target.value)}
            />
          )}
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          Will update {selectedIds.size} lead{selectedIds.size === 1 ? '' : 's'}.
        </div>
      </Modal>

      <Modal
        open={activeModal === 'campaign'}
        title="Enroll in Campaign"
        onClose={closeModal}
        submitLabel={enrollMutation.isPending ? 'Enrolling…' : 'Enroll'}
        submitDisabled={!campaignValue || enrollMutation.isPending}
        onSubmit={() => {
          setMutationError('')
          enrollMutation.mutate({ campaignId: campaignValue, ids: selectedArray() })
        }}
        error={mutationError}
      >
        <div>
          <label className="field-label">Campaign</label>
          {campaignsQuery.isLoading ? (
            <div className="muted">Loading campaigns…</div>
          ) : campaignList.length > 0 ? (
            <select className="select" value={campaignValue} onChange={e => setCampaignValue(e.target.value)}>
              <option value="">Select a campaign…</option>
              {campaignList.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.status ? ` — ${c.status}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="muted">No campaigns available.</div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          Will enroll {selectedIds.size} lead{selectedIds.size === 1 ? '' : 's'}.
        </div>
      </Modal>

      <Modal
        open={activeModal === 'status'}
        title="Change Status"
        onClose={closeModal}
        submitLabel={bulkPatchMutation.isPending ? 'Updating…' : 'Update'}
        submitDisabled={!statusValue || bulkPatchMutation.isPending}
        onSubmit={() => {
          setMutationError('')
          bulkPatchMutation.mutate({ ids: selectedArray(), status: statusValue })
        }}
        error={mutationError}
      >
        <div>
          <label className="field-label">New Status</label>
          <select className="select" value={statusValue} onChange={e => setStatusValue(e.target.value)}>
            <option value="">Select status…</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          Will update {selectedIds.size} lead{selectedIds.size === 1 ? '' : 's'}.
        </div>
      </Modal>
    </div>
  )
}
