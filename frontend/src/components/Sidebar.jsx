import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const SECTIONS = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: '\u25A2' },
      { to: '/my-tasks',  label: 'My Tasks',  icon: '\u2713' },
    ],
  },
  {
    title: 'Pipeline',
    items: [
      { to: '/leads',         label: 'All Leads',  icon: '\u25CE' },
      { to: '/leads?qualified=1', label: 'Qualified', icon: '\u25C9', match: '/leads' },
      { to: '/duplicates',        label: 'Duplicates', icon: '\u2687', adminOnly: true },
    ],
  },
  {
    title: 'Campaigns',
    items: [
      { to: '/campaigns', label: 'Campaigns', icon: '\u2933' },
      { to: '/templates', label: 'Templates', icon: '\u25A4' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/analytics', label: 'Analytics', icon: '\u25A8' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/import',   label: 'Import',   icon: '\u25BE' },
      { to: '/settings', label: 'Settings', icon: '\u25C8' },
    ],
  },
]

function initialsFor(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Sidebar() {
  const { user } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">LM</div>
        <div>
          <div className="sidebar-brand-name">Alok LMS</div>
          <div className="sidebar-brand-sub">Lead Pipeline</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {SECTIONS.map(section => (
          <div key={section.title} className="sidebar-section">
            <div className="sidebar-section-title">{section.title}</div>
            {section.items.filter(item => !item.adminOnly || user?.role === 'admin').map(item => (
              <NavLink
                key={item.to + item.label}
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon" aria-hidden>{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.count != null && <span className="nav-count">{item.count}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="user-avatar">{initialsFor(user?.name)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name || 'Guest'}
          </div>
          <div className="user-code">{user?.emp_code || '—'}</div>
          <div className="user-role">{user?.role || ''}</div>
        </div>
      </div>
    </aside>
  )
}
