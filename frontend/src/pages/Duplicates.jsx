import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DuplicatesAPI } from '../api/index.js'

function formatDate(iso) {
  if (!iso) return '\u2014'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '\u2014'
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function statusBadge(status) {
  const map = {
    won:        { bg: 'var(--green-light)', fg: 'var(--green)' },
    qualified:  { bg: 'var(--blue-light)',  fg: 'var(--blue)' },
    engaged:    { bg: 'var(--amber-light, #fef3c7)', fg: 'var(--amber, #d97706)' },
    emailed:    { bg: 'var(--surface)',     fg: 'var(--text-muted)' },
    lost:       { bg: 'var(--red-light)',   fg: 'var(--red)' },
    disqualified: { bg: 'var(--red-light)', fg: 'var(--red)' },
  }
  const c = map[status] || { bg: 'var(--surface)', fg: 'var(--text-muted)' }
  return <span className="badge" style={{ background: c.bg, color: c.fg }}>{status || '\u2014'}</span>
}

export default function Duplicates() {
  const [page, setPage] = useState(1)
  const [mode, setMode] = useState('company')
  const [groups, setGroups] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [selectedKeep, setSelectedKeep] = useState({})
  const [merging, setMerging] = useState({})
  const [mergeMsg, setMergeMsg] = useState(null)

  const stats = useQuery({
    queryKey: ['duplicate-stats'],
    queryFn: DuplicatesAPI.stats,
  })

  const s = stats.data || {}

  const doScan = async (p = 1) => {
    setScanning(true)
    setScanError(null)
    try {
      const data = await DuplicatesAPI.scan({ page: p, page_size: 20, mode })
      setGroups(data)
      setPage(p)
      // pre-select first lead in each group as keep
      const sel = {}
      for (const g of data.groups) {
        if (g.leads.length > 0) sel[g.company_name] = g.leads[0].id
      }
      setSelectedKeep(sel)
    } catch (err) {
      setScanError(err?.response?.data?.detail || err?.message || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  const doMerge = async (group) => {
    const keepId = selectedKeep[group.company_name]
    if (!keepId) return
    const mergeIds = group.leads.map(l => l.id).filter(id => id !== keepId)
    if (mergeIds.length === 0) return

    setMerging(m => ({ ...m, [group.company_name]: true }))
    setMergeMsg(null)
    try {
      const res = await DuplicatesAPI.merge({ keep_id: keepId, merge_ids: mergeIds })
      // Remove group from list
      setGroups(prev => ({
        ...prev,
        total_groups: prev.total_groups - 1,
        groups: prev.groups.filter(g => g.company_name !== group.company_name),
      }))
      setMergeMsg(`Merged ${res.merged} leads into #${res.kept}`)
      stats.refetch()
    } catch (err) {
      setMergeMsg(err?.response?.data?.detail || err?.message || 'Merge failed')
    } finally {
      setMerging(m => ({ ...m, [group.company_name]: false }))
    }
  }

  const totalPages = groups ? Math.ceil(groups.total_groups / (groups.page_size || 20)) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Total Leads</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{s.total_leads ?? '\u2014'}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Unique Companies</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: 'var(--green)' }}>{s.unique_companies ?? '\u2014'}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Duplicate Groups</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: 'var(--amber, #d97706)' }}>{s.duplicate_companies ?? '\u2014'}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Leads to Clean</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: 'var(--red)' }}>{s.duplicate_leads ?? '\u2014'}</div>
        </div>
      </div>

      {/* Scan controls */}
      <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <select
          className="select"
          value={mode}
          onChange={e => setMode(e.target.value)}
          style={{ width: 180 }}
        >
          <option value="company">By Company Name</option>
          <option value="domain">By Email Domain</option>
        </select>
        <button
          className="btn btn-primary"
          onClick={() => doScan(1)}
          disabled={scanning}
        >
          {scanning ? 'Scanning\u2026' : 'Scan for Duplicates'}
        </button>
        {scanError && (
          <span style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{scanError}</span>
        )}
      </div>

      {/* Success/error message */}
      {mergeMsg && (
        <div className="card" style={{
          padding: '12px 20px',
          borderLeft: '4px solid var(--green)',
          fontSize: 13,
          fontWeight: 600,
        }}>
          {mergeMsg}
        </div>
      )}

      {/* Results */}
      {groups && groups.groups.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
          No duplicate groups found.
        </div>
      )}

      {groups && groups.groups.map(group => (
        <div className="card" key={group.company_name}>
          <div className="card-header">
            <div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{group.company_name}</span>
              <span className="badge" style={{ marginLeft: 10, background: 'var(--surface)', color: 'var(--text-muted)' }}>
                {group.count} leads
              </span>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => doMerge(group)}
              disabled={merging[group.company_name]}
            >
              {merging[group.company_name] ? 'Merging\u2026' : 'Merge'}
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Keep</th>
                  <th>ID</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Score</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {group.leads.map(lead => (
                  <tr key={lead.id}>
                    <td>
                      <input
                        type="radio"
                        name={`keep-${group.company_name}`}
                        checked={selectedKeep[group.company_name] === lead.id}
                        onChange={() => setSelectedKeep(s => ({ ...s, [group.company_name]: lead.id }))}
                      />
                    </td>
                    <td className="mono">{lead.id}</td>
                    <td>{lead.contact_name || '\u2014'}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{lead.email || '\u2014'}</td>
                    <td className="mono">{lead.phone || '\u2014'}</td>
                    <td>{statusBadge(lead.status)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{lead.score}</td>
                    <td className="muted">{formatDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Pagination */}
      {groups && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            onClick={() => doScan(page - 1)}
          >
            Previous
          </button>
          <span style={{ padding: '6px 12px', fontSize: 13 }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page >= totalPages}
            onClick={() => doScan(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
