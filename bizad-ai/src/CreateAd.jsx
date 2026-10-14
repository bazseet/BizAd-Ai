import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import './CreateAd.css'

const API_BASE_URL = 'http://localhost:5000'

function CreateAd({ onBack, editingCampaign = null, onSaved }) {
    const { getToken } = useAuth()

  const apiFetch = async (url, options = {}) => {
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
  }
  const isEditing = Boolean(editingCampaign?.id)

  // Plan / credit access
  const [plan, setPlan] = useState('free')
  const [usageLoading, setUsageLoading] = useState(true)
  const [videoLockedNotice, setVideoLockedNotice] = useState(false)

  const [form, setForm] = useState({
    businessName: '',
    category: '',
    description: '',
    audience: '',
    location: '',
    offer: '',
    contact: '',
    website: '',
    adType: 'Ad Copy',
  })

  // Campaign state
  const [generated, setGenerated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [campaign, setCampaign] = useState('')
  const [campaignId, setCampaignId] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [savedStatus, setSavedStatus] = useState('')

  // Flyer state
  const [flyerImage, setFlyerImage] = useState('')
  const [flyerLoading, setFlyerLoading] = useState(false)
  const [flyerError, setFlyerError] = useState('')

  // Video state
  const [videoId, setVideoId] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoError, setVideoError] = useState('')
  const [videoSeconds, setVideoSeconds] = useState(null)
  const [videoStage, setVideoStage] = useState('')

  // =========================================================
  // LOAD CURRENT PLAN
  // =========================================================

  useEffect(() => {
    let cancelled = false

    const loadUsage = async () => {
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/usage`,
          { credentials: 'include' }
        )

        const data = await response.json()

        if (!cancelled && response.ok && data.usage) {
          const currentPlan = data.usage.plan || 'free'
          setPlan(currentPlan)

          if (currentPlan === 'business' && !editingCampaign) {
            setForm((previousForm) => ({
              ...previousForm,
              adType: 'Video Ad',
            }))
          }
        }
      } catch {
        // Keep the safe default: free plan.
      } finally {
        if (!cancelled) {
          setUsageLoading(false)
        }
      }
    }

    loadUsage()

    return () => {
      cancelled = true
    }
  }, [])

  // =========================================================
  // LOAD EXISTING CAMPAIGN WHEN EDITING
  // =========================================================

  useEffect(() => {
    if (!editingCampaign) {
      return
    }

    setForm({
      businessName:
        editingCampaign.businessName || '',
      category:
        editingCampaign.category || '',
      description:
        editingCampaign.description || '',
      audience:
        editingCampaign.audience || '',
      location:
        editingCampaign.location || '',
      offer:
        editingCampaign.offer || '',
      contact:
        editingCampaign.contact || '',
      website:
        editingCampaign.website || '',
      adType:
        editingCampaign.adType || 'Video Ad',
    })

    setCampaign(
      editingCampaign.campaignText || ''
    )

    setCampaignId(
      editingCampaign.id || null
    )

    setFlyerImage(
      editingCampaign.flyerImage || ''
    )

    setVideoId(
      editingCampaign.videoId || ''
    )

    setVideoSeconds(
      editingCampaign.videoSeconds || null
    )

    setSavedStatus(
      editingCampaign.id
        ? 'Campaign loaded'
        : ''
    )
  }, [editingCampaign])

  // =========================================================
  // HANDLE FORM INPUTS
  // =========================================================

  const handleChange = (e) => {
    const { name, value } = e.target

    setForm((previousForm) => ({
      ...previousForm,
      [name]: value,
    }))

    setSavedStatus('')
  }

  // =========================================================
  // COMMON API ERROR HANDLER
  // =========================================================

  const getFriendlyError = (
    error,
    fallbackMessage
  ) => {
    const message =
      error?.message || ''

    if (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('ERR_CONNECTION_REFUSED')
    ) {
      return 'BizAd AI server is not available. Please make sure the backend is running and try again.'
    }

    if (
      message.toLowerCase().includes('quota') ||
      message.toLowerCase().includes('rate limit') ||
      message.includes('429')
    ) {
      return 'AI generation is temporarily unavailable because the API usage limit has been reached. Please try again later.'
    }

    if (
      message.toLowerCase().includes('api key') ||
      message.toLowerCase().includes('authentication')
    ) {
      return 'BizAd AI could not authenticate with the AI service. Please check the server configuration.'
    }

    if (
      message.toLowerCase().includes('session') ||
      message.toLowerCase().includes('log in')
    ) {
      return 'Your session has expired. Please log in again and try again.'
    }

    if (
      message.toLowerCase().includes('not have enough credits') ||
      message.toLowerCase().includes('credits for this action')
    ) {
      return `${message} Upgrade to Business when you need more capacity.`
    }

    if (
      message.toLowerCase().includes('business plan') ||
      message.toLowerCase().includes('business plan to create video')
    ) {
      return message
    }

    return (
      message ||
      fallbackMessage
    )
  }

  // =========================================================
  // SAVE NEW CAMPAIGN TO DATABASE
  // =========================================================

  const saveCampaignToDatabase = async (
    campaignText
  ) => {
    const response = await apiFetch(
      `${API_BASE_URL}/api/campaigns`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },

        credentials: 'include',

        body: JSON.stringify({
          ...form,
          campaignText,
          flyerImage:
            flyerImage || null,
          videoId:
            videoId || null,
          videoSeconds:
            videoSeconds !== null
              ? Number(videoSeconds)
              : null,
        }),
      }
    )

    let data

    try {
      data = await response.json()
    } catch {
      throw new Error(
        'The BizAd AI server returned an invalid database response.'
      )
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
          'Unable to save campaign to the database.'
      )
    }

    return data
  }

  // =========================================================
  // UPDATE EXISTING CAMPAIGN
  // =========================================================

  const updateCampaignInDatabase = async (
    campaignText = campaign,
    overrides = {}
  ) => {
    const idToUpdate = overrides.campaignId || campaignId

    if (!idToUpdate) {
      throw new Error(
        'Campaign ID is missing. Unable to update this campaign.'
      )
    }

    const payload = {
      ...form,
      campaignText,
      flyerImage:
        overrides.flyerImage !== undefined
          ? overrides.flyerImage || null
          : flyerImage || null,
      videoId:
        overrides.videoId !== undefined
          ? overrides.videoId || null
          : videoId || null,
      videoSeconds:
        overrides.videoSeconds !== undefined
          ? overrides.videoSeconds !== null &&
            overrides.videoSeconds !== ''
            ? Number(overrides.videoSeconds)
            : null
          : videoSeconds !== null
            ? Number(videoSeconds)
            : null,
    }

    const response = await apiFetch(
      `${API_BASE_URL}/api/campaigns/${idToUpdate}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type':
            'application/json',
        },

        credentials: 'include',

        body: JSON.stringify(payload),
      }
    )

    let data

    try {
      data = await response.json()
    } catch {
      throw new Error(
        'The BizAd AI server returned an invalid update response.'
      )
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
          'Unable to update the campaign.'
      )
    }

    return data
  }

  // =========================================================
  // SAVE CAMPAIGN
  // Automatically chooses POST or PUT
  // =========================================================

  const saveOrUpdateCampaign =
    async (campaignText) => {
      if (isEditing && campaignId) {
        return updateCampaignInDatabase(
          campaignText
        )
      }

      return saveCampaignToDatabase(
        campaignText
      )
    }

  // =========================================================
  // HANDLE FORM SUBMIT
  // =========================================================

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (loading) {
      return
    }

    if (!usageLoading && plan !== 'business' && form.adType === 'Video Ad') {
      setVideoLockedNotice(true)
      setError('AI Video Ads are available on the Business plan.')
      return
    }

    setLoading(true)
    setError('')
    setCopied(false)
    setSavedStatus('')

    try {
      // -----------------------------------------------------
      // GENERATE CAMPAIGN WITH AI
      // -----------------------------------------------------

      const response = await apiFetch(
        `${API_BASE_URL}/api/generate-ad`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(form),
        }
      )

      let data

      try {
        data = await response.json()
      } catch {
        throw new Error(
          'The BizAd AI server returned an invalid response.'
        )
      }

      if (!response.ok) {
        if (response.status === 402 || response.status === 403) {
          throw new Error(
            data.error ||
              'This feature is not available on your current plan.'
          )
        }

        throw new Error(
          data.error ||
            'Failed to generate campaign.'
        )
      }

      if (!data.campaign) {
        throw new Error(
          'BizAd AI did not return a campaign. Please try again.'
        )
      }

      // -----------------------------------------------------
      // SHOW CAMPAIGN
      // -----------------------------------------------------

      setCampaign(data.campaign)
      setGenerated(true)

      // -----------------------------------------------------
      // SAVE OR UPDATE DATABASE
      // -----------------------------------------------------

      try {
        const savedCampaign =
          await saveOrUpdateCampaign(
            data.campaign
          )

        const savedId =
          savedCampaign?.campaign?.id ||
          savedCampaign?.id ||
          campaignId

        if (savedId) {
          setCampaignId(savedId)
        }

        setSavedStatus(
          isEditing
            ? 'Campaign updated'
            : 'Campaign saved'
        )

        console.log(
          isEditing
            ? 'Campaign updated successfully:'
            : 'Campaign saved successfully:',
          savedCampaign
        )

        if (onSaved) {
          onSaved(
            savedCampaign?.campaign ||
              savedCampaign
          )
        }
      } catch (saveError) {
        console.error(
          isEditing
            ? 'Campaign database update error:'
            : 'Campaign database save error:',
          saveError
        )

        setError(
          isEditing
            ? 'Your new campaign was generated, but the existing campaign could not be updated.'
            : 'Your campaign was generated successfully, but it could not be saved to your campaign history.'
        )
      }
    } catch (error) {
      console.error(
        'Campaign generation error:',
        error
      )

      setError(
        getFriendlyError(
          error,
          'Unable to generate your campaign. Please try again.'
        )
      )
    } finally {
      setLoading(false)
    }
  }

  // =========================================================
  // REGENERATE AI CAMPAIGN
  // =========================================================

  const handleRegenerateCampaign =
    async () => {
      if (loading) {
        return
      }

      setLoading(true)
      setError('')
      setCopied(false)
      setSavedStatus('')

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/generate-ad`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(form),
          }
        )

        let data

        try {
          data =
            await response.json()
        } catch {
          throw new Error(
            'The BizAd AI server returned an invalid response.'
          )
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Failed to regenerate campaign.'
          )
        }

        if (!data.campaign) {
          throw new Error(
            'BizAd AI did not return a new campaign.'
          )
        }

        setCampaign(
          data.campaign
        )

        // ---------------------------------------------------
        // UPDATE EXISTING CAMPAIGN
        // OR CREATE NEW CAMPAIGN
        // ---------------------------------------------------

        try {
          const savedCampaign =
            await saveOrUpdateCampaign(
              data.campaign
            )

          const savedId =
            savedCampaign?.campaign?.id ||
            savedCampaign?.id ||
            campaignId

          if (savedId) {
            setCampaignId(savedId)
          }

          setSavedStatus(
            isEditing
              ? 'Campaign updated'
              : 'Campaign saved'
          )

          console.log(
            isEditing
              ? 'Regenerated campaign updated successfully:'
              : 'Regenerated campaign saved successfully:',
            savedCampaign
          )

          if (onSaved) {
            onSaved(
              savedCampaign?.campaign ||
                savedCampaign
            )
          }
        } catch (saveError) {
          console.error(
            isEditing
              ? 'Regenerated campaign database update error:'
              : 'Regenerated campaign database save error:',
            saveError
          )

          setError(
            isEditing
              ? 'The new campaign was generated, but the existing campaign could not be updated.'
              : 'The new campaign was generated, but it could not be saved to your campaign history.'
          )
        }
      } catch (error) {
        console.error(
          'Campaign regeneration error:',
          error
        )

        setError(
          getFriendlyError(
            error,
            'Unable to regenerate the campaign. Please try again.'
          )
        )
      } finally {
        setLoading(false)
      }
    }

  // =========================================================
  // COPY CAMPAIGN
  // =========================================================

  const handleCopyCampaign =
    async () => {
      if (!campaign) {
        return
      }

      try {
        await navigator.clipboard.writeText(
          campaign
        )

        setCopied(true)

        window.setTimeout(() => {
          setCopied(false)
        }, 2000)
      } catch (error) {
        console.error(
          'Copy error:',
          error
        )

        setCopied(false)

        setError(
          'Unable to copy the ad text. Please select and copy it manually.'
        )
      }
    }

  // =========================================================
  // GENERATE AI FLYER
  // =========================================================

  const handleGenerateFlyer =
    async () => {
      if (flyerLoading) {
        return
      }

      setFlyerLoading(true)
      setFlyerError('')

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/generate-flyer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(form),
          }
        )

        let data

        try {
          data =
            await response.json()
        } catch {
          throw new Error(
            'The BizAd AI server returned an invalid response.'
          )
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Failed to generate flyer.'
          )
        }

        if (!data.image) {
          throw new Error(
            'BizAd AI did not return a flyer image.'
          )
        }

        setFlyerImage(
          data.image
        )

        // Persist the newly generated flyer immediately.
        // This works for both newly created and edited campaigns.
        if (campaignId) {
          try {
            const updatedCampaign =
              await updateCampaignInDatabase(
                campaign,
                {
                  flyerImage: data.image,
                }
              )

            setSavedStatus(
              isEditing
                ? 'Campaign updated'
                : 'Campaign saved'
            )

            if (onSaved) {
              onSaved(
                updatedCampaign?.campaign ||
                  updatedCampaign
              )
            }
          } catch (saveError) {
            console.error(
              'Flyer update error:',
              saveError
            )
          }
        }
      } catch (error) {
        console.error(
          'Flyer generation error:',
          error
        )

        setFlyerError(
          getFriendlyError(
            error,
            'Unable to generate the flyer. Please try again.'
          )
        )
      } finally {
        setFlyerLoading(false)
      }
    }

  // =========================================================
  // REGENERATE AI FLYER
  // =========================================================

  const handleRegenerateFlyer =
    async () => {
      if (flyerLoading) {
        return
      }

      setFlyerLoading(true)
      setFlyerError('')

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/generate-flyer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(form),
          }
        )

        let data

        try {
          data =
            await response.json()
        } catch {
          throw new Error(
            'The BizAd AI server returned an invalid response.'
          )
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Failed to regenerate flyer.'
          )
        }

        if (!data.image) {
          throw new Error(
            'BizAd AI did not return a new flyer.'
          )
        }

        setFlyerImage(
          data.image
        )

        // Persist the regenerated flyer immediately.
        if (campaignId) {
          try {
            const updatedCampaign =
              await updateCampaignInDatabase(
                campaign,
                {
                  flyerImage: data.image,
                }
              )

            setSavedStatus(
              isEditing
                ? 'Campaign updated'
                : 'Campaign saved'
            )

            if (onSaved) {
              onSaved(
                updatedCampaign?.campaign ||
                  updatedCampaign
              )
            }
          } catch (saveError) {
            console.error(
              'Regenerated flyer update error:',
              saveError
            )
          }
        }
      } catch (error) {
        console.error(
          'Flyer regeneration error:',
          error
        )

        setFlyerError(
          getFriendlyError(
            error,
            'Unable to regenerate the flyer. Please try again.'
          )
        )
      } finally {
        setFlyerLoading(false)
      }
    }

  // =========================================================
  // VIDEO GENERATION STAGE
  // =========================================================

  const getVideoStage = (
    progress
  ) => {
    if (progress < 10) {
      return 'Preparing your advertisement...'
    }

    if (progress < 35) {
      return 'Planning your video scenes...'
    }

    if (progress < 65) {
      return 'Creating your video...'
    }

    if (progress < 90) {
      return 'Rendering your advertisement...'
    }

    if (progress < 100) {
      return 'Finalizing your 12-second video...'
    }

    return 'Your video is ready!'
  }

  // =========================================================
  // GENERATE AI VIDEO
  // =========================================================

  const handleGenerateVideo =
    async () => {
      if (plan !== 'business') {
        setVideoLockedNotice(true)
        setVideoError('AI Video Ads are available on the Business plan. Upgrade to Business to create 12-second AI videos.')
        return
      }

      if (videoLoading) {
        return
      }

      setVideoLoading(true)
      setVideoError('')
      setVideoProgress(0)
      setVideoUrl('')
      setVideoId('')
      setVideoSeconds(null)
      setVideoStage(
        'Preparing your advertisement...'
      )

      let progressTimer = null

      try {
        // ---------------------------------------------------
        // START VIDEO GENERATION
        // ---------------------------------------------------

        const response = await apiFetch(
          `${API_BASE_URL}/api/generate-video`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              ...form,
              campaign,
            }),
          }
        )

        let data

        try {
          data =
            await response.json()
        } catch {
          throw new Error(
            'The BizAd AI server returned an invalid response.'
          )
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Unable to start video generation.'
          )
        }

        if (!data.videoId) {
          throw new Error(
            'BizAd AI could not start the video generation session.'
          )
        }

        const currentVideoId =
          data.videoId

        setVideoId(
          currentVideoId
        )

        if (data.actualSeconds) {
          setVideoSeconds(
            data.actualSeconds
          )
        }

        // ---------------------------------------------------
        // SMOOTH PROGRESS ANIMATION
        // ---------------------------------------------------

        const startedAt =
          Date.now()

        let targetProgress =
          Number(data.progress) ||
          0

        let displayedProgress =
          Number(data.progress) ||
          0

        progressTimer =
          window.setInterval(() => {
            const elapsedSeconds =
              (Date.now() -
                startedAt) /
              1000

            const simulatedTarget =
              Math.min(
                92,
                Math.floor(
                  5 +
                    elapsedSeconds *
                      2
                )
              )

            const desiredProgress =
              Math.max(
                targetProgress,
                simulatedTarget
              )

            if (
              displayedProgress <
              desiredProgress
            ) {
              const difference =
                desiredProgress -
                displayedProgress

              const increment =
                difference > 20
                  ? 2
                  : difference > 8
                    ? 1
                    : 0.5

              displayedProgress =
                Math.min(
                  desiredProgress,
                  displayedProgress +
                    increment
                )

              const roundedProgress =
                Math.min(
                  99,
                  Math.floor(
                    displayedProgress
                  )
                )

              setVideoProgress(
                roundedProgress
              )

              setVideoStage(
                getVideoStage(
                  roundedProgress
                )
              )
            }
          }, 200)

        // ---------------------------------------------------
        // POLL VIDEO STATUS
        // ---------------------------------------------------

        let completed = false

        while (!completed) {
          await new Promise(
            (resolve) => {
              window.setTimeout(
                resolve,
                2000
              )
            }
          )

          const statusResponse =
            await apiFetch(
              `${API_BASE_URL}/api/videos/${currentVideoId}/status`
            )

          let statusData

          try {
            statusData =
              await statusResponse.json()
          } catch {
            throw new Error(
              'BizAd AI returned an invalid video status response.'
            )
          }

          if (!statusResponse.ok) {
            throw new Error(
              statusData.error ||
                'Unable to check video generation status.'
            )
          }

          // -------------------------------------------------
          // REAL API PROGRESS
          // -------------------------------------------------

          const realProgress =
            Number(
              statusData.progress
            ) || 0

          targetProgress =
            Math.max(
              targetProgress,
              realProgress
            )

          if (
            statusData.seconds
          ) {
            setVideoSeconds(
              statusData.seconds
            )
          }

          // -------------------------------------------------
          // COMPLETED
          // -------------------------------------------------

          if (
            statusData.status ===
            'completed'
          ) {
            completed = true

            if (progressTimer) {
              window.clearInterval(
                progressTimer
              )

              progressTimer = null
            }

            setVideoProgress(100)

            setVideoStage(
              'Your 12-second video is ready!'
            )

            if (
              statusData.seconds
            ) {
              setVideoSeconds(
                statusData.seconds
              )
            }

            setVideoUrl(
             `${API_BASE_URL}/api/videos/${currentVideoId}/stream`
            )

            // -------------------------------------------------
            // PERSIST VIDEO DETAILS
            // -------------------------------------------------

            if (campaignId) {
              try {
                const updatedCampaign =
                  await updateCampaignInDatabase(
                    campaign,
                    {
                      videoId: currentVideoId,
                      videoSeconds:
                        statusData.seconds ||
                        videoSeconds ||
                        12,
                    }
                  )

                setSavedStatus(
                  isEditing
                    ? 'Campaign updated'
                    : 'Campaign saved'
                )

                if (onSaved) {
                  onSaved(
                    updatedCampaign?.campaign ||
                      updatedCampaign
                  )
                }
              } catch (saveError) {
                console.error(
                  'Video update error:',
                  saveError
                )
              }
            }

            continue
          }

          // -------------------------------------------------
          // FAILED
          // -------------------------------------------------

          if (
            statusData.status ===
              'failed' ||
            statusData.status ===
              'cancelled'
          ) {
            throw new Error(
              statusData.error
                ?.message ||
                statusData.error ||
                'The AI video generation failed. Please try again.'
            )
          }

          // -------------------------------------------------
          // UPDATE STAGE
          // -------------------------------------------------

          const visibleProgress =
            Math.min(
              99,
              Math.floor(
                Math.max(
                  displayedProgress,
                  realProgress
                )
              )
            )

          displayedProgress =
            Math.max(
              displayedProgress,
              visibleProgress
            )

          setVideoProgress(
            visibleProgress
          )

          setVideoStage(
            getVideoStage(
              visibleProgress
            )
          )
        }
      } catch (error) {
        console.error(
          'Video generation error:',
          error
        )

        if (progressTimer) {
          window.clearInterval(
            progressTimer
          )

          progressTimer = null
        }

        setVideoError(
          getFriendlyError(
            error,
            'Unable to generate your video. Please try again.'
          )
        )

        setVideoStage('')
      } finally {
        if (progressTimer) {
          window.clearInterval(
            progressTimer
          )
        }

        setVideoLoading(false)
      }
    }

  // =========================================================
  // REGENERATE VIDEO
  // =========================================================

  const handleRegenerateVideo =
    async () => {
      if (videoLoading) {
        return
      }

      setVideoUrl('')
      setVideoId('')
      setVideoSeconds(null)
      setVideoError('')
      setVideoProgress(0)
      setVideoStage(
        'Preparing your advertisement...'
      )

      await handleGenerateVideo()
    }

  // =========================================================
  // RESET EVERYTHING
  // =========================================================

  const handleCreateAnother =
    () => {
      setGenerated(false)

      setCampaign('')
      setCampaignId(null)
      setError('')
      setLoading(false)
      setCopied(false)
      setSavedStatus('')

      setFlyerImage('')
      setFlyerError('')
      setFlyerLoading(false)

      setVideoId('')
      setVideoUrl('')
      setVideoProgress(0)
      setVideoError('')
      setVideoLoading(false)
      setVideoSeconds(null)
      setVideoStage('')
    }

  // =========================================================
  // RESULT PAGE
  // =========================================================

  if (generated) {
    return (
      <div className="create-page">
        {/* NAVIGATION */}

        <nav className="create-nav">
          <button
            className="back-button"
            onClick={onBack}
          >
            ← Back to BizAd AI
          </button>

          <div className="create-logo">
            🤖 BizAd{' '}
            <strong>AI</strong>
          </div>
        </nav>

        {/* RESULT CONTENT */}

        <main className="result-container">
          <div className="success-badge">
            ✨{' '}
            {isEditing
              ? 'Campaign updated'
              : 'Campaign generated'}
          </div>

          <h1>
            {isEditing
              ? 'Your campaign has been updated.'
              : 'Your ad campaign is ready.'}
          </h1>

          <p className="result-subtitle">
            BizAd AI created marketing
            content for{' '}
            <strong>
              {form.businessName}
            </strong>
            .
          </p>

          {/* RESULT GRID */}

          <div className="result-grid">
            {/* =================================================
                AI CAMPAIGN
            ================================================= */}

            <div className="result-card copy-result">
              <div className="result-icon">
                ✍️
              </div>

              <h3>
                AI Ad Campaign
              </h3>

              <p>
                Your personalized advertising
                campaign created by BizAd AI.
              </p>

              <div className="copy-box">
                <pre className="campaign-output">
                  {campaign}
                </pre>
              </div>

              <button
                className="result-button"
                onClick={
                  handleCopyCampaign
                }
              >
                {copied
                  ? '✓ Copied!'
                  : 'Copy Ad Text'}
              </button>

              <button
                className="result-button"
                onClick={
                  handleRegenerateCampaign
                }
                disabled={loading}
              >
                {loading
                  ? '🤖 Regenerating...'
                  : '↻ Regenerate Campaign'}
              </button>

              {campaignId && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    marginTop: '12px',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    background:
                      'rgba(34, 197, 94, 0.08)',
                    border:
                      '1px solid rgba(34, 197, 94, 0.18)',
                    color: '#15803d',
                    fontSize: '13px',
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  ✓{' '}
                  {savedStatus ||
                    (isEditing
                      ? 'Campaign updated successfully'
                      : 'Campaign saved successfully')}
                </div>
              )}

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
            </div>

            {/* =================================================
                VIDEO AD
            ================================================= */}

            <div className="result-card video-result">
              <div className="result-icon">
                🎬
              </div>

              <h3>
                12-Second Video Ad
              </h3>

              <p>
                AI-generated promotional video
              </p>

              {/* VIDEO PREVIEW */}

              {videoUrl ? (
                <div className="video-container">
                  <video
                    src={videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="generated-video"
                  />

                  <div
                    style={{
                      marginTop: '12px',
                      textAlign:
                        'center',
                      fontSize: '14px',
                      color:
                        '#6b7280',
                    }}
                  >
                    {videoSeconds
                      ? `Generated video • ${videoSeconds} seconds`
                      : 'Generated 12-second video'}
                  </div>

                  <a
                    href={
                      videoId
                        ? `${API_BASE_URL}/api/videos/${videoId}/download`
                        : '#'
                    }
                    download={`${form.businessName}-12-second-video.mp4`}
                    className="result-button video-download"
                  >
                    ⬇️ Download 12-Second
                    Video
                  </a>

                  <button
                    type="button"
                    className="result-button"
                    onClick={
                      handleRegenerateVideo
                    }
                    disabled={
                      videoLoading
                    }
                  >
                    {videoLoading
                      ? '🎬 Creating Video...'
                      : '↻ Regenerate Video'}
                  </button>
                </div>
              ) : (
                <div
                  className="video-placeholder"
                  style={{
                    position:
                      'relative',
                    overflow:
                      'hidden',
                  }}
                >
                  {videoLoading ? (
                    <>
                      <div
                        style={{
                          fontSize:
                            '48px',
                          marginBottom:
                            '18px',
                        }}
                      >
                        🎬
                      </div>

                      <strong
                        style={{
                          display:
                            'block',
                          fontSize:
                            '20px',
                          marginBottom:
                            '8px',
                        }}
                      >
                        Creating your video
                      </strong>

                      <p
                        style={{
                          margin:
                            '0 0 18px',
                          fontSize:
                            '14px',
                          opacity:
                            0.75,
                        }}
                      >
                        {videoStage ||
                          'Preparing your advertisement...'}
                      </p>

                      {/* PROGRESS PERCENTAGE */}

                      <div
                        style={{
                          fontSize:
                            '32px',
                          fontWeight:
                            '700',
                          marginBottom:
                            '12px',
                        }}
                      >
                        {
                          videoProgress
                        }
                        %
                      </div>

                      {/* PROGRESS BAR */}

                      <div
                        style={{
                          width:
                            '100%',
                          maxWidth:
                            '320px',
                          height:
                            '8px',
                          background:
                            'rgba(255,255,255,0.2)',
                          borderRadius:
                            '999px',
                          overflow:
                            'hidden',
                          margin:
                            '0 auto 14px',
                        }}
                      >
                        <div
                          style={{
                            width: `${videoProgress}%`,
                            height:
                              '100%',
                            background:
                              'linear-gradient(90deg, #7c3aed, #a855f7)',
                            borderRadius:
                              '999px',
                            transition:
                              'width 0.25s ease',
                          }}
                        />
                      </div>

                      <small
                        style={{
                          display:
                            'block',
                          fontSize:
                            '12px',
                          opacity:
                            0.7,
                        }}
                      >
                        Please keep this
                        page open while
                        your video is
                        being created.
                      </small>
                    </>
                  ) : (
                    <>
                      <span>
                        🎬
                      </span>

                      <small>
                        YOUR 12-SECOND
                        VIDEO
                        <br />
                        READY TO GENERATE
                      </small>
                    </>
                  )}
                </div>
              )}

              {/* VIDEO ERROR */}

              {videoError && (
                <div className="error-message">
                  {videoError}
                </div>
              )}

              {/* VIDEO BUTTON */}

              {!videoUrl && (
                <button
                  className="result-button"
                  onClick={
                    handleGenerateVideo
                  }
                  disabled={
                    videoLoading || usageLoading
                  }
                >
                  {videoLoading
                    ? `🎬 Creating Video ${videoProgress}%...`
                    : plan === 'business'
                      ? '🎬 Generate 12-Second Video'
                      : '🔒 Upgrade to Business for AI Video'}
                </button>
              )}
            </div>

            {/* =================================================
                FLYER
            ================================================= */}

            <div className="result-card">
              <div className="result-icon">
                🖼️
              </div>

              <h3>
                Ad Flyer
              </h3>

              <p>
                AI-generated promotional design
              </p>

              {/* FLYER IMAGE */}

              {flyerImage ? (
                <div className="flyer-image-container">
                  <img
                    src={flyerImage}
                    alt={`${form.businessName} promotional flyer`}
                    className="flyer-image"
                  />

                  <a
                    href={flyerImage}
                    download={`${form.businessName}-flyer.png`}
                    className="result-button flyer-download"
                  >
                    ⬇️ Download Flyer
                  </a>

                  <button
                    type="button"
                    className="result-button"
                    onClick={
                      handleRegenerateFlyer
                    }
                    disabled={
                      flyerLoading
                    }
                  >
                    {flyerLoading
                      ? '🎨 Regenerating...'
                      : '↻ Regenerate Flyer'}
                  </button>
                </div>
              ) : (
                <div className="flyer-placeholder">
                  <strong>
                    {form.businessName ||
                      'Your Business'}
                  </strong>

                  <span>
                    {form.offer ||
                      'Your special offer'}
                  </span>

                  <small>
                    READY TO GENERATE
                  </small>
                </div>
              )}

              {/* FLYER ERROR */}

              {flyerError && (
                <div className="error-message">
                  {flyerError}
                </div>
              )}

              {/* FLYER BUTTON */}

              {!flyerImage && (
                <button
                  className="result-button"
                  onClick={
                    handleGenerateFlyer
                  }
                  disabled={
                    flyerLoading
                  }
                >
                  {flyerLoading
                    ? '🎨 Generating Flyer...'
                    : '🎨 Generate Flyer'}
                </button>
              )}
            </div>
          </div>

          {/* CREATE ANOTHER */}

          <button
            className="create-another"
            onClick={
              handleCreateAnother
            }
          >
            ← Create Another Campaign
          </button>
        </main>
      </div>
    )
  }

  // =========================================================
  // FORM PAGE
  // =========================================================

  return (
    <div className="create-page">
      {/* NAVIGATION */}

      <nav className="create-nav">
        <button
          className="back-button"
          onClick={onBack}
        >
          ← Back
        </button>

        <div className="create-logo">
          🤖 BizAd{' '}
          <strong>AI</strong>
        </div>

        <div className="step-indicator">
          Step 1 of 2
        </div>
      </nav>

      {/* FORM */}

      <main className="form-container">
        <div className="form-heading">
          <div className="form-badge">
            ✨{' '}
            {isEditing
              ? 'EDIT CAMPAIGN'
              : 'AI CAMPAIGN BUILDER'}
          </div>

          <h1>
            {isEditing
              ? 'Update your campaign.'
              : 'Tell us about your business.'}
          </h1>

          <p>
            {isEditing
              ? 'Update your business details and regenerate the campaign. Your existing campaign will be updated instead of creating a duplicate.'
              : 'Give us a few details and BizAd AI will turn them into professional advertising content.'}
          </p>
        </div>

        <form
          onSubmit={
            handleSubmit
          }
        >
          {/* =================================================
              SECTION 01
          ================================================= */}

          <section className="form-section">
            <div className="section-number">
              01
            </div>

            <div className="section-content">
              <h2>
                Business information
              </h2>

              <p>
                Start with the basics about your business.
              </p>

              <div className="form-grid">
                {/* BUSINESS NAME */}

                <div className="form-field">
                  <label>
                    Business name *
                  </label>

                  <input
                    type="text"
                    name="businessName"
                    value={
                      form.businessName
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="e.g. JOKBIS Laundromat"
                    required
                  />
                </div>

                {/* CATEGORY */}

                <div className="form-field">
                  <label>
                    Business category *
                  </label>

                  <input
                    type="text"
                    name="category"
                    value={
                      form.category
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="e.g. Laundry, Restaurant, Fashion"
                    required
                  />
                </div>

                {/* DESCRIPTION */}

                <div className="form-field full">
                  <label>
                    What does your business do? *
                  </label>

                  <textarea
                    name="description"
                    value={
                      form.description
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="Describe your products or services..."
                    rows="4"
                    required
                  />
                </div>
              </div>
            </div>
          </section>

          {/* =================================================
              SECTION 02
          ================================================= */}

          <section className="form-section">
            <div className="section-number">
              02
            </div>

            <div className="section-content">
              <h2>
                Who are you trying to reach?
              </h2>

              <p>
                This helps BizAd AI create advertising that speaks to your customers.
              </p>

              <div className="form-grid">
                {/* TARGET CUSTOMERS */}

                <div className="form-field">
                  <label>
                    Target customers *
                  </label>

                  <input
                    type="text"
                    name="audience"
                    value={
                      form.audience
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="e.g. Families, students, professionals"
                    required
                  />
                </div>

                {/* LOCATION */}

                <div className="form-field">
                  <label>
                    Location
                  </label>

                  <input
                    type="text"
                    name="location"
                    value={
                      form.location
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="e.g. Lagos, Nigeria"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* =================================================
              SECTION 03
          ================================================= */}

          <section className="form-section">
            <div className="section-number">
              03
            </div>

            <div className="section-content">
              <h2>
                What are you promoting?
              </h2>

              <p>
                Give us your offer, contact details and preferred ad format.
              </p>

              <div className="form-grid">
                {/* OFFER */}

                <div className="form-field full">
                  <label>
                    Special offer or message
                  </label>

                  <input
                    type="text"
                    name="offer"
                    value={
                      form.offer
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="e.g. Get 20% off this week"
                  />
                </div>

                {/* CONTACT */}

                <div className="form-field">
                  <label>
                    WhatsApp / Phone
                  </label>

                  <input
                    type="text"
                    name="contact"
                    value={
                      form.contact
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="+234 800 000 0000"
                  />
                </div>

                {/* WEBSITE */}

                <div className="form-field">
                  <label>
                    Website
                  </label>

                  <input
                    type="url"
                    name="website"
                    value={
                      form.website
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="https://yourbusiness.com"
                  />
                </div>

                {/* AD TYPE */}

                <div className="form-field full">
                  <label>
                    What should BizAd AI create?
                  </label>

                  <div className="ad-type-grid">
                    {[
                      [
                        'Video Ad',
                        '🎬',
                        '12-second promotional video',
                      ],
                      [
                        'Flyer',
                        '🖼️',
                        'Social media design',
                      ],
                      [
                        'Ad Copy',
                        '✍️',
                        'Captions and headlines',
                      ],
                    ].map(
                      ([
                        type,
                        icon,
                        description,
                      ]) => (
                        <button
                          type="button"
                          key={type}
                          className={`ad-type ${
                            form.adType ===
                            type
                              ? 'selected'
                              : ''
                          }`}
                          onClick={() => {
                            if (type === 'Video Ad' && plan !== 'business') {
                              setVideoLockedNotice(true)
                              return
                            }

                            setVideoLockedNotice(false)
                            setForm({
                              ...form,
                              adType: type,
                            })
                          }}
                        >
                          <span>
                            {icon}
                          </span>

                          <strong>
                            {type}
                          </strong>

                          <small>
                            {description}
                          </small>

                          {type === 'Video Ad' && plan !== 'business' && (
                            <small style={{
                              marginTop: '6px',
                              fontWeight: '700',
                              color: '#7c3aed',
                            }}>
                              🔒 Business only
                            </small>
                          )}
                        </button>
                      )
                    )}
                  </div>

                  {videoLockedNotice && plan !== 'business' && (
                    <div
                      role="status"
                      style={{
                        marginTop: '14px',
                        padding: '16px',
                        borderRadius: '14px',
                        border: '1px solid rgba(124, 58, 237, 0.18)',
                        background: 'rgba(124, 58, 237, 0.06)',
                      }}
                    >
                      <strong style={{ display: 'block', marginBottom: '6px' }}>
                        🎬 AI Video Ads are a Business feature
                      </strong>
                      <span style={{ display: 'block', color: '#6b7280', fontSize: '14px', lineHeight: '1.5' }}>
                        Create professional 12-second promotional videos with BizAd AI.
                      </span>
                      <span style={{ display: 'block', marginTop: '8px', color: '#7c3aed', fontSize: '13px', fontWeight: '700' }}>
                        Business includes 200 AI credits per month • 10 credits per video
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ERROR */}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* SUBMIT */}

          <div className="form-submit">
            <div>
              <strong>
                {isEditing
                  ? 'Ready to update your campaign?'
                  : 'Ready to create your campaign?'}
              </strong>

              <span>
                {isEditing
                  ? 'BizAd AI will regenerate your campaign using your updated information.'
                  : 'BizAd AI will do the heavy lifting.'}
              </span>
            </div>

            <button
              type="submit"
              className="generate-button"
              disabled={loading}
            >
              {loading
                ? '🤖 Processing...'
                : isEditing
                  ? 'Update My Campaign 🤖'
                  : 'Generate My Ad 🤖'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}


export default CreateAd