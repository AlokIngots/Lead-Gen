import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthAPI } from '../api'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const [step, setStep]           = useState('ecode') // 'ecode' | 'otp'
  const [empCode, setEmpCode]     = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [phoneLast4, setPhoneLast4] = useState('')
  const [devOtp, setDevOtp]       = useState('')
  const [otp, setOtp]             = useState(['', '', '', '', '', ''])
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [countdown, setCountdown] = useState(0)
  const inputRefs = useRef([])
  const verifyingRef = useRef(false)

  const { login } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname || '/leads'

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // Clear error on step change
  useEffect(() => { setError('') }, [step])

  // ── Step 1: Send OTP ──
  const sendOTP = async (e) => {
    if (e) e.preventDefault()
    if (!empCode.trim()) return
    setError('')
    setBusy(true)
    try {
      const r = await AuthAPI.sendOTP(empCode.trim().toUpperCase())
      setSessionId(r.session_id)
      const match = r.message?.match(/(\d{4})$/)
      setPhoneLast4(match ? match[1] : '')
      setDevOtp(r.otp || '')
      setStep('otp')
      setCountdown(60)
      setOtp(['', '', '', '', '', ''])
      verifyingRef.current = false
      setTimeout(() => inputRefs.current[0]?.focus(), 50)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send OTP')
    } finally {
      setBusy(false)
    }
  }

  // ── Step 2: Verify OTP ──
  const verifyOTP = async (otpStr) => {
    if (!otpStr || otpStr.length !== 6) return
    if (verifyingRef.current) return
    verifyingRef.current = true
    setError('')
    setBusy(true)
    try {
      const r = await AuthAPI.verifyOTP(sessionId, otpStr)
      login(r.access_token, r.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid OTP')
      verifyingRef.current = false
    } finally {
      setBusy(false)
    }
  }

  // ── OTP input handlers ──
  const handleOtpChange = (idx, value) => {
    if (!/^\d*$/.test(value)) return
    const next = [...otp]
    next[idx] = value
    setOtp(next)
    if (value && idx < 5) inputRefs.current[idx + 1]?.focus()
    if (next.every(d => d !== '') && next.join('').length === 6) {
      verifyOTP(next.join(''))
    }
  }

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const next = [...otp]
    for (let i = 0; i < pasted.length && i < 6; i++) next[i] = pasted[i]
    setOtp(next)
    const focusIdx = next.findIndex(d => d === '')
    inputRefs.current[focusIdx === -1 ? 5 : focusIdx]?.focus()
    if (next.every(d => d !== '')) verifyOTP(next.join(''))
  }

  const handleResend = async () => {
    if (countdown > 0) return
    setBusy(true)
    setError('')
    try {
      const r = await AuthAPI.sendOTP(empCode.trim().toUpperCase())
      setSessionId(r.session_id)
      setDevOtp(r.otp || '')
      setCountdown(60)
      setOtp(['', '', '', '', '', ''])
      verifyingRef.current = false
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to resend OTP')
    } finally {
      setBusy(false)
    }
  }

  const goBack = () => {
    setStep('ecode')
    setSessionId(null)
    setDevOtp('')
    setOtp(['', '', '', '', '', ''])
    verifyingRef.current = false
  }

  // ── Render ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="text-center mb-6">
          <div className="text-2xl font-semibold text-brand-600">Alok LMS</div>
          <div className="text-sm text-gray-500 mt-1">
            {step === 'ecode'
              ? 'Sign in with your employee code'
              : `Enter OTP sent to ******${phoneLast4}`}
          </div>
        </div>

        {/* ── STEP 1: Employee Code ── */}
        {step === 'ecode' && (
          <form onSubmit={sendOTP} className="space-y-4">
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
                disabled={busy}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50"
              />
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <button
              type="submit"
              disabled={!empCode.trim() || busy}
              className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        )}

        {/* ── STEP 2: OTP ── */}
        {step === 'otp' && (
          <form onSubmit={e => { e.preventDefault(); verifyOTP(otp.join('')) }} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 text-center">
                Verification Code
              </label>
              <div className="flex justify-center gap-2">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => inputRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    disabled={busy}
                    autoComplete="off"
                    className="w-10 h-11 text-center text-lg font-semibold border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50"
                  />
                ))}
              </div>
            </div>

            {error && <div className="text-sm text-red-600 text-center">{error}</div>}

            <button
              type="submit"
              disabled={otp.some(d => d === '') || busy}
              className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={goBack}
              disabled={busy}
              className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium disabled:opacity-50"
            >
              Back
            </button>

            <div className="text-center text-xs text-gray-500">
              {countdown > 0
                ? `Resend in ${countdown}s`
                : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={busy}
                    className="text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
                  >
                    Resend OTP
                  </button>
                )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
