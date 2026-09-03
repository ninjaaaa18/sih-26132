import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL, DEMO_FARMER_ID, apiFetch } from './api'
import { LANGS, VOICE_LANGS, translate } from './translations'
import './App.css'

const emptyForm = { crop_id: '', quantity: '', unit: 'kg', harvest_date: '', location_id: '', price_expectation: '' }

function locationLabel(location) {
  return [location.village, location.tehsil, location.district, location.state].filter(Boolean).join(', ')
}

function formatRupees(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value))
}

function localDateValue() {
  const today = new Date()
  return formatLocalDate(today)
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseVoiceDate(normalized) {
  const relativeNumberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }
  const relativeCandidates = []
  const relativeText = normalized.replace(/\bday before yesterday\b/g, '')
  if (/\bday before yesterday\b/.test(normalized)) relativeCandidates.push(2)
  if (/\byesterday\b/.test(relativeText)) relativeCandidates.push(1)
  if (/\btoday\b/.test(normalized)) relativeCandidates.push(0)
  const relativeMatch = relativeText.match(/\b(\d+|one|two|three|four|five|six|seven|a)\s+(?:days?|week)\s+(?:ago|back)\b/)
  if (relativeMatch) {
    const amount = relativeMatch[1] === 'a' ? (relativeMatch[0].includes('week') ? 7 : 1) : (relativeNumberWords[relativeMatch[1]] || Number(relativeMatch[1]))
    relativeCandidates.push(relativeMatch[0].includes('week') ? amount * 7 : amount)
  }
  if (relativeCandidates.length > 1) return ''
  if (relativeCandidates.length === 1) {
    if (relativeCandidates[0] === 0) return localDateValue()
    const date = new Date()
    date.setDate(date.getDate() - relativeCandidates[0])
    return formatLocalDate(date)
  }

  const months = 'january february march april may june july august september october november december'.split(' ')
  const monthPattern = months.join('|')
  const dayMonthMatch = normalized.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\s+(\\d{4}))?\\b`))
  const monthDayMatch = normalized.match(new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`))
  if (dayMonthMatch && monthDayMatch) return ''
  const match = dayMonthMatch || monthDayMatch
  if (!match) return (normalized.match(/\b\d{4}-\d{2}-\d{2}\b/) || [])[0] || ''
  const day = Number(dayMonthMatch ? match[1] : match[2])
  const month = months.indexOf(dayMonthMatch ? match[2] : match[1])
  const year = Number(match[3] || new Date().getFullYear())
  const date = new Date(year, month, day)
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? formatLocalDate(date) : ''
}

