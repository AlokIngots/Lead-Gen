import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ImportAPI } from '../api/index.js'

const LMS_FIELDS = [
  { value: '',                  label: '(unmapped)' },
  { value: 'company_name',      label: 'Company name' },
  { value: 'contact_name',      label: 'Contact name' },
  { value: 'designation',       label: 'Designation' },
  { value: 'email',             label: 'Email' },
  { value: 'phone',             label: 'Phone' },
  { value: 'alt_phone',         label: 'Alt phone' },
  { value: 'website',           label: 'Website' },
  { value: 'city',              label: 'City' },
  { value: 'state',             label: 'State' },
  { value: 'pincode',           label: 'Pincode' },
  { value: 'country',           label: 'Country' },
  { value: 'industry_segment',  label: 'Industry segment' },
  { value: 'source',            label: 'Source' },
  { value: 'assigned_sc',       label: 'Assigned SC' },
  { value: 'linkedin_url',      label: 'LinkedIn' },
]

const COLUMN_ALIASES = {
  company_name:     ['company', 'company_name', 'organization', 'firm'],
  contact_name:     ['contact', 'contact_name', 'name', 'person', 'full name', 'full_name'],
  designation:      ['designation', 'title', 'role', 'job title', 'job_title'],
  email:            ['email', 'email_id', 'mail', 'work email', 'work_email'],
  phone:            ['phone', 'mobile', 'contact_no', 'phone number', 'phone_number'],
  alt_phone:        ['alt_phone', 'phone2', 'secondary_phone', 'alt phone'],
  website:          ['website', 'url', 'site', 'company website'],
  city:             ['city'],
  state:            ['state'],
  pincode:          ['pincode', 'pin', 'zip', 'postal code'],
  country:          ['country'],
  industry_segment: ['segment', 'industry', 'industry_segment'],
  source:           ['source'],
  assigned_sc:      ['sc', 'assigned_sc', 'coordinator'],
  linkedin_url:     ['linkedin', 'linkedin_url', 'linkedin url'],
}

const LEAD_STATUSES = [
  { value: 'raw',       label: 'Raw' },
  { value: 'emailed',   label: 'Emailed' },
  { value: 'engaged',   label: 'Engaged' },
  { value: 'qualified', label: 'Qualified' },
]

const SEGMENTS = [
  { value: '',             label: 'Auto-detect' },
  { value: 'pumps',        label: 'Pumps' },
  { value: 'valves',       label: 'Valves' },
  { value: 'pneumatics',   label: 'Pneumatics' },
  { value: 'defense',      label: 'Defense' },
  { value: 'stockholders', label: 'Stockholders' },
  { value: 'cnc',          label: 'CNC' },
  { value: 'forging',      label: 'Forging' },
  { value: 'others',       label: 'Others' },
]

const SOURCES = [
  { value: 'apollo', label: 'Apollo' },
  { value: 'lusha',  label: 'Lusha' },
  { value: 'manual', label: 'Manual' },
  { value: 'other',  label: 'Other' },
]

function parseCSV(text) {
  const rows = []
  let i = 0
  let field = ''
  let row = []
  let inQuotes = false
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(c => c !== '')) rows.push(row)
      row = []
      i++
      continue
    }
    field += ch; i++
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some(c => c !== '')) rows.push(row)
  }
  return rows
}

function autoDetect(headers) {
  const map = {}
  const lowered = headers.map(h => String(h || '').trim().toLowerCase())
  for (const [target, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = lowered.indexOf(alias)
      if (idx >= 0 && !map[headers[idx]]) {
        map[headers[idx]] = target
        break
      }
    }
  }
  for (const h of headers) if (!(h in map)) map[h] = ''
  return map
}

function formatBytes(b) {
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function statusBadge(status) {
  const map = {
    completed:  { bg: 'var(--green-light)', fg: 'var(--green)' },
    processing: { bg: 'var(--blue-light)',  fg: 'var(--blue)' },
    failed:     { bg: 'var(--red-light)',   fg: 'var(--red)' },
    pending:    { bg: 'var(--surface)',     fg: 'var(--text-muted)' },
  }
  const c = map[status] || map.pending
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>{status || '—'}</span>
  )
}

