import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CompaniesAPI } from '../api'
import StatusBadge from '../components/StatusBadge.jsx'
import SegmentTag from '../components/SegmentTag.jsx'
import ScoreBar from '../components/ScoreBar.jsx'

const SEGMENTS = ['pumps','valves','pneumatics','defense','stockholders','cnc','forging','others']

const SQUARE_COLORS = ['#2355f5', '#0ea854', '#e8610a', '#7132e8', '#0b9384', '#c97c08', '#e02020']

function colorForCompany(name) {
  if (!name) return SQUARE_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return SQUARE_COLORS[h % SQUARE_COLORS.length]
}

export default function Companies() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({
    q: '', industry_segment: '', country: '', has_email: '',
    page: 1, page_size: 50,
  })

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }))

  // Build params — strip empty strings
  const params = useMemo(() => {
    const p = { ...filters }
    Object.keys(p).forEach(k => { if (p[k] === '') delete p[k] })
    if (p.has_email === 'true') p.has_email = true
    else if (p.has_email === 'false') p.has_email = false
    else delete p.has_email
    return p
  }, [filters])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['companies', params],
    queryFn: () => CompaniesAPI.list(params),
  })

  const { data: summary } = useQuery({
    queryKey: ['companies-summary'],
    queryFn: () => CompaniesAPI.summary(),
  })

  const total = data?.total || 0
  const start = total === 0 ? 0 : (filters.page - 1) * filters.page_size + 1
  const end = Math.min(filters.page * filters.page_size, total)

  const { data: countries = [] } = useQuery({
    queryKey: ['companies-countries'],
    queryFn: () => CompaniesAPI.countries(),
  })

  const handleRowClick = (company) => {
    navigate(`/leads?q=${encodeURIComponent(company.company_name)}`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Companies</h1>
          <div className="page-subtitle">
            <span className="mono">{(summary?.total_companies || total).toLocaleString()}</span> unique companies across segments
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stat-row" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total Companies</div>
          <div className="stat-value">{(summary?.total_companies || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Have Email</div>
          <div className="stat-value" style={{ color: '#0ea854' }}>{(summary?.total_has_email || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">LinkedIn Only</div>
          <div className="stat-value" style={{ color: '#7132e8' }}>{(summary?.total_linkedin_only || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Qualified</div>
          <div className="stat-value" style={{ color: '#2355f5' }}>{(summary?.total_qualified || 0).toLocaleString()}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card card-pad" style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          className="input"
          style={{ width: 260 }}
          placeholder="Search company name"
          value={filters.q}
          onChange={e => set('q', e.target.value)}
        />
        <select className="select" style={{ width: 160 }} value={filters.industry_segment} onChange={e => set('industry_segment', e.target.value)}>
          <option value="">All segments</option>
          {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" style={{ width: 140 }} value={filters.country} onChange={e => set('country', e.target.value)}>
          <option value="">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" style={{ width: 150 }} value={filters.has_email} onChange={e => set('has_email', e.target.value)}>
          <option value="">All contacts</option>
          <option value="true">Has email</option>
          <option value="false">LinkedIn only</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Segment</th>
              <th>Country</th>
              <th style={{ textAlign: 'center' }}>Contacts</th>
              <th style={{ textAlign: 'center' }}>Has Email</th>
              <th>Score</th>
              <th>Status</th>
              <th>SC</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '36px 0', color: '#9399b8' }}>Loading...</td></tr>
            )}
            {isError && (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '36px 0', color: '#e02020' }}>Failed to load companies</td></tr>
            )}
            {data?.items?.map((company, idx) => {
              const initial = (company.company_name || '?').trim().charAt(0).toUpperCase()
              return (
                <tr key={`${company.company_name}-${company.industry_segment}-${idx}`} onClick={() => handleRowClick(company)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div className="company-cell">
                      <div className="company-square" style={{ background: colorForCompany(company.company_name) }}>
                        {initial}
                      </div>
                      <div>
                        <div className="company-name">{company.company_name}</div>
                        <div className="company-meta">
                          {company.best_email || company.website || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><SegmentTag segment={company.industry_segment} /></td>
                  <td className="mono muted">{company.country || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{company.total_contacts}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="mono" style={{ color: company.has_email_count > 0 ? '#0ea854' : '#9399b8' }}>
                      {company.has_email_count}
                    </span>
                    {company.linkedin_only_count > 0 && (
                      <span className="mono" style={{ color: '#7132e8', marginLeft: 4, fontSize: 11 }}>
                        +{company.linkedin_only_count} LI
                      </span>
                    )}
                  </td>
                  <td><ScoreBar score={company.score} /></td>
                  <td><StatusBadge status={company.status} /></td>
                  <td className="mono muted">{company.assigned_sc || '—'}</td>
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
    </div>
  )
}