function parseVoiceTranscript(transcript, crops, locations) {
  const normalized = transcript.toLowerCase()
  const quantityMatch = normalized.match(/\b\d+(?:\.\d+)?\b/)
  const unitMatch = normalized.match(/\b(kilograms?|kg|quintals?|tonnes?|tons?|tonne)\b/)
  const unit = unitMatch ? ({ kilogram: 'kg', kilograms: 'kg', kg: 'kg', quintal: 'quintal', quintals: 'quintal', tonne: 'tonne', tonnes: 'tonne', ton: 'tonne', tons: 'tonne' }[unitMatch[1]]) : ''
  const cropMatches = crops.filter((crop) => normalized.includes(crop.name.toLowerCase()))
  const locationMatches = locations.filter((location) => [location.village, location.tehsil, location.district].filter(Boolean).some((value) => normalized.includes(value.toLowerCase())))
  const dateValue = parseVoiceDate(normalized)
  const issues = []
  if (!quantityMatch) issues.push('quantity')
  if (!unit) issues.push('unit')
  if (cropMatches.length !== 1) issues.push(cropMatches.length ? 'one unambiguous crop' : 'crop')
  if (locationMatches.length !== 1) issues.push(locationMatches.length ? 'one unambiguous location' : 'location')
  if (!dateValue) issues.push('harvest date')
  return {
    values: { crop_id: cropMatches.length === 1 ? cropMatches[0].id : '', quantity: quantityMatch?.[0] || '', unit, harvest_date: dateValue, location_id: locationMatches.length === 1 ? locationMatches[0].id : '' },
    issues,
  }
}

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('kheti-setu-lang') || 'en')
  const t = (key, args) => translate(language, key, args)
  const [crops, setCrops] = useState([])
  const [locations, setLocations] = useState([])
  const [farmer, setFarmer] = useState(null)
  const [lots, setLots] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState('')
  const [comparisonLot, setComparisonLot] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState('')
  const [recommendations, setRecommendations] = useState({})
  const [buyerMatches, setBuyerMatches] = useState({})
  const [buyerOffers, setBuyerOffers] = useState({})
  const [buyerOfferViews, setBuyerOfferViews] = useState({})
  const [buyerAcceptances, setBuyerAcceptances] = useState({})
  const [priceHistoryLot, setPriceHistoryLot] = useState(null)
  const [priceTrends, setPriceTrends] = useState(null)
  const [priceTrendsLoading, setPriceTrendsLoading] = useState(false)
  const [priceTrendsError, setPriceTrendsError] = useState('')
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceDetails, setVoiceDetails] = useState(null)
  const [voiceError, setVoiceError] = useState('')
  const recognitionRef = useRef(null)

  useEffect(() => {
    let active = true
    Promise.all([
      apiFetch('/api/v1/crops'),
      apiFetch('/api/v1/locations'),
      apiFetch(`/api/v1/farmer-profiles/${DEMO_FARMER_ID}`),
    ]).then(([cropData, locationData, farmerData]) => {
      if (!active) return
      setCrops(cropData)
      setLocations(locationData)
      setFarmer(farmerData)
      setForm((current) => ({ ...current, location_id: farmerData.location_id }))
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage)
    localStorage.setItem('kheti-setu-lang', nextLanguage)
  }

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
    setSubmitError('')
    setSuccess('')
  }

  function startVoiceCapture() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceError(t('voice.unsupported'))
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = VOICE_LANGS[language] || 'en-IN'
    recognition.onstart = () => { setVoiceListening(true); setVoiceError(''); setVoiceTranscript(''); setVoiceDetails(null) }
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim()
      setVoiceTranscript(transcript)
      const parsed = parseVoiceTranscript(transcript, crops, locations)
      setVoiceDetails(parsed)
      if (parsed.issues.length === 0) setForm((current) => ({ ...current, ...parsed.values }))
    }
    recognition.onerror = (event) => {
      setVoiceListening(false)
      setVoiceError(event.error === 'not-allowed' ? t('voice.permission') : t('voice.failed', event.error))
    }
    recognition.onend = () => setVoiceListening(false)
    recognitionRef.current = recognition
    recognition.start()
  }

  function stopVoiceCapture() {
    recognitionRef.current?.stop()
    setVoiceListening(false)
  }

  function editVoiceDetails() {
    if (voiceDetails) setForm((current) => ({ ...current, ...voiceDetails.values }))
    setVoiceDetails(null)
    setVoiceError('')
  }

  function confirmVoiceLot() {
    handleSubmit({ preventDefault: () => {} })
    setVoiceDetails(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    setSuccess('')
    try {
      const created = await apiFetch('/api/v1/produce-lots', {
        method: 'POST',
        body: JSON.stringify({
          farmer_profile_id: DEMO_FARMER_ID,
          crop_id: form.crop_id,
          lot_number: `LOT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          quantity: Number(form.quantity),
          unit: form.unit,
          harvest_date: form.harvest_date,
          location_id: form.location_id,
          price_expectation: form.price_expectation ? Number(form.price_expectation) : null,
        }),
      })
      const retrieved = await apiFetch(`/api/v1/produce-lots/${created.id}`)
      setLots((current) => [retrieved, ...current])
      loadRecommendation(retrieved.id)
      setForm((current) => ({ ...emptyForm, location_id: current.location_id }))
      setSuccess(t('success.lot.saved'))
    } catch (requestError) {
      setSubmitError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function compareMarkets(lot) {
    setComparisonLot(lot)
    setComparison(null)
    setComparisonError('')
    setComparisonLoading(true)
    try {
      const result = await apiFetch(`/api/v1/produce-lots/${lot.id}/net-realization`)
      setComparison(result)
    } catch (requestError) {
      setComparisonError(requestError.message)
    } finally {
      setComparisonLoading(false)
    }
  }

  async function loadRecommendation(lotId) {
    setRecommendations((current) => ({ ...current, [lotId]: { status: 'loading' } }))
    try {
      const result = await apiFetch(`/api/v1/produce-lots/${lotId}/recommendation`)
      setRecommendations((current) => ({ ...current, [lotId]: { status: 'success', data: result } }))
    } catch (requestError) {
      setRecommendations((current) => ({ ...current, [lotId]: { status: 'error', error: requestError.message } }))
    }
  }

  async function loadBuyerMatches(lotId) {
    setBuyerMatches((current) => ({ ...current, [lotId]: { status: 'loading' } }))
    setBuyerOfferViews((current) => ({ ...current, [lotId]: null }))
    setBuyerAcceptances((current) => ({ ...current, [lotId]: null }))
    try {
      const result = await apiFetch(`/api/v1/produce-lots/${lotId}/buyer-matches`)
      setBuyerMatches((current) => ({ ...current, [lotId]: { status: 'success', data: result } }))
    } catch (requestError) {
      setBuyerMatches((current) => ({ ...current, [lotId]: { status: 'error', error: requestError.message } }))
    }
  }

  async function sellLotAndFindBuyers(lot) {
    setBuyerMatches((current) => ({ ...current, [lot.id]: { status: 'selling' } }))
    setBuyerOfferViews((current) => ({ ...current, [lot.id]: null }))
    setBuyerAcceptances((current) => ({ ...current, [lot.id]: null }))
    try {
      const result = await apiFetch(`/api/v1/produce-lots/${lot.id}/sell`, { method: 'POST' })
      setLots((current) => current.map((item) => (item.id === lot.id ? { ...item, lot_status: result.lot_status } : item)))
      await loadBuyerMatches(lot.id)
    } catch (requestError) {
      setBuyerMatches((current) => ({ ...current, [lot.id]: { status: 'error', error: requestError.message } }))
    }
  }

  async function loadBuyerOffers(lotId) {
    setBuyerOffers((current) => ({ ...current, [lotId]: { status: 'loading' } }))
    try {
      const result = await apiFetch(`/api/v1/produce-lots/${lotId}/buyer-offers`)
      setBuyerOffers((current) => ({ ...current, [lotId]: { status: 'success', data: result } }))
      return result
    } catch (requestError) {
      setBuyerOffers((current) => ({ ...current, [lotId]: { status: 'error', error: requestError.message } }))
      throw requestError
    }
  }

  async function viewBuyerOffer(lotId, match) {
    setBuyerOfferViews((current) => ({
      ...current,
      [lotId]: { status: 'loading', buyerProfileId: match.buyer_profile_id, companyName: match.company_name },
    }))
    try {
      const offersResult = await loadBuyerOffers(lotId)
      const pendingOffer = offersResult.offers?.find(
        (offer) => offer.buyer_profile_id === match.buyer_profile_id && offer.offer_status === 'pending',
      )
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: {
          status: pendingOffer ? 'ready' : 'needs-offer',
          buyerProfileId: match.buyer_profile_id,
          companyName: match.company_name,
          offer: pendingOffer || null,
          preferredPriceUnit: match.preferred_price_unit,
        },
      }))
    } catch (requestError) {
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: { status: 'error', buyerProfileId: match.buyer_profile_id, companyName: match.company_name, error: requestError.message },
      }))
    }
  }

  async function generateBuyerOffer(lotId, buyerProfileId) {
    setBuyerOfferViews((current) => ({
      ...current,
      [lotId]: { ...current[lotId], status: 'generating' },
    }))
    try {
      const offer = await apiFetch(`/api/v1/produce-lots/${lotId}/buyer-offers`, {
        method: 'POST',
        body: JSON.stringify({ buyer_profile_id: buyerProfileId }),
      })
      setBuyerOffers((current) => ({
        ...current,
        [lotId]: {
          status: 'success',
          data: {
            produce_lot_id: lotId,
            offers: [offer, ...(current[lotId]?.data?.offers || []).filter((item) => item.id !== offer.id)],
          },
        },
      }))
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: { ...current[lotId], status: 'ready', offer },
      }))
    } catch (requestError) {
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: { ...current[lotId], status: 'error', error: requestError.message },
      }))
    }
  }

  async function acceptBuyerOffer(lotId, offerId) {
    setBuyerOfferViews((current) => ({
      ...current,
      [lotId]: { ...current[lotId], status: 'accepting' },
    }))
    try {
      const result = await apiFetch(`/api/v1/buyer-offers/${offerId}/accept`, { method: 'POST' })
      setBuyerAcceptances((current) => ({ ...current, [lotId]: { status: 'success', data: result } }))
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: { ...current[lotId], status: 'accepted', offer: result.offer },
      }))
      setLots((current) => current.map((item) => (item.id === lotId ? { ...item, lot_status: 'sold' } : item)))
    } catch (requestError) {
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: { ...current[lotId], status: 'accept-error', error: requestError.message },
      }))
    }
  }

  function buyerLocationLabel(matchLocation) {
    return [matchLocation.village, matchLocation.tehsil, matchLocation.district, matchLocation.state].filter(Boolean).join(', ')
  }

  async function viewPriceHistory(lot) {
    setPriceHistoryLot(lot)
    setPriceTrends(null)
    setPriceTrendsError('')
    setPriceTrendsLoading(true)
    try {
      const result = await apiFetch(`/api/v1/price-trends?crop_id=${lot.crop_id}`)
      setPriceTrends(result)
    } catch (requestError) {
      setPriceTrendsError(requestError.message)
    } finally {
      setPriceTrendsLoading(false)
    }
  }

  function closeComparison() {
    setComparisonLot(null)
    setComparison(null)
    setComparisonError('')
  }

  function closePriceHistory() {
    setPriceHistoryLot(null)
    setPriceTrends(null)
    setPriceTrendsError('')
  }

  const cropName = (id) => crops.find((crop) => crop.id === id)?.name || t('table.unknown.crop')
  const locationName = (id) => { const location = locations.find((item) => item.id === id); return location ? locationLabel(location) : t('table.unknown.location') }
  const lotStatusLabel = (value) => ({ draft: t('status.draft'), active: t('status.available'), matched: t('status.available'), offered: t('status.offered'), accepted: t('status.sold'), sold: t('status.sold'), rejected: t('status.rejected'), cancelled: t('status.cancelled') }[value] || value)

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Kheti Setu home"><span className="brand-mark">KS</span><span>Kheti Setu</span></a><div className="topbar-actions"><span className="demo-label">{t('demo.farmer')}</span><select className="language-select" value={language} onChange={(event) => changeLanguage(event.target.value)} aria-label="Language">{LANGS.map((lang) => <option key={lang.code} value={lang.code}>{lang.label}</option>)}</select></div></header>
    <section className="welcome-row"><div><p className="eyebrow">{t('farmer.workspace')} <span>/</span> {farmer?.full_name || t('loading.profile')}</p><h1>{t('greeting.morning')}, {farmer?.full_name?.split(' ')[0] || t('greeting.farmer')}.</h1><p className="welcome-copy">{t('welcome.copy')}</p></div><a className="primary-button" href="#add-lot">{t('action.add.lot')} <span>+</span></a></section>
    {error && <div className="alert alert-error" role="alert"><strong>{t('error.load.farm')}</strong> {error}</div>}
    <section className="workspace-grid">
      <div className="form-panel" id="add-lot"><div className="section-heading"><div><p className="eyebrow">{t('form.new.entry')}</p><h2>{t('form.add.lot')}</h2></div><div className="voice-actions"><button className="voice-button" type="button" onClick={voiceListening ? stopVoiceCapture : startVoiceCapture} disabled={loading || submitting}>{voiceListening ? t('voice.stop') : t('voice.create')} <span aria-hidden="true">{voiceListening ? '■' : '◉'}</span></button><span className="step-count">01 <span>/ 01</span></span></div></div>{voiceListening && <div className="voice-status" role="status"><span className="recording-dot" /> {t('voice.listening')}</div>}{voiceError && <div className="alert alert-error" role="alert">{voiceError}</div>}{voiceTranscript && <div className="voice-transcript"><span>{t('voice.transcript')}</span><strong>“{voiceTranscript}”</strong></div>}{voiceDetails && <div className="voice-confirmation"><p className="eyebrow">{t('voice.detected')}</p>{voiceDetails.issues.length > 0 ? <><strong>{t('voice.attention')}</strong><p>{t('voice.missing')} {voiceDetails.issues.join(', ')}.</p><button className="edit-voice-button" type="button" onClick={editVoiceDetails}>{t('voice.edit.form')}</button></> : <><p className="voice-summary">{t('voice.crop')}: <strong>{cropName(voiceDetails.values.crop_id)}</strong><br />{t('voice.quantity')}: <strong>{voiceDetails.values.quantity} {voiceDetails.values.unit}</strong><br />{t('voice.harvest.date')}: <strong>{voiceDetails.values.harvest_date}</strong><br />{t('voice.location')}: <strong>{locationName(voiceDetails.values.location_id)}</strong></p><div className="voice-confirm-actions"><button className="submit-button" type="button" onClick={confirmVoiceLot} disabled={submitting}>{t('voice.confirm.create')} <span>→</span></button><button className="edit-voice-button" type="button" onClick={editVoiceDetails}>{t('voice.edit')}</button></div></>}</div>
        }
        <form onSubmit={handleSubmit}><div className="form-grid">
          <label><span>{t('form.crop')} <b>*</b></span><select name="crop_id" value={form.crop_id} onChange={updateField} required disabled={loading || submitting}><option value="">{t('form.choose.crop')}</option>{crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></label>
          <label><span>{t('form.quantity')} <b>*</b></span><input name="quantity" type="number" min="0.01" step="0.01" value={form.quantity} onChange={updateField} placeholder={t('form.e.g')} required disabled={submitting} /></label>
          <label><span>{t('form.unit')} <b>*</b></span><select name="unit" value={form.unit} onChange={updateField} required disabled={submitting}><option value="kg">{t('form.kg')}</option><option value="quintal">{t('form.quintal')}</option><option value="tonne">{t('form.tonne')}</option></select></label>
          <label><span>{t('form.harvest.date')} <b>*</b></span><input name="harvest_date" type="date" value={form.harvest_date} onChange={updateField} required disabled={submitting} /></label>
          <label className="wide-field"><span>{t('form.pickup')} <b>*</b></span><select name="location_id" value={form.location_id} onChange={updateField} required disabled={loading || submitting}><option value="">{t('form.choose.location')}</option>{locations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label>
          <label><span>{t('form.expected.price')} <small>{t('form.per.unit')}</small></span><div className="input-prefix"><span>₹</span><input name="price_expectation" type="number" min="0.01" step="0.01" value={form.price_expectation} onChange={updateField} placeholder={t('form.optional')} disabled={submitting} /></div></label>
        </div>{submitError && <div className="alert alert-error" role="alert">{submitError}</div>}{success && <div className="alert alert-success" role="status">{success}</div>}<div className="form-footer"><p><b>*</b> {t('form.required.fields')}</p><button className="submit-button" type="submit" disabled={loading || submitting || Boolean(error)}>{submitting ? t('form.saving') : t('form.save')} <span>→</span></button></div></form>
      </div>
      <aside className="summary-panel"><p className="eyebrow">{t('summary.at.glance')}</p><div className="lot-count"><strong>{lots.length}</strong><span> {lots.length === 1 ? t('summary.active.lot') : t('summary.active.lots')}<br />{t('summary.this.session')}</span></div><div className="rule" /><p className="summary-note"><span className="status-dot" /> {t('summary.ready')}</p><p className="fine-print">{t('summary.fine.print')}</p><div className="field-lines" aria-hidden="true"><i /><i /><i /></div></aside>
    </section>
    <section className="lots-section"><div className="section-heading lots-heading"><div><p className="eyebrow">{t('lots.harvest.log')}</p><h2>{t('lots.my')}</h2></div>{lots.length > 0 && <span className="lot-badge">{lots.length} {t('lots.saved')}</span>}</div>{lots.length === 0 ? <div className="empty-state"><span className="empty-icon">＋</span><div><h3>{t('lots.empty.title')}</h3><p>{t('lots.empty.copy')}</p></div></div> : <div className="lots-table" role="table" aria-label={t('lots.table.aria')}><div className="table-row table-head"><span>{t('table.lot.number')}</span><span>{t('table.crop')}</span><span>{t('table.quantity')}</span><span>{t('table.harvested')}</span><span>{t('table.location')}</span><span>{t('table.expected.price')}</span><span /></div>{lots.map((lot) => { const recommendation = recommendations[lot.id]; const recommendedMarket = recommendation?.data?.recommended_market; return <div className="lot-entry" key={lot.id}><div className="table-row"><strong>{lot.lot_number} <span className={`lot-status-badge status-${lot.lot_status}`}>{lotStatusLabel(lot.lot_status)}</span></strong><span>{cropName(lot.crop_id)}</span><span>{lot.quantity} {lot.unit}</span><span>{lot.harvest_date}</span><span>{locationName(lot.location_id)}</span><span>{lot.price_expectation ? `₹${lot.price_expectation}` : t('table.not.set')}</span><button className="compare-button" type="button" onClick={() => compareMarkets(lot)}>{t('action.compare')} <span aria-hidden="true">→</span></button><button className="history-button" type="button" onClick={() => viewPriceHistory(lot)}>{t('action.price.history')} <span aria-hidden="true">↗</span></button>{lot.lot_status !== 'sold' && lot.lot_status !== 'cancelled' && lot.lot_status !== 'offered' && lot.lot_status !== 'accepted' && <button className="find-buyers-button" type="button" onClick={() => sellLotAndFindBuyers(lot)}>{t('action.sell')} <span aria-hidden="true">→</span></button>}</div><section className={`recommendation-panel ${recommendation?.status === 'success' && recommendedMarket ? 'has-recommendation' : ''}`} aria-label={`${t('rec.for')} ${lot.lot_number}`}>{(!recommendation || recommendation.status === 'loading') && <div className="recommendation-state"><span className="loading-mark" /> {t('rec.loading')}</div>}{recommendation?.status === 'error' && <div className="recommendation-state recommendation-error"><strong>{t('rec.error')}</strong><span>{recommendation.error}</span><button className="retry-button" type="button" onClick={() => loadRecommendation(lot.id)}>{t('action.try.again')}</button></div>}{recommendation?.status === 'success' && !recommendedMarket && <div className="recommendation-state"><strong>{t('rec.none')}</strong><span>{recommendation.data.reasons?.[0] || t('rec.no.data')}</span></div>}{recommendation?.status === 'success' && recommendedMarket && <><div className="recommendation-heading"><div><p className="eyebrow">{t('rec.recommended')}</p><h3>{recommendedMarket.market_name}</h3></div><span className="recommendation-badge">{t('rec.best.fit')}</span></div><div className="recommendation-metrics"><div><span>{t('rec.price.per.unit')}</span><strong>{formatRupees(recommendedMarket.price)} <small>/ {recommendedMarket.price_unit}</small></strong></div><div><span>{t('rec.net.realization')}</span><strong>{formatRupees(recommendedMarket.net_realization)}</strong></div><div><span>{t('rec.price.trend')}</span><strong className={`trend-${recommendedMarket.trend_direction.toLowerCase()}`}>{recommendedMarket.trend_direction.replaceAll('_', ' ')}{recommendedMarket.percentage_change !== null && recommendedMarket.percentage_change !== undefined && <small> {Number(recommendedMarket.percentage_change) > 0 ? '+' : ''}{recommendedMarket.percentage_change}%</small>}</strong></div></div><div className="recommendation-footer"><div><span className="recommendation-label">{t('rec.why.market')}</span><ul>{recommendation.data.reasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>{recommendation.data.next_best_market && <div className="next-best"><span className="recommendation-label">{t('rec.next.best')}</span><strong>{recommendation.data.next_best_market.market_name}</strong>{recommendation.data.advantage_over_next_best !== null && recommendation.data.advantage_over_next_best !== undefined && <span>{formatRupees(recommendation.data.advantage_over_next_best)} {t('rec.advantage')}</span>}</div>}</div></>}</section><section className="buyer-panel" aria-label={`${t('buyer.aria')} ${lot.lot_number}`}>{(buyerMatches[lot.id]?.status === 'selling' || buyerMatches[lot.id]?.status === 'loading') && <div className="buyer-state"><span className="loading-mark" /> {buyerMatches[lot.id]?.status === 'selling' ? t('sell.selling') : t('buyer.searching')}</div>}{buyerMatches[lot.id]?.status === 'error' && <div className="buyer-state buyer-error"><strong>{t('buyer.load.error')}</strong><span>{buyerMatches[lot.id].error}</span><button className="retry-button" type="button" onClick={() => loadBuyerMatches(lot.id)}>{t('action.try.again')}</button></div>}{buyerMatches[lot.id]?.status === 'success' && buyerMatches[lot.id].data.matches.length === 0 && <div className="buyer-state">{t('buyer.none')}</div>}{buyerMatches[lot.id]?.status === 'success' && buyerMatches[lot.id].data.matches.length > 0 && <><div className="buyer-heading"><div><p className="eyebrow">{t('buyer.matches')} <span>/</span> {lot.lot_number}</p><h3>{t('buyer.matching.buyers')}</h3></div><span className="match-count-badge">{buyerMatches[lot.id].data.matches.length} {t('buyer.found')}</span></div><div className="buyer-match-list">{buyerMatches[lot.id].data.matches.map((match) => <article className={`buyer-match-card ${match.verification_status === 'verified' ? 'is-verified' : ''}`} key={match.buyer_demand_id}><div className="buyer-match-top"><div><h4>{match.company_name}</h4><span className="buyer-type-badge">{match.buyer_type}</span>{match.verification_status === 'verified' && <span className="verified-badge">✓ {t('buyer.verified')}</span>}</div><div className="match-score"><strong>{match.match_percentage}%</strong><span>{t('buyer.match')}</span></div></div><div className="buyer-match-details"><div><span className="detail-label">{t('buyer.location')}</span><span>{buyerLocationLabel(match.location)}</span></div><div><span className="detail-label">{t('buyer.demand')}</span><span>{match.demanded_quantity} {match.demand_unit}</span></div><div><span className="detail-label">{t('buyer.preferred.price')}</span><span>{match.preferred_price ? formatRupees(match.preferred_price) : t('buyer.not.specified')}</span></div></div><p className="match-explanation">{match.match_explanation}</p><div className="buyer-match-actions">{buyerOfferViews[lot.id]?.buyerProfileId !== match.buyer_profile_id && <button className="view-offer-button" type="button" onClick={() => viewBuyerOffer(lot.id, match)}>{t('offer.view')} <span aria-hidden="true">→</span></button>}</div>{buyerOfferViews[lot.id]?.buyerProfileId === match.buyer_profile_id && <div className="offer-section">{buyerOfferViews[lot.id].status === 'loading' && <div className="buyer-state"><span className="loading-mark" /> {t('offer.loading')}</div>}{buyerOfferViews[lot.id].status === 'error' && <div className="buyer-state buyer-error"><strong>{t('offer.load.error')}</strong><span>{buyerOfferViews[lot.id].error}</span></div>}{buyerOfferViews[lot.id].status === 'needs-offer' && <div><p className="buyer-state">{t('offer.none.pending')}</p><button className="generate-offer-button" type="button" onClick={() => generateBuyerOffer(lot.id, match.buyer_profile_id)}>{t('offer.generate')} <span aria-hidden="true">→</span></button></div>}{buyerOfferViews[lot.id].status === 'generating' && <div className="buyer-state"><span className="loading-mark" /> {t('offer.generating')}</div>}{buyerOfferViews[lot.id].status === 'ready' && buyerOfferViews[lot.id].offer && <div className="offer-card"><div className="offer-card-header"><p className="eyebrow">{t('offer.from')} {match.company_name}</p><span className={`offer-status-badge offer-status-${buyerOfferViews[lot.id].offer.offer_status}`}>{buyerOfferViews[lot.id].offer.offer_status}</span></div><div className="offer-details"><div><span className="detail-label">{t('offer.price')}</span><strong>{formatRupees(buyerOfferViews[lot.id].offer.offered_price)} <small>/ {buyerOfferViews[lot.id].offer.unit}</small></strong></div><div><span className="detail-label">{t('offer.quantity')}</span><strong>{buyerOfferViews[lot.id].offer.quantity} {buyerOfferViews[lot.id].offer.unit}</strong></div>{buyerOfferViews[lot.id].offer.valid_until && <div><span className="detail-label">{t('offer.valid.until')}</span><strong>{new Date(buyerOfferViews[lot.id].offer.valid_until).toLocaleDateString('en-IN')}</strong></div>}</div>{buyerOfferViews[lot.id].offer.offer_message && <p className="offer-message">{buyerOfferViews[lot.id].offer.offer_message}</p>}{buyerOfferViews[lot.id].offer.offer_status === 'pending' && buyerOfferViews[lot.id].status !== 'accepting' && <button className="accept-offer-button" type="button" onClick={() => acceptBuyerOffer(lot.id, buyerOfferViews[lot.id].offer.id)}>{t('offer.accept')} <span aria-hidden="true">✓</span></button>}{buyerOfferViews[lot.id].status === 'accepting' && <div className="buyer-state"><span className="loading-mark" /> {t('offer.accepting')}</div>}{buyerOfferViews[lot.id].status === 'accept-error' && <div className="buyer-state buyer-error"><strong>{t('offer.accept.error')}</strong><span>{buyerOfferViews[lot.id].error}</span></div>}</div>}{buyerAcceptances[lot.id]?.status === 'success' && <div className="order-success-card"><div className="order-success-header"><span className="order-success-icon">✓</span><div><strong>{t('order.accepted')}</strong><p>{t('order.created')}</p></div></div><div className="order-details"><div><span className="detail-label">{t('order.buyer')}</span><span>{buyerAcceptances[lot.id].data.order.buyer_company_name}</span></div><div><span className="detail-label">{t('order.agreed.price')}</span><strong>{formatRupees(buyerAcceptances[lot.id].data.order.agreed_price)}</strong></div><div><span className="detail-label">{t('order.quantity')}</span><strong>{buyerAcceptances[lot.id].data.order.agreed_quantity} {buyerAcceptances[lot.id].data.order.unit}</strong></div><div><span className="detail-label">{t('order.status')}</span><span className="order-status">{buyerAcceptances[lot.id].data.order.order_status}</span></div></div></div>}</div>}</article>)}</div></>}</section></div> })}</div>}</section>
    {comparisonLot && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComparison() }}><section className="comparison-modal" role="dialog" aria-modal="true" aria-labelledby="comparison-title"><button className="close-button" type="button" onClick={closeComparison} aria-label={t('modal.close.compare')}>×</button><p className="eyebrow">{t('compare.intelligence')} <span>/</span> {comparisonLot.lot_number}</p><h2 id="comparison-title">{t('compare.where')}</h2><p className="comparison-intro">{cropName(comparisonLot.crop_id)} · {comparisonLot.quantity} {comparisonLot.unit}</p>{comparisonLoading && <div className="comparison-state"><span className="loading-mark" /> {t('compare.loading')}</div>}{comparisonError && <div className="comparison-state comparison-error"><strong>{t('compare.error')}</strong><span>{comparisonError}</span><button className="retry-button" type="button" onClick={() => compareMarkets(comparisonLot)}>{t('action.try.again')}</button></div>}{comparison && comparison.results?.length === 0 && <div className="comparison-state">{t('compare.none')}</div>}{comparison && comparison.results?.length > 0 && <><div className="winner-summary"><div><p className="summary-label">{t('compare.highest.net')}</p><strong>{comparison.highest_estimated_net_realization.market_name}</strong><span>{t('compare.demo.note')}</span></div><b>{formatRupees(comparison.highest_estimated_net_realization.net_realization)}</b></div><div className="comparison-list">{comparison.results.map((result) => { const winner = result.market_id === comparison.highest_estimated_net_realization.market_id; return <article className={`comparison-card ${winner ? 'is-winner' : ''}`} key={result.market_id}><div className="comparison-card-top"><div><h3>{result.market_name}</h3>{winner && <span className="winner-label">⭐ {t('compare.winner.label')}</span>}</div><strong>{formatRupees(result.net_realization)}</strong></div><div className="comparison-metrics"><span><small>{t('compare.price')}</small>{formatRupees(result.price)} / {result.price_unit}</span><span><small>{t('compare.gross')}</small>{formatRupees(result.gross_value)}</span><span><small>{t('compare.transport')}</small>{formatRupees(result.estimated_transport_cost)}</span></div></article>})}</div></>}</section></div>}
    <footer className="footer"><span>Kheti Setu</span><span>{t('footer.connected')} {API_BASE_URL || t('footer.proxy')}</span></footer>
    {priceHistoryLot && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePriceHistory() }}><section className="comparison-modal price-history-modal" role="dialog" aria-modal="true" aria-labelledby="price-history-title"><button className="close-button" type="button" onClick={closePriceHistory} aria-label={t('modal.close.price')}>×</button><p className="eyebrow">{t('price.intelligence')} <span>/</span> {priceHistoryLot.lot_number}</p><h2 id="price-history-title">{t('price.recent')}</h2><p className="comparison-intro">{cropName(priceHistoryLot.crop_id)} · {priceHistoryLot.quantity} {priceHistoryLot.unit}</p>{priceTrendsLoading && <div className="comparison-state"><span className="loading-mark" /> {t('price.loading')}</div>}{priceTrendsError && <div className="comparison-state comparison-error"><strong>{t('price.error')}</strong><span>{priceTrendsError}</span><button className="retry-button" type="button" onClick={() => viewPriceHistory(priceHistoryLot)}>{t('action.try.again')}</button></div>}{priceTrends && priceTrends.length === 0 && <div className="comparison-state">{t('price.none')}</div>}{priceTrends && priceTrends.length > 0 && <div className="price-trend-list">{priceTrends.map((trend) => { const hasHistory = trend.oldest_date && trend.latest_date; return <article className="price-trend-card" key={trend.market_id}><div className="price-trend-heading"><div><span className="recommendation-label">{t('price.market')}</span><h3>{trend.market_name}</h3></div><span className={`trend-badge trend-${trend.trend_direction.toLowerCase()}`}>{trend.trend_direction.replaceAll('_', ' ')}</span></div>{hasHistory ? <div className="price-observations"><div><span>{t('price.oldest')} · {trend.oldest_date}</span><strong>{formatRupees(trend.oldest_price)}</strong><small>{t('price.unit.not.provided')}</small></div><div><span>{t('price.latest')} · {trend.latest_date}</span><strong>{formatRupees(trend.latest_price)}</strong><small>{t('price.unit.not.provided')}</small></div></div> : <p className="insufficient-data">{t('price.insufficient')}</p>}<div className="price-trend-summary"><div><span>{t('price.absolute.change')}</span><strong>{trend.absolute_change === null ? t('price.not.available') : formatRupees(trend.absolute_change)}</strong></div><div><span>{t('price.percentage.change')}</span><strong>{trend.percentage_change === null ? t('price.not.available') : `${trend.percentage_change}%`}</strong></div></div></article> })}</div>}</section></div>}
  </main>
}

export default App
