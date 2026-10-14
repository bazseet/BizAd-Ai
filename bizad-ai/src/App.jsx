import { useCallback, useEffect, useState } from 'react'
import { SignIn, SignUp, useAuth, useClerk } from '@clerk/react'
import './App.css'
import CreateAd from './CreateAd'
import WhatsAppMarketing from './WhatsAppMarketing'
import Account from './Account'

const API_BASE_URL = 'http://localhost:5000'

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const { isLoaded: clerkLoaded, isSignedIn, getToken } = useAuth()
  const { signOut } = useClerk()

  const [showCreate, setShowCreate] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [activePage, setActivePage] = useState('home')

  const [campaigns, setCampaigns] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [selectedError, setSelectedError] = useState('')

  const [deleteLoading, setDeleteLoading] = useState(null)
  const [detailCopied, setDetailCopied] = useState(false)
  const [campaignSearch, setCampaignSearch] = useState('')
  const [campaignFilter, setCampaignFilter] = useState('All')

  const [usage, setUsage] = useState({
    plan: 'free',
    creditsRemaining: 25,
    creditsUsed: 0,
    creditsResetAt: null,
  })
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState('')

  // =========================================================
  // CLERK SESSION + API AUTHENTICATION
  // =========================================================

  const apiFetch = useCallback(
    async (url, options = {}) => {
      const token = await getToken()
      const headers = new Headers(options.headers || {})

      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }

      return fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      })
    },
    [getToken]
  )

  useEffect(() => {
    const checkSession = async () => {
      if (!clerkLoaded) {
        return
      }

      if (!isSignedIn) {
        setUser(null)
        setAuthLoading(false)
        return
      }

      setAuthLoading(true)

      try {
        const response = await apiFetch(`${API_BASE_URL}/api/auth/me`)

        if (!response.ok) {
          setUser(null)
          return
        }

        const data = await response.json()

        if (data.user) {
          setUser(data.user)
          setActivePage('home')
          setShowAuth(false)
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error('Session check error:', error)
        setUser(null)
      } finally {
        setAuthLoading(false)
      }
    }

    checkSession()
  }, [apiFetch, clerkLoaded, isSignedIn])

  // =========================================================
// PAYSTACK BUSINESS PAYMENT VERIFICATION
// =========================================================

useEffect(() => {
  const verifyBusinessPayment = async () => {
    if (
      !clerkLoaded ||
      !isSignedIn ||
      !user
    ) {
      return
    }

    const params =
      new URLSearchParams(window.location.search)

    const payment =
      params.get('payment')

    const reference =
      params.get('reference') ||
      params.get('trxref')

    if (
      payment !== 'success' ||
      !reference
    ) {
      return
    }

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/payments/verify-business`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reference,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to verify your payment.'
        )
      }

      if (data.user) {
        setUser((previousUser) => ({
          ...previousUser,
          ...data.user,
        }))

        setUsage((previousUsage) => ({
          ...previousUsage,
          plan:
            data.user.plan || 'business',
          creditsRemaining:
            data.user.creditsRemaining ?? 200,
          creditsUsed:
            data.user.creditsUsed ?? 0,
          creditsResetAt:
            data.user.creditsResetAt ?? null,
        }))
      }

      // Remove payment details so refresh
      // does not verify the same transaction again.
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      )

      window.alert(
        'Payment successful! Your BizAd Business plan is now active with 200 credits.'
      )
    } catch (error) {
      console.error(
        'Paystack verification error:',
        error
      )

      window.alert(
        error.message ||
          'Your payment could not be verified.'
      )
    }
  }

  verifyBusinessPayment()
}, [
  apiFetch,
  clerkLoaded,
  isSignedIn,
  user?.id,
])

  // =========================================================
  // OPEN AUTH
  // =========================================================

  const openAuth = (mode = 'login') => {
    setAuthMode(mode)
    setActivePage('auth')
    setShowAuth(true)
    setShowCreate(false)
    setShowHistory(false)
    setShowWhatsApp(false)
    setShowAccount(false)
  }

  // =========================================================
  // REQUIRE LOGIN
  // =========================================================

  const requireLogin = (action) => {
    if (!user) {
      openAuth('login')
      return
    }

    action()
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  const handleLogout = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
      setActivePage('home')
      setShowAuth(false)
      setShowCreate(false)
      setShowHistory(false)
      setShowWhatsApp(false)
      setShowAccount(false)
      setSelectedCampaign(null)
      setCampaigns([])
    }
  }

  // =========================================================
  // OPEN ACCOUNT
  // =========================================================

  const handleOpenDashboard = () => {
    setActivePage('home')
    setShowCreate(false)
    setEditingCampaign(null)
    setShowHistory(false)
    setSelectedCampaign(null)
    setSelectedError('')
    setShowWhatsApp(false)
    setShowAccount(false)

    window.setTimeout(() => {
      document.getElementById('dashboard')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 0)
  }

  const handleOpenWhatsApp = () => {
    if (!user) {
      openAuth('login')
      return
    }

    setActivePage('whatsapp')
    setShowAuth(false)
    setShowCreate(false)
    setEditingCampaign(null)
    setShowHistory(false)
    setSelectedCampaign(null)
    setSelectedError('')
    setShowAccount(false)
    setShowWhatsApp(true)
  }

  const handleOpenAccount = () => {
    // This button is only rendered for authenticated users,
    // so open the account page directly and clear every other view.
    if (!user) {
      openAuth('login')
      return
    }

    setActivePage('account')
    setShowCreate(false)
    setEditingCampaign(null)
    setShowHistory(false)
    setSelectedCampaign(null)
    setSelectedError('')
    setShowWhatsApp(false)
    setShowAccount(true)
  }

  // =========================================================
  // LOAD USAGE / CREDIT BALANCE
  // =========================================================

  const loadUsage = async () => {
    if (!user) {
      setUsage({
        plan: 'free',
        creditsRemaining: 25,
        creditsUsed: 0,
        creditsResetAt: null,
      })
      return
    }

    setUsageLoading(true)
    setUsageError('')

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/usage`,
        {
          credentials: 'include',
        }
      )

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null)
          openAuth('login')
          return
        }

        throw new Error(
          data.error || 'Unable to load your credit balance.'
        )
      }

      if (data.usage) {
        setUsage(data.usage)
      }
    } catch (error) {
      console.error('Usage loading error:', error)
      setUsageError(
        error.message || 'Unable to load your credit balance.'
      )
    } finally {
      setUsageLoading(false)
    }
  }

  // =========================================================
  // LOAD CAMPAIGN HISTORY
  // =========================================================

  const loadCampaigns = async () => {
    if (!user) {
      openAuth('login')
      return
    }

    setHistoryLoading(true)
    setHistoryError('')

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/campaigns`,
        {
          credentials: 'include',
        }
      )

      let data

      try {
        data = await response.json()
      } catch {
        throw new Error(
          'BizAd AI returned an invalid campaign history response.'
        )
      }

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null)
          openAuth('login')
          return
        }

        throw new Error(
          data.error ||
            'Unable to load your campaign history.'
        )
      }

      setCampaigns(
        Array.isArray(data.campaigns)
          ? data.campaigns
          : []
      )
    } catch (error) {
      console.error(
        'Campaign history error:',
        error
      )

      if (
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('ERR_CONNECTION_REFUSED')
      ) {
        setHistoryError(
          'BizAd AI server is not available. Please make sure the backend is running.'
        )
      } else {
        setHistoryError(
          error.message ||
            'Unable to load your campaign history.'
        )
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  // =========================================================
  // LOAD DASHBOARD CAMPAIGN DATA
  // =========================================================

  useEffect(() => {
    if (!user) {
      setCampaigns([])
      return
    }

    loadCampaigns()
    loadUsage()
  }, [user])

  // =========================================================
  // OPEN CAMPAIGN HISTORY
  // =========================================================

  const handleOpenHistory = () => {
    requireLogin(() => {
      setActivePage('history')
      setShowCreate(false)
      setEditingCampaign(null)
      setShowHistory(true)
      setSelectedCampaign(null)
      setSelectedError('')

      loadCampaigns()
    })
  }

  // =========================================================
  // VIEW SINGLE CAMPAIGN
  // =========================================================

  const handleViewCampaign = async (campaignId) => {
    setSelectedLoading(true)
    setSelectedError('')
    setSelectedCampaign(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/campaigns/${campaignId}`,
        {
          credentials: 'include',
        }
      )

      let data

      try {
        data = await response.json()
      } catch {
        throw new Error(
          'BizAd AI returned an invalid campaign response.'
        )
      }

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null)
          openAuth('login')
          return
        }

        throw new Error(
          data.error ||
            'Unable to load this campaign.'
        )
      }

      setSelectedCampaign(data.campaign)
    } catch (error) {
      console.error(
        'Single campaign error:',
        error
      )

      setSelectedError(
        error.message ||
          'Unable to load this campaign.'
      )
    } finally {
      setSelectedLoading(false)
    }
  }

  // =========================================================
  // EDIT CAMPAIGN
  // =========================================================

  const handleEditCampaign = async (campaignId) => {
    setSelectedLoading(true)
    setSelectedError('')

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/campaigns/${campaignId}`,
        {
          credentials: 'include',
        }
      )

      let data

      try {
        data = await response.json()
      } catch {
        throw new Error(
          'BizAd AI returned an invalid campaign response.'
        )
      }

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null)
          setCampaigns([])
          setSelectedCampaign(null)
          setEditingCampaign(null)
          openAuth('login')
          return
        }

        throw new Error(
          data.error ||
            'Unable to load this campaign for editing.'
        )
      }

      if (!data.campaign) {
        throw new Error(
          'Campaign details were not returned by BizAd AI.'
        )
      }

      setEditingCampaign(data.campaign)
      setSelectedCampaign(null)
      setSelectedError('')
      setActivePage('create')
      setShowHistory(false)
      setShowCreate(true)
    } catch (error) {
      console.error(
        'Edit campaign error:',
        error
      )

      setSelectedError(
        error.message ||
          'Unable to open this campaign for editing.'
      )
    } finally {
      setSelectedLoading(false)
    }
  }

  // =========================================================
  // CAMPAIGN SAVED / UPDATED
  // =========================================================

  const handleCampaignSaved = async (savedCampaign) => {
    setEditingCampaign(null)

    if (savedCampaign?.id) {
      setCampaigns((currentCampaigns) => {
        const exists = currentCampaigns.some(
          (campaignItem) => campaignItem.id === savedCampaign.id
        )

        if (exists) {
          return currentCampaigns.map((campaignItem) =>
            campaignItem.id === savedCampaign.id
              ? { ...campaignItem, ...savedCampaign }
              : campaignItem
          )
        }

        return [savedCampaign, ...currentCampaigns]
      })
    } else if (user) {
      await loadCampaigns()
    }
  }

  // =========================================================
  // DELETE CAMPAIGN
  // =========================================================

  const handleDeleteCampaign = async (campaignId) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this campaign? This action cannot be undone.'
    )

    if (!confirmed) {
      return
    }

    setDeleteLoading(campaignId)
    setHistoryError('')

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/campaigns/${campaignId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      let data

      try {
        data = await response.json()
      } catch {
        throw new Error(
          'BizAd AI returned an invalid deletion response.'
        )
      }

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null)
          setCampaigns([])
          setSelectedCampaign(null)
          openAuth('login')
          return
        }

        throw new Error(
          data.error ||
            'Unable to delete this campaign.'
        )
      }

      // Remove the deleted campaign immediately
      setCampaigns((currentCampaigns) =>
        currentCampaigns.filter(
          (campaignItem) =>
            campaignItem.id !== campaignId
        )
      )

      // If the deleted campaign is currently open,
      // close its detail view.
      if (
        selectedCampaign?.id === campaignId
      ) {
        setSelectedCampaign(null)
      }

      setSelectedError('')

      console.log(
        'Campaign deleted successfully:',
        campaignId
      )
    } catch (error) {
      console.error(
        'Delete campaign error:',
        error
      )

      setHistoryError(
        error.message ||
          'Unable to delete this campaign.'
      )
    } finally {
      setDeleteLoading(null)
    }
  }

  // =========================================================
  // FILTER CAMPAIGNS
  // =========================================================

  const filteredCampaigns = campaigns.filter((campaignItem) => {
    const searchTerm = campaignSearch.trim().toLowerCase()

    const matchesSearch =
      !searchTerm ||
      [
        campaignItem.businessName,
        campaignItem.category,
        campaignItem.offer,
        campaignItem.adType,
      ].some((value) =>
        String(value || '').toLowerCase().includes(searchTerm)
      )

    const matchesFilter =
      campaignFilter === 'All' ||
      (campaignItem.adType || 'Ad Copy') === campaignFilter

    return matchesSearch && matchesFilter
  })

  // =========================================================
  // FORMAT DATE
  // =========================================================

  const formatCampaignDate = (dateValue) => {
    if (!dateValue) {
      return 'Date unavailable'
    }

    const date = new Date(dateValue)

    if (Number.isNaN(date.getTime())) {
      return 'Date unavailable'
    }

    return date.toLocaleDateString(
      'en-NG',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }
    )
  }

  // =========================================================
  // AUTH LOADING
  // =========================================================

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8f9fc',
          flexDirection: 'column',
          gap: '15px',
        }}
      >
        <div style={{ fontSize: '42px' }}>
          🤖
        </div>

        <strong>
          Loading BizAd AI...
        </strong>
      </div>
    )
  }

  // =========================================================
  // AUTH PAGE
  // =========================================================

  if (activePage === 'auth' || showAuth) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#f8f9fc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: '100%', maxWidth: '480px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '20px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setActivePage('home')
                setShowAuth(false)
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#6941c6',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '14px',
              }}
            >
              ← Back to BizAd AI
            </button>
          </div>

          {authMode === 'signup' ? (
            <SignUp
              routing="hash"
              appearance={{
                variables: {
                  colorPrimary: '#6941c6',
                },
              }}
            />
          ) : (
            <SignIn
              routing="hash"
              appearance={{
                variables: {
                  colorPrimary: '#6941c6',
                },
              }}
            />
          )}

          <div
            style={{
              textAlign: 'center',
              marginTop: '18px',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            {authMode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    color: '#6941c6',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontWeight: '700',
                  }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    color: '#6941c6',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontWeight: '700',
                  }}
                >
                  Create one
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // =========================================================
  // ACCOUNT PAGE
  // =========================================================

  if (activePage === 'account' || showAccount) {
    return (
      <Account
        user={user}
        campaigns={campaigns}
        onBack={() => {
          setActivePage('home')
          setShowAccount(false)
        }}
        onCreate={() => {
          setActivePage('create')
          setShowAccount(false)
          setShowCreate(true)
        }}
        onMyAds={() => {
          setShowAccount(false)
          handleOpenHistory()
        }}
        onWhatsApp={handleOpenWhatsApp}
        onPricing={() => {
          setShowAccount(false)
          handleOpenDashboard()
          window.setTimeout(() => {
            document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 50)
        }}
        onLogout={handleLogout}
      />
    )
  }

  // =========================================================
  // WHATSAPP MARKETING PAGE
  // =========================================================

  if (activePage === 'whatsapp' || showWhatsApp) {
    return (
      <WhatsAppMarketing
        onBack={() => {
          setActivePage('home')
          setShowWhatsApp(false)
        }}
      />
    )
  }

  // =========================================================
  // CREATE AD PAGE
  // =========================================================

  if (activePage === 'create' || showCreate) {
    return (
      <CreateAd
        editingCampaign={editingCampaign}
        onSaved={handleCampaignSaved}
        onBack={() => {
          setActivePage('home')
          setShowCreate(false)
          setEditingCampaign(null)
        }}
      />
    )
  }

  // =========================================================
  // CAMPAIGN HISTORY PAGE
  // =========================================================

  if (activePage === 'history' || showHistory) {
    return (
      <div
        className="app"
        style={{
          minHeight: '100vh',
          background: '#f8f9fc',
        }}
      >
        <nav className="navbar">
          <div className="logo">
            <span className="logo-icon">
              🤖
            </span>

            <span>
              BizAd <strong>AI</strong>
            </span>
          </div>

          <div className="nav-links">
            <button
              type="button"
              onClick={handleOpenDashboard}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit' }}
            >
              Dashboard
            </button>

            <button
              type="button"
              onClick={handleOpenHistory}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', fontWeight: '600' }}
            >
              My Ads
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit' }}
            >
              WhatsApp Marketing
            </button>

            <a href="#pricing">Pricing</a>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            {user && (
              <>
                <button
                  type="button"
                  onClick={handleOpenAccount}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: '#6941c6',
                    fontWeight: '700',
                  }}
                >
                  👤 Account
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
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
              </>
            )}


          </div>
        </nav>

        <main 
          style={{
            maxWidth: '1180px',
            margin: '0 auto',
            padding: '80px 24px 100px',
          }}
        >
          <div
            style={{
              maxWidth: '720px',
              marginBottom: '48px',
            }}
          >
            <div
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                borderRadius: '999px',
                background: '#f0eaff',
                color: '#6941c6',
                fontSize: '13px',
                fontWeight: '700',
                letterSpacing: '0.05em',
                marginBottom: '18px',
              }}
            >
              📁 MY ADS
            </div>

            <h1
              style={{
                fontSize:
                  'clamp(36px, 5vw, 58px)',
                lineHeight: '1.05',
                margin: '0 0 18px',
              }}
            >
              {user?.name
                ? `${user.name}'s campaigns.`
                : 'Your campaign history.'}
            </h1>

            <p
              style={{
                fontSize: '18px',
                lineHeight: '1.7',
                color: '#667085',
                margin: 0,
              }}
            >
              All your saved BizAd AI campaigns
              in one place.
            </p>
          </div>

          {historyLoading && (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e4e7ec',
                borderRadius: '20px',
                padding: '60px 30px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '42px',
                  marginBottom: '16px',
                }}
              >
                🤖
              </div>

              <h3>
                Loading your campaigns...
              </h3>

              <p
                style={{
                  color: '#667085',
                }}
              >
                Retrieving your saved campaigns
                from BizAd AI.
              </p>
            </div>
          )}

          {!historyLoading &&
            historyError && (
              <div
                style={{
                  background: '#fff5f5',
                  border: '1px solid #fecaca',
                  borderRadius: '16px',
                  padding: '22px',
                  color: '#dc2626',
                  marginBottom: '30px',
                }}
              >
                {historyError}

                <button
                  type="button"
                  onClick={loadCampaigns}
                  style={{
                    display: 'block',
                    marginTop: '14px',
                    border: 'none',
                    background: '#dc2626',
                    color: '#ffffff',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Try Again
                </button>
              </div>
            )}

          {!historyLoading &&
            !historyError &&
            campaigns.length === 0 && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e4e7ec',
                  borderRadius: '24px',
                  padding: '70px 30px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: '52px',
                    marginBottom: '18px',
                  }}
                >
                  ✨
                </div>

                <h2>
                  No campaigns yet
                </h2>

                <p
                  style={{
                    color: '#667085',
                    maxWidth: '480px',
                    margin:
                      '0 auto 28px',
                    lineHeight: '1.7',
                  }}
                >
                  Create your first advertising
                  campaign and it will appear
                  here automatically.
                </p>

                <button
                  className="primary-button"
                  onClick={() => {
                    setActivePage('create')
                    setShowHistory(false)
                    setShowCreate(true)
                  }}
                >
                  Create Your First Ad →
                </button>
              </div>
            )}

          {!historyLoading &&
            !historyError &&
            campaigns.length > 0 && (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    alignItems: 'center',
                    marginBottom: '22px',
                    gap: '20px',
                    flexWrap: 'wrap',
                  }}
                >
                  <h2 style={{ margin: 0 }}>
                    Saved campaigns
                  </h2>

                  <span
                    style={{
                      color: '#667085',
                      fontSize: '14px',
                    }}
                  >
                    {filteredCampaigns.length} of {campaigns.length}{' '}
                    {campaigns.length === 1 ? 'campaign' : 'campaigns'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '24px',
                  }}
                >
                  <div style={{ flex: '1 1 280px' }}>
                    <input
                      type="search"
                      value={campaignSearch}
                      onChange={(event) => setCampaignSearch(event.target.value)}
                      placeholder="Search by business, category or offer..."
                      aria-label="Search campaigns"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '13px 15px',
                        border: '1px solid #d0d5dd',
                        borderRadius: '10px',
                        font: 'inherit',
                        outline: 'none',
                        background: '#ffffff',
                      }}
                    />
                  </div>

                  <select
                    value={campaignFilter}
                    onChange={(event) => setCampaignFilter(event.target.value)}
                    aria-label="Filter campaigns by ad type"
                    style={{
                      flex: '0 1 180px',
                      padding: '13px 15px',
                      border: '1px solid #d0d5dd',
                      borderRadius: '10px',
                      font: 'inherit',
                      background: '#ffffff',
                      color: '#344054',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="All">All ad types</option>
                    <option value="Video Ad">Video Ad</option>
                    <option value="Flyer">Flyer</option>
                    <option value="Ad Copy">Ad Copy</option>
                  </select>

                  {(campaignSearch || campaignFilter !== 'All') && (
                    <button
                      type="button"
                      onClick={() => {
                        setCampaignSearch('')
                        setCampaignFilter('All')
                      }}
                      style={{
                        border: '1px solid #d0d5dd',
                        background: '#ffffff',
                        color: '#475467',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '600',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {filteredCampaigns.length === 0 ? (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e4e7ec',
                      borderRadius: '18px',
                      padding: '50px 24px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '42px', marginBottom: '12px' }}>🔎</div>
                    <h3 style={{ margin: '0 0 8px' }}>No matching campaigns</h3>
                    <p style={{ margin: 0, color: '#667085' }}>
                      Try a different search term or ad type filter.
                    </p>
                  </div>
                ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '22px',
                  }}
                >
                  {filteredCampaigns.map(
                    (campaignItem) => {
                      const isDeleting =
                        deleteLoading ===
                        campaignItem.id

                      return (
                        <div
                          key={campaignItem.id}
                          style={{
                            background: '#ffffff',
                            border:
                              '1px solid #e4e7ec',
                            borderRadius: '20px',
                            padding: '26px',
                            boxShadow:
                              '0 10px 30px rgba(16, 24, 40, 0.05)',
                            opacity:
                              isDeleting
                                ? 0.65
                                : 1,
                            transition:
                              'opacity 0.2s ease',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent:
                                'space-between',
                              alignItems:
                                'flex-start',
                              gap: '15px',
                              marginBottom:
                                '20px',
                            }}
                          >
                            <div
                              style={{
                                width: '46px',
                                height: '46px',
                                borderRadius:
                                  '12px',
                                background:
                                  '#f0eaff',
                                display: 'flex',
                                alignItems:
                                  'center',
                                justifyContent:
                                  'center',
                                fontSize:
                                  '22px',
                              }}
                            >
                              🤖
                            </div>

                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: '700',
                                color: '#6941c6',
                                background:
                                  '#f5f3ff',
                                padding:
                                  '7px 10px',
                                borderRadius:
                                  '999px',
                              }}
                            >
                              {campaignItem.adType ||
                                'Ad Copy'}
                            </span>
                          </div>

                          <h3
                            style={{
                              margin:
                                '0 0 8px',
                              fontSize:
                                '21px',
                            }}
                          >
                            {campaignItem.businessName ||
                              'Business'}
                          </h3>

                          <p
                            style={{
                              margin:
                                '0 0 8px',
                              color:
                                '#667085',
                              fontSize:
                                '14px',
                            }}
                          >
                            {campaignItem.category ||
                              'Business'}
                          </p>

                          {campaignItem.offer && (
                            <div
                              style={{
                                margin:
                                  '16px 0',
                                padding:
                                  '10px 12px',
                                background:
                                  '#fafafa',
                                borderRadius:
                                  '10px',
                                fontSize:
                                  '13px',
                                color:
                                  '#475467',
                              }}
                            >
                              🎁{' '}
                              {campaignItem.offer}
                            </div>
                          )}

                          <div
                            style={{
                              fontSize:
                                '13px',
                              color:
                                '#98a2b3',
                              marginBottom:
                                '20px',
                            }}
                          >
                            Created{' '}
                            {formatCampaignDate(
                              campaignItem.createdAt
                            )}
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns:
                                'repeat(3, minmax(0, 1fr))',
                              gap: '10px',
                            }}
                          >
                            <button
                              type="button"
                              disabled={
                                isDeleting
                              }
                              onClick={() =>
                                handleViewCampaign(
                                  campaignItem.id
                                )
                              }
                              style={{
                                width: '100%',
                                border:
                                  '1px solid #d0d5dd',
                                background:
                                  '#ffffff',
                                padding:
                                  '13px 12px',
                                borderRadius:
                                  '10px',
                                cursor:
                                  isDeleting
                                    ? 'not-allowed'
                                    : 'pointer',
                                fontWeight:
                                  '600',
                                fontSize:
                                  '14px',
                              }}
                            >
                              View Campaign →
                            </button>

                            <button
                              type="button"
                              disabled={
                                isDeleting
                              }
                              onClick={() =>
                                handleEditCampaign(
                                  campaignItem.id
                                )
                              }
                              style={{
                                width: '100%',
                                border:
                                  '1px solid #d9d6fe',
                                background:
                                  '#f9f8ff',
                                color:
                                  '#6941c6',
                                padding:
                                  '13px 12px',
                                borderRadius:
                                  '10px',
                                cursor:
                                  isDeleting
                                    ? 'not-allowed'
                                    : 'pointer',
                                fontWeight:
                                  '600',
                                fontSize:
                                  '14px',
                              }}
                            >
                              ✏️ Edit
                            </button>

                            <button
                              type="button"
                              disabled={
                                isDeleting
                              }
                              onClick={() =>
                                handleDeleteCampaign(
                                  campaignItem.id
                                )
                              }
                              style={{
                                width: '100%',
                                border:
                                  '1px solid #fecaca',
                                background:
                                  '#fff5f5',
                                color:
                                  '#dc2626',
                                padding:
                                  '13px 12px',
                                borderRadius:
                                  '10px',
                                cursor:
                                  isDeleting
                                    ? 'not-allowed'
                                    : 'pointer',
                                fontWeight:
                                  '600',
                                fontSize:
                                  '14px',
                              }}
                            >
                              {isDeleting
                                ? 'Deleting...'
                                : 'Delete'}
                            </button>
                          </div>
                        </div>
                      )
                    }
                  )}
                </div>
                )}
              </>
            )}

          {selectedLoading && (
            <div
              style={{
                marginTop: '30px',
                background: '#ffffff',
                border:
                  '1px solid #e4e7ec',
                borderRadius: '20px',
                padding: '40px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '32px',
                  marginBottom: '10px',
                }}
              >
                🤖
              </div>

              <strong>
                Loading campaign...
              </strong>

              <p
                style={{
                  color: '#667085',
                  marginBottom: 0,
                }}
              >
                Retrieving your saved campaign.
              </p>
            </div>
          )}

          {selectedError && (
            <div
              style={{
                marginTop: '30px',
                background: '#fff5f5',
                border:
                  '1px solid #fecaca',
                borderRadius: '16px',
                padding: '20px',
                color: '#dc2626',
              }}
            >
              {selectedError}
            </div>
          )}

          {selectedCampaign && (
            <div
              style={{
                marginTop: '35px',
                background: '#ffffff',
                border: '1px solid #e4e7ec',
                borderRadius: '24px',
                padding: '35px',
                boxShadow: '0 15px 40px rgba(16, 24, 40, 0.07)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '20px',
                  marginBottom: '28px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: '800',
                      letterSpacing: '0.06em',
                      color: '#6941c6',
                      background: '#f4f3ff',
                      padding: '6px 10px',
                      borderRadius: '999px',
                    }}
                  >
                    ✨ SAVED CAMPAIGN
                  </span>

                  <h2
                    style={{
                      margin: '12px 0 6px',
                      fontSize: '30px',
                      lineHeight: '1.2',
                    }}
                  >
                    {selectedCampaign.businessName}
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      color: '#667085',
                      fontSize: '14px',
                    }}
                  >
                    {selectedCampaign.category || 'Advertising Campaign'}
                    {' • '}
                    {selectedCampaign.adType}
                    {' • '}
                    {formatCampaignDate(selectedCampaign.createdAt)}
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleEditCampaign(selectedCampaign.id)}
                    disabled={deleteLoading === selectedCampaign.id}
                    style={{
                      border: '1px solid #d9d6fe',
                      background: '#f9f8ff',
                      color: '#6941c6',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      cursor: deleteLoading === selectedCampaign.id ? 'not-allowed' : 'pointer',
                      fontWeight: '700',
                    }}
                  >
                    ✏️ Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteCampaign(selectedCampaign.id)}
                    disabled={deleteLoading === selectedCampaign.id}
                    style={{
                      border: '1px solid #fecaca',
                      background: '#fff5f5',
                      color: '#dc2626',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      cursor: deleteLoading === selectedCampaign.id ? 'not-allowed' : 'pointer',
                      fontWeight: '700',
                    }}
                  >
                    {deleteLoading === selectedCampaign.id ? 'Deleting...' : '🗑️ Delete'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCampaign(null)
                      setDetailCopied(false)
                    }}
                    style={{
                      border: '1px solid #d0d5dd',
                      background: '#ffffff',
                      color: '#344054',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: '700',
                    }}
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

             <div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    width: '100%',
    marginBottom: '25px',
    boxSizing: 'border-box',
  }}
