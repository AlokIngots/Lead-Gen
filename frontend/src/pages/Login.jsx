import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthAPI } from '../api'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const [empCode, setEmpCode]   = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')

  const { login } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname || '/leads'

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await AuthAPI.login(empCode.trim().toUpperCase(), password)
      login(r.access_token, r.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="text-center mb-6">
          <div className="text-2xl font-semibold text-brand-600">Alok LMS</div>
          <div className="text-sm text-gray-500 mt-1">Sign in with your employee code</div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Employee Code
            </label>
            <input
              type="text"
              value={empCode}
              onChange={e => setEmpCode(e.target.value.toUpperCase())}
              placeholder="e.g. EMP001"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={!empCode || !password || busy}
            className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
