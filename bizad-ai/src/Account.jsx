import React, { useEffect, useState } from 'react'

const API_BASE_URL = 'http://localhost:5000'

function Account({
  user,
  campaigns = [],
  onBack,
  onCreate,
  onMyAds,
  onWhatsApp,
  onPricing,
  onLogout,
}) {
  const displayName = user?.name || 'BizAd AI User'
  const email = user?.email || 'No email available'
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  const flyers = campaigns.filter((item) => item.flyerImage).length
  const videos = campaigns.filter((item) => item.videoId).length

  const [business, setBusiness] = useState({
    businessName: '',
    category: '',
    description: '',
    audience: '',
    location: '',
    contact: '',
    website: '',
  })
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadBusinessProfile = async () => {
      setProfileLoading(true)
      setProfileError('')

      try {
        const response = await fetch(`${API_BASE_URL}/api/business-profile`, {
          credentials: 'include',
        })

        let data
        try {
          data = await response.json()
        } catch {
          throw new Error('BizAd AI returned an invalid business profile response.')
        }

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load your business profile.')
        }

        if (!cancelled && data.business) {
          setBusiness({
            businessName: data.business.businessName || '',
            category: data.business.category || '',
            description: data.business.description || '',
            audience: data.business.audience || '',
            location: data.business.location || '',
            contact: data.business.contact || '',
            website: data.business.website || '',
          })
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Business profile load error:', error)
          setProfileError(error.message || 'Unable to load your business profile.')
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false)
        }
      }
    }

    loadBusinessProfile()

    return () => {
      cancelled = true
    }
  }, [])

  const handleBusinessChange = (event) => {
    const { name, value } = event.target
    setBusiness((current) => ({
      ...current,
      [name]: value,
    }))
    setProfileMessage('')
    setProfileError('')
  }

  const handleSaveBusinessProfile = async (event) => {
    event.preventDefault()

    if (profileSaving) {
      return
    }

    setProfileSaving(true)
    setProfileMessage('')
    setProfileError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/business-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(business),
      })

      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('BizAd AI returned an invalid save response.')
      }

      if (!response.ok) {
        throw new Error(data.error || 'Unable to save your business profile.')
      }

      if (data.business) {
        setBusiness({
          businessName: data.business.businessName || '',
          category: data.business.category || '',
          description: data.business.description || '',
          audience: data.business.audience || '',
          location: data.business.location || '',
          contact: data.business.contact || '',
          website: data.business.website || '',
        })
      }

      setProfileMessage('Business profile saved successfully.')
    } catch (error) {
      console.error('Business profile save error:', error)
      setProfileError(error.message || 'Unable to save your business profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '13px 14px',
    border: '1px solid #d0d5dd',
    borderRadius: '11px',
    background: '#ffffff',
    color: '#101828',
    fontSize: '15px',
    outline: 'none',
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '7px',
    color: '#344054',
    fontSize: '14px',
    fontWeight: '700',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8f9fc',
        color: '#101828',
      }}
    >
      <nav className="navbar">
        <button
          type="button"
          onClick={onBack}
          className="logo"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            font: 'inherit',
          }}
        >
          <span className="logo-icon">🤖</span>
          <span>BizAd <strong>AI</strong></span>
        </button>

        <div className="nav-links">
          <button type="button" onClick={onBack} style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
            Dashboard
          </button>
          <button type="button" onClick={onMyAds} style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
            My Ads
          </button>
          <button type="button" onClick={onWhatsApp} style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
            WhatsApp Marketing
          </button>
          <button type="button" onClick={onPricing} style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
            Pricing
          </button>
        </div>

        <button
          type="button"
          onClick={onLogout}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            font: 'inherit',
            color: '#667085',
            fontWeight: '600',
          }}
        >
          Logout
        </button>
      </nav>

      <main
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: '70px 24px 100px',
        }}
      >
        <div
          style={{
            marginBottom: '22px',
            padding: '14px 18px',
            borderRadius: '14px',
            background: '#101828',
            color: '#ffffff',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span>👤 You are viewing your BizAd AI account</span>
          <span style={{ fontSize: '13px', opacity: 0.8 }}>ACCOUNT</span>
        </div>

        <div style={{ marginBottom: '38px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '8px 14px',
              borderRadius: '999px',
              background: '#f0eaff',
              color: '#6941c6',
              fontSize: '13px',
              fontWeight: '800',
              letterSpacing: '0.05em',
              marginBottom: '18px',
            }}
          >
            👤 ACCOUNT
          </span>
          <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(36px, 5vw, 54px)', lineHeight: 1.05 }}>
            Account dashboard.
          </h1>
          <p style={{ margin: 0, color: '#667085', fontSize: '18px', lineHeight: 1.7 }}>
            Manage your profile, business information and advertising activity from one place.
          </p>
        </div>

        <section
          style={{
            background: '#ffffff',
            border: '1px solid #e4e7ec',
            borderRadius: '24px',
            padding: '30px',
            boxShadow: '0 15px 40px rgba(16, 24, 40, 0.06)',
            marginBottom: '22px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div
              aria-hidden="true"
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '22px',
                background: '#6941c6',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '25px',
                fontWeight: '800',
              }}
            >
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <h2 style={{ margin: '0 0 7px', fontSize: '25px' }}>{displayName}</h2>
              <p style={{ margin: 0, color: '#667085' }}>{email}</p>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: '12px',
                  padding: '6px 10px',
                  borderRadius: '999px',
                  background: '#ecfdf3',
                  color: '#027a48',
                  fontSize: '12px',
                  fontWeight: '800',
                }}
              >
                ✓ Active account
              </span>
            </div>
            <button type="button" onClick={onCreate} className="primary-button">
              Create New Ad →
            </button>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '22px',
          }}
        >
          {[
            ['Campaigns', campaigns.length, '📁'],
            ['Flyers Generated', flyers, '🖼️'],
            ['Videos Generated', videos, '🎬'],
          ].map(([label, value, icon]) => (
            <div
              key={label}
              style={{
                background: '#ffffff',
                border: '1px solid #e4e7ec',
                borderRadius: '18px',
                padding: '23px',
              }}
            >
              <div style={{ fontSize: '23px', marginBottom: '13px' }}>{icon}</div>
              <strong style={{ display: 'block', fontSize: '30px', marginBottom: '4px' }}>{value}</strong>
              <span style={{ color: '#667085', fontSize: '14px' }}>{label}</span>
            </div>
          ))}
        </section>

        <section
          style={{
            background: '#ffffff',
            border: '1px solid #e4e7ec',
            borderRadius: '24px',
            padding: '30px',
            marginBottom: '22px',
          }}
        >
          <div style={{ marginBottom: '24px' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '7px 12px',
                borderRadius: '999px',
                background: '#f0eaff',
                color: '#6941c6',
                fontSize: '12px',
                fontWeight: '800',
                letterSpacing: '0.04em',
                marginBottom: '12px',
              }}
            >
              🏢 BUSINESS PROFILE
            </span>
            <h2 style={{ margin: '0 0 8px', fontSize: '25px' }}>Your business information</h2>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>
              Save your business details once. BizAd AI can reuse them when you create future campaigns.
            </p>
          </div>

          {profileLoading ? (
            <div
              style={{
                padding: '25px',
                borderRadius: '14px',
                background: '#f8f9fc',
                color: '#667085',
                textAlign: 'center',
              }}
            >
              Loading your business profile...
            </div>
          ) : (
            <form onSubmit={handleSaveBusinessProfile}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '18px',
                }}
              >
                <div>
                  <label htmlFor="businessName" style={labelStyle}>Business name *</label>
                  <input id="businessName" name="businessName" value={business.businessName} onChange={handleBusinessChange} placeholder="e.g. JOKBIS Mall" required style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="category" style={labelStyle}>Business category *</label>
                  <input id="category" name="category" value={business.category} onChange={handleBusinessChange} placeholder="e.g. Retail, Restaurant, Fashion" required style={inputStyle} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="description" style={labelStyle}>Business description *</label>
                  <textarea id="description" name="description" value={business.description} onChange={handleBusinessChange} placeholder="Tell us what your business does..." required rows="4" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                </div>

                <div>
                  <label htmlFor="audience" style={labelStyle}>Target customers</label>
                  <input id="audience" name="audience" value={business.audience} onChange={handleBusinessChange} placeholder="e.g. Families and young adults" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="location" style={labelStyle}>Location</label>
                  <input id="location" name="location" value={business.location} onChange={handleBusinessChange} placeholder="e.g. Lagos, Nigeria" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="contact" style={labelStyle}>Contact</label>
                  <input id="contact" name="contact" value={business.contact} onChange={handleBusinessChange} placeholder="Phone or WhatsApp number" style={inputStyle} />
                </div>

                <div>
                  <label htmlFor="website" style={labelStyle}>Website</label>
                  <input id="website" name="website" value={business.website} onChange={handleBusinessChange} placeholder="https://yourbusiness.com" style={inputStyle} />
                </div>
              </div>

              {profileError && (
                <div
                  role="alert"
                  style={{
                    marginTop: '18px',
                    padding: '13px 15px',
                    borderRadius: '11px',
                    background: '#fff5f5',
                    border: '1px solid #fecaca',
                    color: '#b42318',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                >
                  {profileError}
                </div>
              )}

              {profileMessage && (
                <div
                  role="status"
                  style={{
                    marginTop: '18px',
                    padding: '13px 15px',
                    borderRadius: '11px',
                    background: '#ecfdf3',
                    border: '1px solid #abefc6',
                    color: '#027a48',
                    fontSize: '14px',
                    fontWeight: '700',
                  }}
                >
                  ✓ {profileMessage}
                </div>
              )}

              <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="primary-button" disabled={profileSaving}>
                  {profileSaving ? 'Saving...' : 'Save Business Profile'}
                </button>
              </div>
            </form>
          )}
        </section>

        <section
          style={{
            background: '#ffffff',
            border: '1px solid #e4e7ec',
            borderRadius: '20px',
            padding: '26px',
            marginBottom: '22px',
          }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: '20px' }}>Account & security</h3>
          <p style={{ margin: '0 0 20px', color: '#667085', lineHeight: 1.6 }}>
            Your account is protected by BizAd AI authentication. More profile and security controls can be added here as the platform grows.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={onMyAds} style={{ border: '1px solid #d9d6fe', background: '#f9f8ff', color: '#6941c6', padding: '11px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700' }}>
              View My Ads
            </button>
            <button type="button" onClick={onLogout} style={{ border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', padding: '11px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700' }}>
              Log Out
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'block',
            margin: '40px auto 0',
            border: 'none',
            background: 'transparent',
            color: '#6941c6',
            fontSize: '15px',
            fontWeight: '700',
            cursor: 'pointer',
          }}
        >
          ← Back to BizAd AI
        </button>
      </main>

      <footer>
        <div className="logo">
          <span className="logo-icon">🤖</span>
          <span>BizAd <strong>AI</strong></span>
        </div>
        <p>AI-powered advertising for modern businesses.</p>
        <span>© 2026 BizAd AI</span>
      </footer>
    </div>
  )
}

export default Account
