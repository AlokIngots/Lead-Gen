import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import NotificationBell from './NotificationBell.jsx'

const TITLES = [
  { match: /^\/my-tasks/, title: 'My Tasks' },
  { match: /^\/dashboard/, title: 'Dashboard' },
  { match: /^\/leads\/[^/]+/, title: 'Lead Detail' },
  { match: /^\/leads/,    title: 'Leads' },
  { match: /^\/companies/, title: 'Companies' },
  { match: /^\/campaigns/, title: 'Campaigns' },
  { match: /^\/templates/, title: 'Templates' },
  { match: /^\/analytics/, title: 'Analytics' },
  { match: /^\/duplicates/, title: 'Duplicates' },
  { match: /^\/import/,    title: 'Import Leads' },
]

function titleFor(pathname) {
  for (const t of TITLES) if (t.match.test(pathname)) return t.title
  return 'Alok LMS'
}

export default function TopBar() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const title = titleFor(pathname)

  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-actions">
        <NotificationBell />
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4, padding: '4px 10px', background: 'var(--surface)', borderRadius: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {user.name}
            </span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', background: '#fff', padding: '1px 6px', borderRadius: 4 }}>
              {user.emp_code}
            </span>
          </div>
        )}
        <button className="btn btn-ghost" onClick={logout}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </header>
  )
}
