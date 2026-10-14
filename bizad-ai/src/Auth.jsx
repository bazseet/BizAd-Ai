import { useState } from 'react'

const API_BASE_URL = 'http://localhost:5000'

function Auth({ initialMode = 'login', onSuccess, onBack }) {
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isSignup = mode === 'signup'

  const handleSubmit = async (event) => {
    event.preventDefault()

    setError('')

    if (isSignup && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (isSignup && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const endpoint = isSignup
        ? '/api/auth/signup'
        : '/api/auth/login'

      const body = isSignup
        ? {
            name: name.trim(),
            email: email.trim(),
            password,
          }
        : {
            email: email.trim(),
            password,
          }

      const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(body),
        }
      )

      let data

      try {
        data = await response.json()
      } catch {
        throw new Error(
          'BizAd AI returned an invalid response.'
        )
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            (isSignup
              ? 'Unable to create your account.'
              : 'Invalid email or password.')
        )
      }

      if (!data.user) {
        throw new Error(
          'Authentication succeeded, but no user account was returned.'
        )
      }

      onSuccess(data.user)
    } catch (error) {
      console.error('Authentication error:', error)

      if (
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('ERR_CONNECTION_REFUSED')
      ) {
        setError(
          'BizAd AI server is not available. Please make sure the backend is running.'
        )
      } else {
        setError(
          error.message ||
            'Something went wrong. Please try again.'
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8f9fc',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <nav className="navbar">
        <button
          type="button"
          onClick={onBack}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            font: 'inherit',
            padding: 0,
          }}
        >
          <div className="logo">
            <span className="logo-icon">
              🤖
            </span>

            <span>
              BizAd <strong>AI</strong>
            </span>
          </div>
        </button>
      </nav>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '470px',
            background: '#ffffff',
            border: '1px solid #e4e7ec',
            borderRadius: '24px',
            padding: '40px',
            boxShadow:
              '0 20px 50px rgba(16, 24, 40, 0.08)',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                width: '58px',
                height: '58px',
                margin: '0 auto 18px',
                borderRadius: '16px',
                background: '#f0eaff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
              }}
            >
              🤖
            </div>

            <h1
              style={{
                margin: '0 0 10px',
                fontSize: '32px',
              }}
            >
              {isSignup
                ? 'Create your account'
                : 'Welcome back'}
            </h1>

            <p
              style={{
                margin: 0,
                color: '#667085',
                lineHeight: '1.6',
              }}
            >
              {isSignup
                ? 'Start creating professional ads with BizAd AI.'
                : 'Sign in to continue to your BizAd AI account.'}
            </p>
          </div>

          {error && (
            <div
              style={{
                background: '#fff5f5',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: '13px 15px',
                borderRadius: '10px',
                marginBottom: '20px',
                fontSize: '14px',
                lineHeight: '1.5',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {isSignup && (
              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="auth-name"
                  style={{
                    display: 'block',
                    marginBottom: '7px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#344054',
                  }}
                >
                  Full name
                </label>

                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="Enter your name"
                  required
                  autoComplete="name"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '13px 14px',
                    border: '1px solid #d0d5dd',
                    borderRadius: '10px',
                    fontSize: '15px',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: '18px' }}>
              <label
                htmlFor="auth-email"
                style={{
                  display: 'block',
                  marginBottom: '7px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#344054',
                }}
              >
                Email address
              </label>

              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
                required
                autoComplete="email"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '13px 14px',
                  border: '1px solid #d0d5dd',
                  borderRadius: '10px',
                  fontSize: '15px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label
                htmlFor="auth-password"
                style={{
                  display: 'block',
                  marginBottom: '7px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#344054',
                }}
              >
                Password
              </label>

              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                required
                minLength={8}
                autoComplete={
                  isSignup
                    ? 'new-password'
                    : 'current-password'
                }
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '13px 14px',
                  border: '1px solid #d0d5dd',
                  borderRadius: '10px',
                  fontSize: '15px',
                  outline: 'none',
                }}
              />
            </div>

            {isSignup && (
              <div style={{ marginBottom: '22px' }}>
                <label
                  htmlFor="auth-confirm-password"
                  style={{
                    display: 'block',
                    marginBottom: '7px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#344054',
                  }}
                >
                  Confirm password
                </label>

                <input
                  id="auth-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  placeholder="Confirm your password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '13px 14px',
                    border: '1px solid #d0d5dd',
                    borderRadius: '10px',
                    fontSize: '15px',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {!isSignup && (
              <div style={{ marginBottom: '22px' }} />
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                border: 'none',
                background: loading
                  ? '#9b7be0'
                  : '#6941c6',
                color: '#ffffff',
                padding: '14px 18px',
                borderRadius: '10px',
                cursor: loading
                  ? 'not-allowed'
                  : 'pointer',
                fontWeight: '700',
                fontSize: '15px',
              }}
            >
              {loading
                ? isSignup
                  ? 'Creating account...'
                  : 'Signing in...'
                : isSignup
                  ? 'Create Account'
                  : 'Sign In'}
            </button>
          </form>

          <div
            style={{
              textAlign: 'center',
              marginTop: '25px',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            {isSignup
              ? 'Already have an account?'
              : "Don't have an account?"}

            <button
              type="button"
              onClick={() => {
                setMode(
                  isSignup ? 'login' : 'signup'
                )
                setError('')
                setPassword('')
                setConfirmPassword('')
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#6941c6',
                cursor: 'pointer',
                fontWeight: '700',
                marginLeft: '5px',
              }}
            >
              {isSignup
                ? 'Sign in'
                : 'Create one'}
            </button>
          </div>
        </div>
      </main>

      <footer>
        <div className="logo">
          <span className="logo-icon">
            🤖
          </span>

          <span>
            BizAd <strong>AI</strong>
          </span>
        </div>

        <p>
          AI-powered advertising for modern businesses.
        </p>

        <span>
          © 2026 BizAd AI
        </span>
      </footer>
    </div>
  )
}

export default Auth