>
                <div
                  style={{
                    background: '#f8f9fc',
                    border: '1px solid #eaecf0',
                    borderRadius: '14px',
                    padding: '15px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#667085', marginBottom: '5px' }}>
                    Target Audience
                  </div>
                  <strong style={{ color: '#344054' }}>
                    {selectedCampaign.audience || 'Not specified'}
                  </strong>
                </div>

                <div
                  style={{
                    background: '#f8f9fc',
                    border: '1px solid #eaecf0',
                    borderRadius: '14px',
                    padding: '15px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#667085', marginBottom: '5px' }}>
                    Location
                  </div>
                  <strong style={{ color: '#344054' }}>
                    {selectedCampaign.location || 'Not specified'}
                  </strong>
                </div>

                <div
                  style={{
                    background: '#f8f9fc',
                    border: '1px solid #eaecf0',
                    borderRadius: '14px',
                    padding: '15px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#667085', marginBottom: '5px' }}>
                    Assets
                  </div>
                  <strong style={{ color: '#344054' }}>
                    {selectedCampaign.flyerImage ? '🖼️ Flyer' : ''}
                    {selectedCampaign.flyerImage && selectedCampaign.videoId ? '  •  ' : ''}
                    {selectedCampaign.videoId ? `🎬 Video${selectedCampaign.videoSeconds ? ` (${selectedCampaign.videoSeconds}s)` : ''}` : ''}
                    {!selectedCampaign.flyerImage && !selectedCampaign.videoId ? 'Ad copy only' : ''}
                  </strong>
                </div>
              </div>

              {selectedCampaign.offer && (
                <div
                  style={{
                    background: '#f9f5ff',
                    border: '1px solid #e9d7fe',
                    borderRadius: '14px',
                    padding: '16px 18px',
                    marginBottom: '25px',
                    color: '#6941c6',
                    fontWeight: '700',
                  }}
                >
                  🎁 <span style={{ marginLeft: '5px' }}>{selectedCampaign.offer}</span>
                </div>
              )}

              {(selectedCampaign.flyerImage || selectedCampaign.videoId) && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: selectedCampaign.flyerImage && selectedCampaign.videoId ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
                    gap: '20px',
                    marginBottom: '25px',
                  }}
                >
                  {selectedCampaign.flyerImage && (
                    <div
                      style={{
                        border: '1px solid #eaecf0',
                        borderRadius: '18px',
                        padding: '16px',
                        background: '#ffffff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px',
                          marginBottom: '12px',
                        }}
                      >
                        <strong>🖼️ Flyer Preview</strong>
                        <a
                          href={selectedCampaign.flyerImage}
                          download={`${selectedCampaign.businessName || 'bizad-ai'}-flyer.png`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            textDecoration: 'none',
                            color: '#6941c6',
                            fontSize: '13px',
                            fontWeight: '700',
                          }}
                        >
                          Open / Save ↗
                        </a>
                      </div>
                      <div
                        style={{
                          background: '#f8f9fc',
                          borderRadius: '14px',
                          overflow: 'hidden',
                          display: 'flex',
                          justifyContent: 'center',
                        }}
                      >
                        <img
                          src={selectedCampaign.flyerImage}
                          alt={`${selectedCampaign.businessName} flyer`}
                          style={{
                            display: 'block',
                            width: '100%',
                            maxHeight: '620px',
                            objectFit: 'contain',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {selectedCampaign.videoId && (
                    <div
                      style={{
                        border: '1px solid #eaecf0',
                        borderRadius: '18px',
                        padding: '16px',
                        background: '#ffffff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px',
                          marginBottom: '12px',
                        }}
                      >
                        <strong>🎬 Video Preview</strong>
                        {selectedCampaign.videoSeconds && (
                          <span style={{ color: '#667085', fontSize: '13px' }}>
                            {selectedCampaign.videoSeconds}s
                          </span>
                        )}
                      </div>
                      <video
                        controls
                        playsInline
                        preload="metadata"
                        style={{
                          width: '100%',
                          maxHeight: '620px',
                          display: 'block',
                          background: '#101828',
                          borderRadius: '14px',
                        }}
                        src={`${API_BASE_URL}/api/video-stream/${selectedCampaign.videoId}`}
                      >
                        Your browser does not support video playback.
                      </video>
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  border: '1px solid #eaecf0',
                  borderRadius: '18px',
                  overflow: 'hidden',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    padding: '17px 20px',
                    borderBottom: '1px solid #eaecf0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '17px' }}>✍️ AI Ad Copy</strong>
                    <div style={{ color: '#667085', fontSize: '13px', marginTop: '3px' }}>
                      Your generated campaign message
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!selectedCampaign.campaignText) return
                      try {
                        await navigator.clipboard.writeText(selectedCampaign.campaignText)
                        setDetailCopied(true)
                        window.setTimeout(() => setDetailCopied(false), 1800)
                      } catch (error) {
                        console.error('Campaign copy error:', error)
                      }
                    }}
                    disabled={!selectedCampaign.campaignText}
                    style={{
                      border: '1px solid #d9d6fe',
                      background: '#f9f8ff',
                      color: '#6941c6',
                      padding: '9px 13px',
                      borderRadius: '9px',
                      cursor: selectedCampaign.campaignText ? 'pointer' : 'not-allowed',
                      fontWeight: '700',
                    }}
                  >
                    {detailCopied ? '✓ Copied' : '📋 Copy Ad Copy'}
                  </button>
                </div>

                <div
                  style={{
                    background: '#f8f9fc',
                    padding: '22px',
                    overflowX: 'auto',
                  }}
                >
                  {selectedCampaign.campaignText ? (
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'inherit',
                        fontSize: '15px',
                        lineHeight: '1.75',
                        color: '#344054',
                      }}
                    >
                      {selectedCampaign.campaignText}
                    </pre>
                  ) : (
                    <div style={{ color: '#667085', textAlign: 'center', padding: '20px' }}>
                      No ad copy is available for this campaign.
                    </div>
                  )}
                </div>
              </div>

              {(selectedCampaign.contact || selectedCampaign.website) && (
                <div
                  style={{
                    display: 'flex',
                    gap: '20px',
                    flexWrap: 'wrap',
                    marginTop: '20px',
                    color: '#667085',
                    fontSize: '14px',
                  }}
                >
                  {selectedCampaign.contact && <span>📞 {selectedCampaign.contact}</span>}
                  {selectedCampaign.website && <span>🌐 {selectedCampaign.website}</span>}
                </div>
              )}
            </div>
          )}

         <button
  type="button"
  onClick={handleOpenDashboard}
  style={{
    display: 'block',
    margin:
      '55px auto 0',
    border: 'none',
    background:
      'transparent',
    color: '#6941c6',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  }}