const UploadIcon = () => (
  <svg className="dropzone-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

export default function Import() {
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [isExcel, setIsExcel] = useState(false)
  const [headers, setHeaders] = useState([])
  const [previewRows, setPreviewRows] = useState([])
  const [totalRows, setTotalRows] = useState(0)
  const [mapping, setMapping] = useState({})
  const [dragOver, setDragOver] = useState(0)

  const [source, setSource] = useState('apollo')
  const [duplicateHandling, setDuplicateHandling] = useState('skip')
  const [defaultStatus, setDefaultStatus] = useState('raw')
  const [defaultSegment, setDefaultSegment] = useState('')

  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [result, setResult] = useState(null)

  const history = useQuery({
    queryKey: ['import-history'],
    queryFn: ImportAPI.history,
    refetchInterval: (q) => {
      const data = q?.state?.data ?? q
      const arr = Array.isArray(data) ? data : []
      return arr.some(r => r.status === 'processing') ? 5000 : false
    },
  })

  const mappedCount = useMemo(
    () => Object.values(mapping).filter(v => v && v !== '').length,
    [mapping],
  )
  const unmappedCount = headers.length - mappedCount

  const resetAll = () => {
    setFile(null)
    setIsExcel(false)
    setHeaders([])
    setPreviewRows([])
    setTotalRows(0)
    setMapping({})
    setProgress(0)
    setUploading(false)
    setUploadError(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFile = (f) => {
    if (!f) return
    setFile(f)
    setUploadError(null)
    setResult(null)
    const lower = f.name.toLowerCase()
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      setIsExcel(true)
      setHeaders([])
      setPreviewRows([])
      setTotalRows(0)
      setMapping({})
      return
    }
    setIsExcel(false)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result || '')
      const rows = parseCSV(text)
      if (!rows.length) {
        setHeaders([])
        setPreviewRows([])
        setTotalRows(0)
        setMapping({})
        return
      }
      const hdrs = rows[0].map(h => String(h || '').trim())
      const data = rows.slice(1)
      setHeaders(hdrs)
      setPreviewRows(data.slice(0, 3))
      setTotalRows(data.length)
      setMapping(autoDetect(hdrs))
    }
    reader.readAsText(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(0)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const startImport = async () => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    setProgress(0)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('source', source)
      fd.append('default_status', defaultStatus)
      if (defaultSegment) fd.append('default_segment', defaultSegment)
      fd.append('duplicate_handling', duplicateHandling)
      const cleanedMapping = {}
      for (const [k, v] of Object.entries(mapping)) if (v) cleanedMapping[k] = v
      fd.append('column_mapping', JSON.stringify(cleanedMapping))
      const res = await ImportAPI.upload(fd, setProgress)
      setResult(res)
      history.refetch()
    } catch (err) {
      setUploadError(err?.response?.data?.detail || err?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const historyRows = Array.isArray(history.data) ? history.data : []

  if (result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card import-success">
          <div className="import-success-head">
            <div className="import-success-check">{'\u2713'}</div>
            <div>
              <div className="import-success-title">Import complete</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {file?.name} processed successfully
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <div className="stat-card">
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4 }}>Imported</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)', marginTop: 6 }}>{result.inserted_rows}</div>
            </div>
            <div className="stat-card">
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4 }}>Duplicates</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--amber)', marginTop: 6 }}>{result.duplicate_rows ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4 }}>Bounced</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--orange)', marginTop: 6 }}>{result.bounced_rows ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4 }}>Errors</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)', marginTop: 6 }}>{result.error_rows ?? 0}</div>
            </div>
          </div>
          <div>
            <button className="btn btn-primary" onClick={resetAll}>Import another file</button>
          </div>
        </div>
        <HistoryCard historyRows={historyRows} loading={history.isLoading} onRefresh={() => history.refetch()} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card" style={{ padding: 24 }}>
        {!file ? (
          <div
            className={`dropzone${dragOver > 0 ? ' dropzone-active' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(v => v + 1) }}
            onDragOver={(e) => { e.preventDefault() }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(v => Math.max(0, v - 1)) }}
            onDrop={onDrop}
          >
            <UploadIcon />
            <div className="dropzone-title">Drop your Apollo or Lusha CSV here</div>
            <div className="dropzone-sub">or click to browse — supports .csv and .xlsx</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="file-summary">
            <div className="file-summary-info">
              <div className="file-summary-name">{file.name}</div>
              <div className="file-summary-meta">
                {formatBytes(file.size)}{!isExcel && ` • ${totalRows} rows`}
              </div>
            </div>
            <button className="file-summary-remove" onClick={resetAll}>Remove</button>
          </div>
        )}
      </div>

      {file && !isExcel && headers.length > 0 && (
        <div className="card" style={{ padding: 24 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>Map columns</div>
          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {previewRows.map((r, ri) => (
                  <tr key={ri}>
                    {headers.map((_, ci) => <td key={ci}>{r[ci] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            {headers.map((h) => (
              <div className="column-map-row" key={h}>
                <div className="csv-name">{h}</div>
                <div className="arrow">{'\u2192'}</div>
                <select
                  className="select"
                  value={mapping[h] || ''}
                  onChange={(e) => setMapping(m => ({ ...m, [h]: e.target.value }))}
                >
                  {LMS_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 12 }}>
            <span style={{ color: 'var(--green)', fontWeight: 700 }}>{mappedCount} mapped</span>
            <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>•</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{unmappedCount} unmapped</span>
          </div>
        </div>
      )}

      {file && isExcel && (
        <div className="card" style={{ padding: 24 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Excel file detected</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {'\u26A0'} Excel files will be parsed on the server during upload — column auto-detection not available for .xlsx in this preview.
          </div>
        </div>
      )}

      {file && (
        <div className="card" style={{ padding: 24 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>Import options</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Source</label>
              <select className="select" value={source} onChange={e => setSource(e.target.value)} style={{ width: '100%' }}>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Duplicate handling</label>
              <select className="select" value={duplicateHandling} onChange={e => setDuplicateHandling(e.target.value)} style={{ width: '100%' }}>
                <option value="skip">Skip duplicates</option>
                <option value="update">Update existing</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Default status</label>
              <select className="select" value={defaultStatus} onChange={e => setDefaultStatus(e.target.value)} style={{ width: '100%' }}>
                {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Default segment</label>
              <select className="select" value={defaultSegment} onChange={e => setDefaultSegment(e.target.value)} style={{ width: '100%' }}>
                {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {file && (
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--green)' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            Ready to import {isExcel ? '?' : totalRows} rows
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {isExcel
              ? `Excel file • Source: ${source} • Duplicates: ${duplicateHandling}`
              : `${mappedCount} columns mapped • Source: ${source} • Duplicates: ${duplicateHandling}`}
          </div>
          {uploadError && (
            <div style={{
              marginTop: 14,
              padding: '10px 14px',
              background: 'var(--red-light)',
              color: 'var(--red)',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
            }}>
              {uploadError}
            </div>
          )}
          {uploading && (
            <div className="import-progress">
              <div className="import-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--green)', borderColor: 'var(--green)' }}
              onClick={startImport}
              disabled={uploading}
            >
              {uploading ? `Uploading… ${progress}%` : `Start import \u2192`}
            </button>
          </div>
        </div>
      )}

      <HistoryCard historyRows={historyRows} loading={history.isLoading} onRefresh={() => history.refetch()} />
    </div>
  )
}

function HistoryCard({ historyRows, loading, onRefresh }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Recent imports</div>
        <button className="btn btn-ghost" onClick={onRefresh}>Refresh</button>
      </div>
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : historyRows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No imports yet</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Filename</th>
              <th>Source</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Imported</th>
              <th style={{ textAlign: 'right' }}>Duplicates</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {historyRows.map(r => (
              <tr key={r.id}>
                <td>{formatDate(r.started_at || r.finished_at)}</td>
                <td style={{ fontWeight: 600 }}>{r.filename || '—'}</td>
                <td>{r.source || '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.total_rows ?? 0}</td>
                <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{r.inserted_rows ?? 0}</td>
                <td style={{ textAlign: 'right' }}>{r.duplicate_rows ?? 0}</td>
                <td>{statusBadge(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
