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

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  useEffect(() => { setError('') }, [step])

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

  const verifyOTP = async (otpStr) => {
    if (!otpStr || otpStr.length !== 6) return
    if (verifyingRef.current) return
    verifyingRef.current = true
    setError('')
    setBusy(true)
    try {
      const r = await AuthAPI.verifyOTP(sessionId, otpStr)
      login(r.access_token, r.user, r.refresh_token)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid OTP')
      verifyingRef.current = false
    } finally {
      setBusy(false)
    }
  }

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

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-brand-logo">LM</div>
            <div>
              <div className="login-brand-text">Alok LMS</div>
              <div className="login-brand-sub">Lead Pipeline</div>
            </div>
          </div>

          {step === 'ecode' && (
            <>
              <div className="login-title">Welcome back</div>
              <div className="login-subtitle">Sign in with your employee code to continue</div>
              <form onSubmit={sendOTP} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="field-label">Employee Code</label>
                  <input
                    type="text"
                    value={empCode}
                    onChange={e => setEmpCode(e.target.value.toUpperCase())}
                    placeholder="e.g. EMP001"
                    autoFocus
                    disabled={busy}
                    className="input"
                    style={{ padding: '10px 14px', fontSize: 14 }}
                  />
                </div>
                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-btn)', background: 'var(--red-light)', color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={!empCode.trim() || busy}
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', padding: '12px 18px', fontSize: 14 }}
                >
                  {busy ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            </>
          )}

          {step === 'otp' && (
            <>
              <div className="login-title">Enter verification code</div>
              <div className="login-subtitle">
                We sent a 6-digit code to ******{phoneLast4}
              </div>
              <form onSubmit={e => { e.preventDefault(); verifyOTP(otp.join('')) }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="otp-input-grid">
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
                      className="otp-input"
                    />
                  ))}
                </div>

                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-btn)', background: 'var(--red-light)', color: 'var(--red)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={otp.some(d => d === '') || busy}
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', padding: '12px 18px', fontSize: 14 }}
                >
                  {busy ? 'Verifying...' : 'Verify'}
                </button>

                <button
                  type="button"
                  onClick={goBack}
                  disabled={busy}
                  className="btn btn-ghost btn-lg"
                  style={{ width: '100%' }}
                >
                  Back
                </button>

                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                  {countdown > 0
                    ? <span>Resend in <span className="mono" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{countdown}s</span></span>
                    : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={busy}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--blue)', fontWeight: 600, fontSize: 12,
                          fontFamily: 'inherit',
                        }}
                      >
                        Resend OTP
                      </button>
                    )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="login-right">
        <div className="login-right-content">
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'rgba(255,255,255,.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: 28,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <div className="login-right-title">Streamline your pipeline</div>
          <div className="login-right-desc">
            Track leads, automate outreach, and close deals faster with intelligent campaign management.
          </div>
        </div>
      </div>
    </div>
  )
}
