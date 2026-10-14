import { useMemo, useState } from 'react'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')

function WhatsAppMarketing({ onBack }) {
  const [form, setForm] = useState({
    businessName: '',
    offer: '',
    audience: '',
    tone: 'Friendly',
    callToAction: '',
    details: '',
  })

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [regenerating, setRegenerating] = useState(false)

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const parseGeneratedContent = (text) => {
    const clean = String(text || '').trim()

    const extract = (patterns, fallback = '') => {
      for (const pattern of patterns) {
        const match = clean.match(pattern)
        if (match?.[1]?.trim()) {
          return match[1].trim()
        }
      }
      return fallback
    }

    const status = extract([
      /(?:WHATSAPP\s+)?STATUS\s*:?\s*\n?([\s\S]*?)(?=\n\s*(?:CUSTOMER\s+BROADCAST|BROADCAST\s+MESSAGE|PROMOTIONAL\s+CAPTION)\s*:??\s*\n|$)/i,
    ])

    const broadcast = extract([
      /(?:CUSTOMER\s+BROADCAST|BROADCAST\s+MESSAGE)\s*:?\s*\n?([\s\S]*?)(?=\n\s*(?:PROMOTIONAL\s+CAPTION|WHATSAPP\s+STATUS)\s*:??\s*\n|$)/i,
    ])

    const caption = extract([
      /PROMOTIONAL\s+CAPTION\s*:?\s*\n?([\s\S]*?)(?=\n\s*(?:CUSTOMER\s+BROADCAST|BROADCAST\s+MESSAGE|WHATSAPP\s+STATUS)\s*:??\s*\n|$)/i,
    ])

    if (status || broadcast || caption) {
      return {
        status: status || clean,
        broadcast: broadcast || clean,
        caption: caption || clean,
      }
    }

    return {
      status: clean,
      broadcast: clean,
      caption: clean,
    }
  }

  const generatedText = useMemo(() => {
    if (!result) return ''
    return [
      'WHATSAPP STATUS',
      result.status,
      '',
      'CUSTOMER BROADCAST',
      result.broadcast,
      '',
      'PROMOTIONAL CAPTION',
      result.caption,
    ].join('\n')
  }, [result])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (loading) return

    setLoading(true)
    setError('')
    setResult(null)
    setCopied('')

    const instruction = `
Create a WhatsApp marketing content pack for this business.

Business name: ${form.businessName}
Offer/product being promoted: ${form.offer || 'Not specified'}
Target customers: ${form.audience || 'General customers'}
Tone: ${form.tone}
Call to action: ${form.callToAction || 'Contact the business today'}
Additional details: ${form.details || 'None'}

Return EXACTLY these three sections and nothing else:
WHATSAPP STATUS
Write a short, catchy WhatsApp Status message. Keep it easy to read on a phone and include relevant emojis where appropriate.

CUSTOMER BROADCAST
Write a warm, persuasive message suitable for sending directly to existing customers on WhatsApp.

PROMOTIONAL CAPTION
Write a polished promotional caption that can also be used with a WhatsApp promotional post.

Do not mention that AI generated the content. Do not use markdown headings beyond the three required section labels.
    `.trim()

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate-ad`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessName: form.businessName,
          category: 'WhatsApp Marketing',
          description: instruction,
          audience: form.audience,
          location: '',
          offer: form.offer,
          contact: '',
          website: '',
          adType: 'WhatsApp Marketing',
        }),
      })

      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('BizAd AI returned an invalid response.')
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your BizAd AI session has expired. Please log in again.')
        }
        throw new Error(data.error || 'Unable to generate WhatsApp content.')
      }

      if (!data.campaign) {
        throw new Error('BizAd AI did not return WhatsApp content. Please try again.')
      }

      setResult(parseGeneratedContent(data.campaign))
    } catch (requestError) {
      console.error('WhatsApp marketing generation error:', requestError)
      setError(
        requestError.message?.includes('Failed to fetch') ||
          requestError.message?.includes('ERR_CONNECTION_REFUSED')
          ? 'BizAd AI server is not available. Please make sure the backend is running.'
          : requestError.message || 'Unable to generate WhatsApp content. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const copyText = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      window.setTimeout(() => setCopied(''), 1800)
    } catch (copyError) {
      console.error('WhatsApp copy error:', copyError)
      setError('Unable to copy this message. Please select and copy it manually.')
    }
  }

  const reset = () => {
    setResult(null)
    setError('')
    setCopied('')
  }

  const instructionForRegeneration = (currentForm) => `
Create a fresh WhatsApp marketing content pack for this business.
Business name: ${currentForm.businessName}
Offer/product being promoted: ${currentForm.offer || 'Not specified'}
Target customers: ${currentForm.audience || 'General customers'}
Tone: ${currentForm.tone}
Call to action: ${currentForm.callToAction || 'Contact the business today'}
Additional details: ${currentForm.details || 'None'}
Return EXACTLY these three sections and nothing else:
WHATSAPP STATUS
Write a short, catchy WhatsApp Status message. Keep it easy to read on a phone and include relevant emojis where appropriate.
CUSTOMER BROADCAST
Write a warm, persuasive message suitable for sending directly to existing customers on WhatsApp.
PROMOTIONAL CAPTION
Write a polished promotional caption that can also be used with a WhatsApp promotional post.
Do not mention that AI generated the content. Do not use markdown headings beyond the three required section labels.
`.trim()

  const handleRegenerate = async () => {
    if (regenerating || loading) return
    setRegenerating(true)
    setError('')
    setCopied('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate-ad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          businessName: form.businessName,
          category: 'WhatsApp Marketing',
          description: `${instructionForRegeneration(form)}`,
          audience: form.audience,
          location: '',
          offer: form.offer,
          contact: '',
          website: '',
          adType: 'WhatsApp Marketing',
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your BizAd AI session has expired. Please log in again.')
        }
        throw new Error(data.error || 'Unable to regenerate WhatsApp content.')
      }
      if (!data.campaign) throw new Error('BizAd AI did not return new WhatsApp content.')
      setResult(parseGeneratedContent(data.campaign))
    } catch (requestError) {
      console.error('WhatsApp regeneration error:', requestError)
      setError(requestError.message || 'Unable to regenerate WhatsApp content. Please try again.')
    } finally {
      setRegenerating(false)
    }
  }


  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8f9fc',
        color: '#101828',
      }}
    >
      <nav
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #eaecf0',
          minHeight: '76px',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#475467',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          ← Back to BizAd AI
        </button>

        <div style={{ fontSize: '20px', fontWeight: '700' }}>
          🤖 BizAd <span style={{ color: '#6941c6' }}>AI</span>
        </div>

        <div style={{ width: '120px' }} />
      </nav>

      <main
        style={{
          maxWidth: '1050px',
          margin: '0 auto',
          padding: '65px 24px 100px',
        }}
      >
        {!result ? (
          <>
            <div style={{ maxWidth: '720px', marginBottom: '38px' }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: '8px 14px',
                  borderRadius: '999px',
                  background: '#e9fbf0',
                  color: '#087443',
                  fontSize: '13px',
                  fontWeight: '700',
                  letterSpacing: '0.04em',
                  marginBottom: '18px',
                }}
              >
                📱 WHATSAPP MARKETING
              </div>

              <h1
                style={{
                  fontSize: 'clamp(38px, 5vw, 60px)',
                  lineHeight: '1.05',
                  margin: '0 0 18px',
                }}
              >
                Turn your offer into WhatsApp content.
              </h1>

              <p
                style={{
                  margin: 0,
                  color: '#667085',
                  fontSize: '18px',
                  lineHeight: '1.7',
                }}
              >
                Create a WhatsApp Status, customer broadcast and promotional caption in one generation.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                background: '#ffffff',
                border: '1px solid #e4e7ec',
                borderRadius: '24px',
                padding: '32px',
                boxShadow: '0 15px 45px rgba(16, 24, 40, 0.06)',
              }}
            >
              <div
                className="whatsapp-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '22px',
                }}
              >
                <Field label="Business name *">
                  <input
                    name="businessName"
                    value={form.businessName}
                    onChange={updateField}
                    placeholder="e.g. JOKBIS Laundromat"
                    required
                  />
                </Field>

                <Field label="What are you promoting? *">
                  <input
                    name="offer"
                    value={form.offer}
                    onChange={updateField}
                    placeholder="e.g. 25-piece laundry package"
                    required
                  />
                </Field>

                <Field label="Target customers">
                  <input
                    name="audience"
                    value={form.audience}
                    onChange={updateField}
                    placeholder="e.g. Busy professionals in Lagos"
                  />
                </Field>

                <Field label="Tone">
                  <select name="tone" value={form.tone} onChange={updateField}>
                    <option>Friendly</option>
                    <option>Professional</option>
                    <option>Urgent</option>
                    <option>Fun</option>
                  </select>
                </Field>

                <Field label="Call to action">
                  <input
                    name="callToAction"
                    value={form.callToAction}
                    onChange={updateField}
                    placeholder="e.g. Message us now to book"
                  />
                </Field>

                <Field label="Additional details">
                  <input
                    name="details"
                    value={form.details}
                    onChange={updateField}
                    placeholder="Location, deadline, contact, etc."
                  />
                </Field>
              </div>

              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: '24px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    background: '#fff5f5',
                    border: '1px solid #fecaca',
                    color: '#b42318',
                    lineHeight: '1.5',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  marginTop: '28px',
                  minHeight: '54px',
                  border: 'none',
                  borderRadius: '12px',
                  background: loading ? '#b8a9e8' : '#6941c6',
                  color: '#ffffff',
                  fontSize: '16px',
                  fontWeight: '700',
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? '✨ Creating WhatsApp content...' : 'Generate WhatsApp Content ✨'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 42px' }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: '8px 14px',
                  borderRadius: '999px',
                  background: '#e9fbf0',
                  color: '#087443',
                  fontSize: '13px',
                  fontWeight: '700',
                  marginBottom: '18px',
                }}
              >
                ✨ CONTENT READY
              </div>
              <h1 style={{ margin: '0 0 14px', fontSize: 'clamp(36px, 5vw, 54px)' }}>
                Your WhatsApp content is ready.
              </h1>
              <p style={{ margin: 0, color: '#667085', fontSize: '17px', lineHeight: '1.7' }}>
                Copy any message below and start engaging your customers.
              </p>
            </div>

            <div style={{ display: 'grid', gap: '20px' }}>
              <MessageCard
                icon="📱"
                title="WhatsApp Status"
                description="Short and attention-grabbing."
                text={result.status}
                copied={copied === 'status'}
                onCopy={() => copyText('status', result.status)}
              />

              <MessageCard
                icon="💬"
                title="Customer Broadcast"
                description="Ready to send directly to customers."
                text={result.broadcast}
                copied={copied === 'broadcast'}
                onCopy={() => copyText('broadcast', result.broadcast)}
              />

              <MessageCard
                icon="📣"
                title="Promotional Caption"
                description="Perfect for a promotional WhatsApp post."
                text={result.caption}
                copied={copied === 'caption'}
                onCopy={() => copyText('caption', result.caption)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginTop: '30px',
              }}
            >
              <button
                type="button"
                onClick={() => copyText('all', generatedText)}
                style={{
                  border: 'none',
                  background: '#6941c6',
                  color: '#ffffff',
                  padding: '13px 20px',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                {copied === 'all' ? '✓ Copied All' : 'Copy All'}
              </button>

              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                style={{
                  border: '1px solid #d0d5dd',
                  background: regenerating ? '#f2f4f7' : '#ffffff',
                  color: '#344054',
                  padding: '13px 20px',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: regenerating ? 'wait' : 'pointer',
                }}
              >
                {regenerating ? '✨ Regenerating...' : '↻ Regenerate'}
              </button>

              <button
                type="button"
                onClick={reset}
                style={{
                  border: '1px solid #d0d5dd',
                  background: '#ffffff',
                  color: '#344054',
                  padding: '13px 20px',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                ← Create Another
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ fontSize: '14px', fontWeight: '700', color: '#344054' }}>
        {label}
      </span>
      {children}
      <style>{`
        input, select {
          width: 100%;
          box-sizing: border-box;
          min-height: 50px;
          border: 1px solid #d0d5dd;
          border-radius: 10px;
          padding: 0 14px;
          background: #ffffff;
          color: #101828;
          font: inherit;
          outline: none;
        }
        input:focus, select:focus {
          border-color: #6941c6;
          box-shadow: 0 0 0 3px rgba(105, 65, 198, 0.10);
        }
        @media (max-width: 720px) {
          .whatsapp-form-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </label>
  )
}

function MessageCard({ icon, title, description, text, copied, onCopy }) {
  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e4e7ec',
        borderRadius: '20px',
        padding: '26px',
        boxShadow: '0 10px 30px rgba(16, 24, 40, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '18px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: '#e9fbf0',
            display: 'grid',
            placeItems: 'center',
            fontSize: '21px',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <h2 style={{ margin: '0 0 5px', fontSize: '21px' }}>{title}</h2>
          <p style={{ margin: 0, color: '#667085', fontSize: '14px' }}>{description}</p>
        </div>
      </div>

      <div
        style={{
          background: '#f8f9fc',
          border: '1px solid #eaecf0',
          borderRadius: '14px',
          padding: '20px',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.75',
          color: '#344054',
          fontSize: '15px',
        }}
      >
        {text}
      </div>

      <button
        type="button"
        onClick={onCopy}
        style={{
          marginTop: '14px',
          border: '1px solid #d0d5dd',
          background: '#ffffff',
          color: '#344054',
          padding: '10px 15px',
          borderRadius: '9px',
          fontWeight: '700',
          cursor: 'pointer',
        }}
      >
        {copied ? '✓ Copied' : 'Copy Message'}
      </button>
    </section>
  )
}

export default WhatsAppMarketing