>
  ← Back to BizAd AI
</button>
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

  // =========================================================
  // LANDING PAGE
  // =========================================================

  return (
    <div className="app">
      <nav className="navbar">
        <div className="logo">
          <span className="logo-icon">
            🤖
          </span>

          <span>
            BizAd <strong>AI</strong>
          </span>
        </div>

        <div className="nav-links">
          {user ? (
            <>
              <button
                type="button"
                onClick={handleOpenDashboard}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', fontWeight: '600' }}
              >
                Dashboard
              </button>

              <button
                type="button"
                onClick={handleOpenHistory}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit' }}
              >
                My Ads
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit' }}
              >
                WhatsApp Marketing
              </button>

              <a href="#pricing">Pricing</a>
            </>
          ) : (
            <>
              <a href="#how-it-works">How it works</a>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {user ? (
            <>
              <button
                type="button"
                onClick={handleOpenAccount}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  font: 'inherit',
                  color: '#6941c6',
                  fontWeight: '700',
                }}
              >
                👤 Account
              </button>
              <button
                type="button"
                onClick={handleLogout}
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
            </>
          ) : (
            <button
              type="button"
              onClick={() => openAuth('login')}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                font: 'inherit',
                color: '#6941c6',
                fontWeight: '700',
              }}
            >
              Sign In
            </button>
          )}


        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="badge">
            ✨ AI-powered advertising for businesses
          </div>

          <h1>
            Turn your business into
            <span>
              {' '}
              ads that sell.
            </span>
          </h1>

          <p className="hero-text">
            Create professional video ads, flyers,
            social media captions and marketing
            content in minutes — powered by AI.
          </p>

          <div className="hero-buttons">
            <button
              className="primary-button"
              onClick={() =>
                requireLogin(() => {
                  setActivePage('create')
                  setShowCreate(true)
                })
              }
            >
              Create Your First Ad →
            </button>

            <a
              href="#how-it-works"
              className="secondary-button"
            >
              See How It Works
            </a>
          </div>

          <p className="no-card">
            ✓ No designer required
            &nbsp;&nbsp; ✓ Create in minutes
          </p>
        </section>

        {user && (
          <section
            id="dashboard"
            style={{
              maxWidth: '1180px',
              margin: '0 auto',
              padding: '0 24px 70px',
            }}
          >
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e4e7ec',
                borderRadius: '24px',
                padding: '32px',
                boxShadow:
                  '0 12px 35px rgba(16, 24, 40, 0.06)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '24px',
                  flexWrap: 'wrap',
                  marginBottom: '28px',
                }}
              >
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      color: '#6941c6',
                      fontSize: '12px',
                      fontWeight: '800',
                      letterSpacing: '0.08em',
                      marginBottom: '8px',
                    }}
                  >
                    YOUR DASHBOARD
                  </span>

                  <h2
                    style={{
                      margin: '0 0 8px',
                      fontSize: 'clamp(26px, 4vw, 36px)',
                    }}
                  >
                    Welcome back
                    {user.name ? `, ${user.name}` : ''}.
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      color: '#667085',
                      lineHeight: '1.6',
                    }}
                  >
                    Create, manage and keep track of your advertising
                    campaigns from one place.
                  </p>
                </div>

                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    setShowAuth(false)
                    setShowHistory(false)
                    setShowWhatsApp(false)
                    setShowAccount(false)
                    setSelectedCampaign(null)
                    setSelectedError('')
                    setEditingCampaign(null)
                    setShowCreate(true)
                  }}
                >
                  + Create New Ad
                </button>
              </div>

             <div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: '16px',
    marginBottom: '16px',
    width: '100%',
    boxSizing: 'border-box',
  }}
