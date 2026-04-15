import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children }) {
  const { token, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="p-8 text-gray-400">Loading…</div>
  }
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}
