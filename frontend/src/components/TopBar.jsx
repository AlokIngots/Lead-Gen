import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import NotificationBell from './NotificationBell.jsx'

const TITLES = [
  { match: /^\/dashboard/, title: 'Dashboard' },
  { match: /^\/leads\/[^/]+/, title: 'Lead Detail' },
  { match: /^\/leads/,    title: 'Leads' },
  { match: /^\/campaigns/, title: 'Campaigns' },
  { match: /^\/templates/, title: 'Templates' },
  { match: /^\/analytics/, title: 'Analytics' },
  { match: /^\/import/,    title: 'Import leads' },
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
          <span className="secondary" style={{ fontSize: 12, marginRight: 4 }}>
            {user.name} <span className="muted mono" style={{ marginLeft: 4 }}>{user.emp_code}</span>
          </span>
        )}
        <button className="btn btn-ghost" onClick={logout}>Sign out</button>
      </div>
    </header>
  )
}