>
                <div
                  style={{
                    background: 'linear-gradient(135deg, #f9f7ff 0%, #ffffff 100%)',
                    border: '1px solid #ddd6fe',
                    borderRadius: '18px',
                    padding: '22px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '16px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          marginBottom: '8px',
                        }}
                      >
                        <span
                          style={{
                            padding: '5px 10px',
                            borderRadius: '999px',
                            background: usage.plan === 'business' ? '#ecfdf3' : '#f0eaff',
                            color: usage.plan === 'business' ? '#027a48' : '#6941c6',
                            fontSize: '11px',
                            fontWeight: '800',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {usage.plan === 'business' ? 'BUSINESS PLAN' : 'FREE PLAN'}
                        </span>
                      </div>

                      <strong
                        style={{
                          display: 'block',
                          fontSize: '30px',
                          lineHeight: '1.15',
                          marginBottom: '6px',
                        }}
                      >
                        {usageLoading ? 'Loading...' : `${usage.creditsRemaining ?? 0} credits`}
                      </strong>

                      <span
                        style={{
                          color: '#667085',
                          fontSize: '14px',
                        }}
                      >
                        {usage.plan === 'business'
                          ? 'Your Business credits reset monthly.'
                          : 'Your Free credits are available for trying BizAd AI.'}
                      </span>
                    </div>

                    <div
                      style={{
                        textAlign: 'right',
                        minWidth: '110px',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          color: '#667085',
                          fontSize: '12px',
                          marginBottom: '5px',
                        }}
                      >
                        USED
                      </span>
                      <strong style={{ fontSize: '22px' }}>
                        {usage.creditsUsed ?? 0}
                      </strong>
                    </div>
                  </div>

                  {usage.plan === 'free' && (
                    <div
                      style={{
                        marginTop: '18px',
                        paddingTop: '16px',
                        borderTop: '1px solid #ebe7ff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '14px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          color: '#475467',
                          fontSize: '13px',
                        }}
                      >
                        Need more credits or Video Ads?
                      </span>
                      <a
                        href="#pricing"
                        style={{
                          color: '#6941c6',
                          fontWeight: '800',
                          fontSize: '13px',
                          textDecoration: 'none',
                        }}
                      >
                        View Business plan →
                      </a>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #eaecf0',
                    borderRadius: '18px',
                    padding: '22px',
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚡</div>
                  <strong style={{ display: 'block', marginBottom: '8px' }}>
                    What uses your credits?
                  </strong>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px 16px',
                      color: '#667085',
                      fontSize: '13px',
                    }}
                  >
                    <span>Ad Copy · 1</span>
                    <span>WhatsApp · 1</span>
                    <span>Flyer · 3</span>
                    <span>Video · 10</span>
                  </div>
                  {usageError && (
                    <div
                      style={{
                        marginTop: '12px',
                        color: '#b42318',
                        fontSize: '12px',
                      }}
                    >
                      {usageError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={loadUsage}
                    style={{
                      marginTop: '14px',
                      border: 'none',
                      background: 'transparent',
                      color: '#6941c6',
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: '700',
                      fontSize: '13px',
                    }}
                  >
                    Refresh balance ↻
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: '16px',
                }}
              >
                {[
                  {
                    label: 'Total Campaigns',
                    value: campaigns.length,
                    icon: '📊',
                  },
                  {
                    label: 'Flyers Generated',
                    value: campaigns.filter(
                      (item) => item.flyerImage
                    ).length,
                    icon: '🖼️',
                  },
                  {
                    label: 'Videos Generated',
                    value: campaigns.filter(
                      (item) => item.videoId
                    ).length,
                    icon: '🎬',
                  },
                  {
                    label: 'Latest Campaign',
                    value:
                      campaigns.length > 0
                        ? formatCampaignDate(
                            campaigns[0].createdAt
                          )
                        : 'None yet',
                    icon: '✨',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      background: '#f8f9fc',
                      border: '1px solid #eaecf0',
                      borderRadius: '16px',
                      padding: '20px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '14px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '13px',
                          color: '#667085',
                          fontWeight: '600',
                        }}
                      >
                        {stat.label}
                      </span>

                      <span style={{ fontSize: '20px' }}>
                        {stat.icon}
                      </span>
                    </div>

                    <strong
                      style={{
                        display: 'block',
                        fontSize:
                          stat.label === 'Latest Campaign'
                            ? '18px'
                            : '30px',
                        lineHeight: '1.2',
                      }}
                    >
                      {stat.value}
                    </strong>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '16px',
                  flexWrap: 'wrap',
                  marginTop: '22px',
                  paddingTop: '20px',
                  borderTop: '1px solid #eaecf0',
                }}
              >
                <div>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>
                    {campaigns.length === 0
                      ? 'Your first campaign is waiting.'
                      : 'Keep your marketing moving.'}
                  </strong>

                  <span
                    style={{
                      color: '#667085',
                      fontSize: '14px',
                    }}
                  >
                    {campaigns.length === 0
                      ? 'Create an ad and it will appear in My Ads.'
                      : 'Open My Ads to view, edit or delete your campaigns.'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleOpenHistory}
                  style={{
                    border: '1px solid #d9d6fe',
                    background: '#f9f8ff',
                    color: '#6941c6',
                    padding: '11px 16px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '700',
                  }}
                >
                  View My Ads →
                </button>
              </div>
            </div>
          </section>
        )}

        {user && campaigns.length > 0 && (
          <section
            style={{
              maxWidth: '1180px',
              margin: '0 auto',
              padding: '0 24px 70px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: '20px',
                flexWrap: 'wrap',
                marginBottom: '22px',
              }}
            >
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    color: '#6941c6',
                    fontSize: '12px',
                    fontWeight: '800',
                    letterSpacing: '0.08em',
                    marginBottom: '8px',
                  }}
                >
                  RECENT ACTIVITY
                </span>

                <h2
                  style={{
                    margin: 0,
                    fontSize: 'clamp(24px, 3vw, 32px)',
                  }}
                >
                  Recent campaigns
                </h2>
              </div>

              <button
                type="button"
                onClick={handleOpenHistory}
                style={{
                  border: '1px solid #d9d6fe',
                  background: '#ffffff',
                  color: '#6941c6',
                  padding: '10px 15px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '700',
                }}
              >
                View All My Ads →
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '18px',
              }}
            >
              {campaigns.slice(0, 3).map((campaignItem) => (
                <div
                  key={campaignItem.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e4e7ec',
                    borderRadius: '18px',
                    padding: '22px',
                    boxShadow:
                      '0 8px 25px rgba(16, 24, 40, 0.04)',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '150px',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      marginBottom: '18px',
                      background: campaignItem.flyerImage
                        ? '#f4f4f5'
                        : '#f5f3ff',
                      border: '1px solid #eaecf0',
                      position: 'relative',
                    }}
                  >
                    {campaignItem.flyerImage ? (
                      <img
                        src={campaignItem.flyerImage}
                        alt={`${campaignItem.businessName || 'Campaign'} flyer preview`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#6941c6',
                          gap: '8px',
                        }}
                      >
                        <span style={{ fontSize: '34px' }}>
                          {campaignItem.videoId ? '🎬' : '📝'}
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: '700',
                          }}
                        >
                          {campaignItem.videoId
                            ? 'Video campaign'
                            : 'AI ad copy'}
                        </span>
                      </div>
                    )}

                    {campaignItem.videoId && (
                      <span
                        style={{
                          position: 'absolute',
                          left: '10px',
                          bottom: '10px',
                          background: 'rgba(17, 24, 39, 0.82)',
                          color: '#ffffff',
                          padding: '6px 9px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: '700',
                        }}
                      >
                        🎬 Video ready
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '11px',
                        background: '#f0eaff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                      }}
                    >
                      {campaignItem.videoId
                        ? '🎬'
                        : campaignItem.flyerImage
                          ? '🖼️'
                          : '📝'}
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#6941c6',
                        background: '#f5f3ff',
                        padding: '6px 9px',
                        borderRadius: '999px',
                      }}
                    >
                      {campaignItem.adType || 'Ad Copy'}
                    </span>
                  </div>

                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontSize: '18px',
                    }}
                  >
                    {campaignItem.businessName || 'Business'}
                  </h3>

                  <p
                    style={{
                      margin: '0 0 12px',
                      color: '#667085',
                      fontSize: '13px',
                    }}
                  >
                    {campaignItem.category || 'Advertising campaign'}
                  </p>

                  {campaignItem.offer && (
                    <p
                      style={{
                        margin: '0 0 14px',
                        color: '#475467',
                        fontSize: '13px',
                        lineHeight: '1.5',
                      }}
                    >
                      🎁 {campaignItem.offer}
                    </p>
                  )}

                  <div
                    style={{
                      color: '#98a2b3',
                      fontSize: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    Created {formatCampaignDate(campaignItem.createdAt)}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '9px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowHistory(true)
                        setSelectedCampaign(null)
                        handleViewCampaign(campaignItem.id)
                      }}
                      style={{
                        border: '1px solid #d0d5dd',
                        background: '#ffffff',
                        color: '#344054',
                        padding: '10px',
                        borderRadius: '9px',
                        cursor: 'pointer',
                        fontWeight: '700',
                      }}
                    >
                      View
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEditCampaign(campaignItem.id)}
                      style={{
                        border: 'none',
                        background: '#6941c6',
                        color: '#ffffff',
                        padding: '10px',
                        borderRadius: '9px',
                        cursor: 'pointer',
                        fontWeight: '700',
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="preview">
          <div className="preview-window">
            <div className="window-bar">
              <div className="dots">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div className="window-title">
                BizAd AI Studio
              </div>
            </div>

            <div className="studio">
              <div className="studio-sidebar">
                <div className="side-item active">
                  ✦ Create
                </div>

                <button
                  type="button"
                  className="side-item"
                  onClick={
                    handleOpenHistory
                  }
                  style={{
                    border: 'none',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background:
                      'transparent',
                  }}
                >
                  ◫ My Ads
                </button>

                <div className="side-item">
                  ⚙ Settings
                </div>
              </div>

              <div className="studio-content">
                <p className="studio-label">
                  CREATE NEW CAMPAIGN
                </p>

                <h2>
                  What are you advertising?
                </h2>

                <div className="input-preview">
                  <span>🔗</span>

                  <span className="placeholder">
                    Enter your website or
                    business...
                  </span>

                  <button
                    onClick={() =>
                      requireLogin(() => {
                        setActivePage('create')
                        setShowCreate(true)
                      })
                    }
                  >
                    Generate ✨
                  </button>
                </div>

                <div className="preview-cards">
                  <div>
                    <span>🎬</span>

                    <strong>
                      Video Ad
                    </strong>

                    <small>
                      AI-generated
                    </small>
                  </div>

                  <div>
                    <span>🖼️</span>

                    <strong>
                      Ad Flyer
                    </strong>

                    <small>
                      Ready to share
                    </small>
                  </div>

                  <div>
                    <span>📱</span>

                    <strong>
                      Social Ad
                    </strong>

                    <small>
                      Optimized copy
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="trust">
          <p>
            BUILT FOR BUSINESSES THAT WANT TO GROW
          </p>

          <div className="trust-items">
            <span>🛍️ Retail</span>
            <span>🍔 Restaurants</span>
            <span>💈 Barbers</span>
            <span>👗 Fashion</span>
            <span>🏠 Real Estate</span>
            <span>🚗 Services</span>
          </div>
        </section>

        <section
          className="features"
          id="how-it-works"
        >
          <div className="section-heading">
            <span>
              HOW IT WORKS
            </span>

            <h2>
              From idea to advertisement in minutes.
            </h2>

            <p>
              BizAd AI makes professional advertising
              simple. Tell us about your business and
              let AI handle the creative work.
            </p>
          </div>

          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">
                01
              </div>

              <h3>
                Tell us about your business
              </h3>

              <p>
                Enter your business name, category,
                products, target customers, offer and
                contact information.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                02
              </div>

              <h3>
                Let AI create your campaign
              </h3>

              <p>
                BizAd AI turns your information into
                advertising copy, promotional concepts,
                flyers and video ads.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                03
              </div>

              <h3>
                Download and share
              </h3>

              <p>
                Preview your generated content,
                download your assets and share them
                with your customers.
              </p>
            </div>
          </div>
        </section>

        <section
          className="features"
          id="features"
        >
          <div className="section-heading">
            <span>
              ONE PLATFORM
            </span>

            <h2>
              Everything you need to advertise.
            </h2>

            <p>
              BizAd AI turns a simple business
              description into professional marketing
              content.
            </p>
          </div>

          <div className="feature-grid">
            <div className="feature-card large">
              <div className="feature-icon">
                🎬
              </div>

              <h3>
                AI Video Ads
              </h3>

              <p>
                Generate short promotional videos with
                scripts, visuals, voiceovers and music.
              </p>

              <div className="fake-video">
                <div className="play">
                  ▶
                </div>

                <span>
                  12 SEC AD
                </span>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                🖼️
              </div>

              <h3>
                Professional Flyers
              </h3>

              <p>
                Create eye-catching promotional designs
                ready for Instagram and WhatsApp.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                ✍️
              </div>

              <h3>
                AI Ad Copy
              </h3>

              <p>
                Headlines, captions and calls-to-action
                written specifically for your business.
              </p>
            </div>

            <button
              type="button"
              className="feature-card"
              onClick={handleOpenWhatsApp}
              style={{
                border: 'none',
                textAlign: 'left',
                width: '100%',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <div className="feature-icon">
                📱
              </div>

              <h3>
                WhatsApp Marketing
              </h3>

              <p>
                Generate content designed for WhatsApp
                Status and direct customer engagement.
              </p>

              <div
                style={{
                  marginTop: '18px',
                  color: '#6941c6',
                  fontSize: '14px',
                  fontWeight: '700',
                }}
              >
                Open WhatsApp Studio →
              </div>
            </button>
          </div>
        </section>

        <section
          className="pricing-section"
          id="pricing"
        >
          <div className="pricing-heading">
            <span>
              SIMPLE PRICING
            </span>

            <h2>
              Start creating ads today.
            </h2>

            <p>
              Start free and upgrade when your
              business needs more.
            </p>
          </div>

          <div className="pricing-grid">
            <div className="pricing-card">
              <div className="feature-icon">
                🌱
              </div>

              <h3>
                Free
              </h3>

              <p className="pricing-description">
                Explore BizAd AI and create your first
                advertising campaigns.
              </p>

              <div className="pricing-price">
                ₦0{' '}
                <small>
                  forever
                </small>
              </div>

              <ul className="pricing-features">
                <li>
                  AI ad copy
                </li>

                <li>
                  Campaign generation
                </li>

                <li>
                  Basic advertising tools
                </li>

                <li>
                  Create and preview ads
                </li>
              </ul>

              <button
                className="pricing-button"
                onClick={() =>
                  requireLogin(() => {
                    setActivePage('create')
                    setShowCreate(true)
                  })
                }
              >
                Start Creating
              </button>
            </div>

            <div className="pricing-card featured">
              <div className="feature-icon">
                🚀
              </div>

              <h3>
                Business
              </h3>

              <p className="pricing-description">
                For businesses that want more professional
                and powerful advertising content.
              </p>

              <div className="pricing-price">
                Coming Soon
              </div>

              <ul className="pricing-features">
                <li>
                  200 AI credits every month
                </li>

                <li>
                  AI video ads
                </li>

                <li>
                  Professional flyers
                </li>

                <li>
                  Marketing campaigns
                </li>

                <li>
                  Advanced advertising features
                </li>

                <li>
                  More usage and capabilities
                </li>

                <li>
                  No Free-plan restrictions
                </li>
              </ul>

            <button
  className="pricing-button"
  type="button"
  onClick={async () => {
    if (!user) {
      openAuth('signup')
      return
    }

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/payments/initialize-business`,
        {
          method: 'POST',
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Unable to start Business upgrade.'
        )
      }

      if (!data.authorizationUrl) {
        throw new Error(
          'Paystack checkout URL was not returned.'
        )
      }

      window.location.href =
        data.authorizationUrl
    } catch (error) {
      console.error(
        'Business payment error:',
        error
      )

      window.alert(
        error.message ||
          'Unable to start Business upgrade.'
      )
    }
  }}
>
  Upgrade to Business
</button>
            </div>
          </div>
        </section>

        <section className="cta">
          <div>
            <span>
              READY TO GROW?
            </span>

            <h2>
              Your next customer could be one ad away.
            </h2>

            <p>
              Let BizAd AI create your first campaign.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() =>
              requireLogin(() => {
                setActivePage('create')
                setShowCreate(true)
              })
            }
          >
            Create My Ad 🤖
          </button>
        </section>
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

export default App