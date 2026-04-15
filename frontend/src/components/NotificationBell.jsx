import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { NotificationsAPI } from '../api'
import { useAuth } from '../context/AuthContext.jsx'

const TYPE_META = {
  reply_received:    { color: '#2355f5', letter: 'R' },
  lead_qualified:    { color: '#0ea854', letter: 'Q' },
  call_alert:        { color: '#f5a623', letter: 'C' },
  campaign_complete: { color: '#7a3ff5', letter: '\u2713' },
}

function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function NotificationBell() {
  const { user } = useAuth()
  const empCode = user?.emp_code || user?.ecode
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const { data: items = [] } = useQuery({
    queryKey: ['notifications', empCode],
    queryFn: () => NotificationsAPI.list({ emp_code: empCode, limit: 10 }),
    enabled: !!empCode,
    refetchInterval: 30_000,
  })

  const { data: countData } = useQuery({
    queryKey: ['notifications-count', empCode],
    queryFn: () => NotificationsAPI.unreadCount(empCode),
    enabled: !!empCode,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!empCode) return null

  const count = countData?.count || 0
  const hasUnread = items.some(n => !n.is_read)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications', empCode] })
    qc.invalidateQueries({ queryKey: ['notifications-count', empCode] })
  }

  const handleClickItem = async (n) => {
    try {
      if (!n.is_read) await NotificationsAPI.markRead(n.id)
    } catch (_) {}
    invalidate()
    setOpen(false)
    if (n.lead_id) navigate(`/leads/${n.lead_id}`)
  }

  const handleMarkAll = async (e) => {
    e.stopPropagation()
    try {
      await NotificationsAPI.markAllRead(empCode)
    } catch (_) {}
    invalidate()
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {count > 0 && <span className="notification-badge">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-header">
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Notifications</span>
            {hasUnread && (
              <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={handleMarkAll}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="notif-empty">No notifications yet</div>
          ) : (
            <div className="notif-list">
              {items.map(n => {
                const meta = TYPE_META[n.type] || { color: '#505575', letter: '!' }
                return (
                  <div
                    key={n.id}
                    className={`notif-item ${n.is_read ? '' : 'unread'}`}
                    onClick={() => handleClickItem(n)}
                  >
                    <div className="notif-icon" style={{ background: meta.color }}>{meta.letter}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {n.body}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginLeft: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(n.created_at)}</span>
                      {!n.is_read && (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
