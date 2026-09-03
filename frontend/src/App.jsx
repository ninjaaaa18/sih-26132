import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL, DEMO_FARMER_ID, apiFetch } from './api'
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

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
    setSubmitError('')
    setSuccess('')
  }

  function startVoiceCapture() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceError('Voice input is not supported in this browser. Please use the manual form.')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-IN'
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
      setVoiceError(event.error === 'not-allowed' ? 'Microphone permission was denied. Please use the manual form.' : `Voice input failed (${event.error}). Please try again or use the manual form.`)
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
      setSuccess('Your produce lot was saved successfully.')
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
      setLots((current) => current.map((item) => (item.id === lotId ? { ...item, lot_status: 'accepted' } : item)))
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

  const cropName = (id) => crops.find((crop) => crop.id === id)?.name || 'Unknown crop'
  const locationName = (id) => { const location = locations.find((item) => item.id === id); return location ? locationLabel(location) : 'Unknown location' }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Kheti Setu home"><span className="brand-mark">KS</span><span>Kheti Setu</span></a><span className="demo-label">Demo farmer</span></header>
    <section className="welcome-row"><div><p className="eyebrow">Farmer workspace <span>/</span> {farmer?.full_name || 'Loading profile'}</p><h1>Good morning, {farmer?.full_name?.split(' ')[0] || 'farmer'}.</h1><p className="welcome-copy">Keep your harvest details close. Add a lot when produce is ready to move.</p></div><a className="primary-button" href="#add-lot">Add produce lot <span>+</span></a></section>
    {error && <div className="alert alert-error" role="alert"><strong>Could not load your farm data.</strong> {error}</div>}
    <section className="workspace-grid">
      <div className="form-panel" id="add-lot"><div className="section-heading"><div><p className="eyebrow">New entry</p><h2>Add produce lot</h2></div><div className="voice-actions"><button className="voice-button" type="button" onClick={voiceListening ? stopVoiceCapture : startVoiceCapture} disabled={loading || submitting}>{voiceListening ? 'Stop listening' : 'Create Lot by Voice'} <span aria-hidden="true">{voiceListening ? '■' : '◉'}</span></button><span className="step-count">01 <span>/ 01</span></span></div></div>{voiceListening && <div className="voice-status" role="status"><span className="recording-dot" /> Listening... Say “500 kg tomato harvested today from Lasalgaon.”</div>}{voiceError && <div className="alert alert-error" role="alert">{voiceError}</div>}{voiceTranscript && <div className="voice-transcript"><span>Transcript</span><strong>“{voiceTranscript}”</strong></div>}{voiceDetails && <div className="voice-confirmation"><p className="eyebrow">Voice input detected</p>{voiceDetails.issues.length > 0 ? <><strong>Some details need attention.</strong><p>Missing or ambiguous: {voiceDetails.issues.join(', ')}.</p><button className="edit-voice-button" type="button" onClick={editVoiceDetails}>Edit Details in form</button></> : <><p className="voice-summary">Crop: <strong>{cropName(voiceDetails.values.crop_id)}</strong><br />Quantity: <strong>{voiceDetails.values.quantity} {voiceDetails.values.unit}</strong><br />Harvest date: <strong>{voiceDetails.values.harvest_date}</strong><br />Location: <strong>{locationName(voiceDetails.values.location_id)}</strong></p><div className="voice-confirm-actions"><button className="submit-button" type="button" onClick={confirmVoiceLot} disabled={submitting}>Confirm &amp; Create Lot <span>→</span></button><button className="edit-voice-button" type="button" onClick={editVoiceDetails}>Edit Details</button></div></>}</div>
        }
        <form onSubmit={handleSubmit}><div className="form-grid">
          <label><span>Crop <b>*</b></span><select name="crop_id" value={form.crop_id} onChange={updateField} required disabled={loading || submitting}><option value="">Choose crop</option>{crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></label>
          <label><span>Quantity <b>*</b></span><input name="quantity" type="number" min="0.01" step="0.01" value={form.quantity} onChange={updateField} placeholder="e.g. 250" required disabled={submitting} /></label>
          <label><span>Unit <b>*</b></span><select name="unit" value={form.unit} onChange={updateField} required disabled={submitting}><option value="kg">Kilograms (kg)</option><option value="quintal">Quintal</option><option value="tonne">Tonne</option></select></label>
          <label><span>Harvest date <b>*</b></span><input name="harvest_date" type="date" value={form.harvest_date} onChange={updateField} required disabled={submitting} /></label>
          <label className="wide-field"><span>Pickup location <b>*</b></span><select name="location_id" value={form.location_id} onChange={updateField} required disabled={loading || submitting}><option value="">Choose location</option>{locations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label>
          <label><span>Expected price <small>per unit</small></span><div className="input-prefix"><span>₹</span><input name="price_expectation" type="number" min="0.01" step="0.01" value={form.price_expectation} onChange={updateField} placeholder="Optional" disabled={submitting} /></div></label>
        </div>{submitError && <div className="alert alert-error" role="alert">{submitError}</div>}{success && <div className="alert alert-success" role="status">{success}</div>}<div className="form-footer"><p><b>*</b> Required fields</p><button className="submit-button" type="submit" disabled={loading || submitting || Boolean(error)}>{submitting ? 'Saving lot...' : 'Save produce lot'} <span>→</span></button></div></form>
      </div>
      <aside className="summary-panel"><p className="eyebrow">At a glance</p><div className="lot-count"><strong>{lots.length}</strong><span>active {lots.length === 1 ? 'lot' : 'lots'}<br />this session</span></div><div className="rule" /><p className="summary-note"><span className="status-dot" /> Ready to record your harvest</p><p className="fine-print">Lots created here are saved to PostgreSQL. Your session list will reset when this page is refreshed until a history endpoint is added.</p><div className="field-lines" aria-hidden="true"><i /><i /><i /></div></aside>
    </section>
    <section className="lots-section"><div className="section-heading lots-heading"><div><p className="eyebrow">Your harvest log</p><h2>My produce lots</h2></div>{lots.length > 0 && <span className="lot-badge">{lots.length} saved</span>}</div>{lots.length === 0 ? <div className="empty-state"><span className="empty-icon">＋</span><div><h3>No lots in this session yet</h3><p>Create your first produce lot above. It will appear here after it is saved.</p></div></div> : <div className="lots-table" role="table" aria-label="My produce lots"><div className="table-row table-head"><span>Lot number</span><span>Crop</span><span>Quantity</span><span>Harvested</span><span>Location</span><span>Expected price</span><span /></div>{lots.map((lot) => { const recommendation = recommendations[lot.id]; const recommendedMarket = recommendation?.data?.recommended_market; return <div className="lot-entry" key={lot.id}><div className="table-row"><strong>{lot.lot_number}</strong><span>{cropName(lot.crop_id)}</span><span>{lot.quantity} {lot.unit}</span><span>{lot.harvest_date}</span><span>{locationName(lot.location_id)}</span><span>{lot.price_expectation ? `₹${lot.price_expectation}` : 'Not set'}</span><button className="compare-button" type="button" onClick={() => compareMarkets(lot)}>Compare Markets <span aria-hidden="true">→</span></button><button className="history-button" type="button" onClick={() => viewPriceHistory(lot)}>Price history <span aria-hidden="true">↗</span></button></div><section className={`recommendation-panel ${recommendation?.status === 'success' && recommendedMarket ? 'has-recommendation' : ''}`} aria-label={`Recommendation for ${lot.lot_number}`}>{(!recommendation || recommendation.status === 'loading') && <div className="recommendation-state"><span className="loading-mark" /> Finding the best market for this lot...</div>}{recommendation?.status === 'error' && <div className="recommendation-state recommendation-error"><strong>Could not load a recommendation.</strong><span>{recommendation.error}</span><button className="retry-button" type="button" onClick={() => loadRecommendation(lot.id)}>Try again</button></div>}{recommendation?.status === 'success' && !recommendedMarket && <div className="recommendation-state"><strong>No recommendation yet.</strong><span>{recommendation.data.reasons?.[0] || 'No comparable market data is available for this lot.'}</span></div>}{recommendation?.status === 'success' && recommendedMarket && <><div className="recommendation-heading"><div><p className="eyebrow">Recommended market</p><h3>{recommendedMarket.market_name}</h3></div><span className="recommendation-badge">Best fit</span></div><div className="recommendation-metrics"><div><span>Price per unit</span><strong>{formatRupees(recommendedMarket.price)} <small>/ {recommendedMarket.price_unit}</small></strong></div><div><span>Estimated net realization</span><strong>{formatRupees(recommendedMarket.net_realization)}</strong></div><div><span>Price trend</span><strong className={`trend-${recommendedMarket.trend_direction.toLowerCase()}`}>{recommendedMarket.trend_direction.replaceAll('_', ' ')}{recommendedMarket.percentage_change !== null && recommendedMarket.percentage_change !== undefined && <small> {Number(recommendedMarket.percentage_change) > 0 ? '+' : ''}{recommendedMarket.percentage_change}%</small>}</strong></div></div><div className="recommendation-footer"><div><span className="recommendation-label">Why this market</span><ul>{recommendation.data.reasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>{recommendation.data.next_best_market && <div className="next-best"><span className="recommendation-label">Next best</span><strong>{recommendation.data.next_best_market.market_name}</strong>{recommendation.data.advantage_over_next_best !== null && recommendation.data.advantage_over_next_best !== undefined && <span>{formatRupees(recommendation.data.advantage_over_next_best)} advantage</span>}</div>}</div></>}</section><section className="buyer-panel" aria-label={`Buyer matches for ${lot.lot_number}`}>{!buyerMatches[lot.id] && <button className="find-buyers-button" type="button" onClick={() => loadBuyerMatches(lot.id)}>Find Buyers <span aria-hidden="true">→</span></button>}{buyerMatches[lot.id]?.status === 'loading' && <div className="buyer-state"><span className="loading-mark" /> Searching for matching buyers...</div>}{buyerMatches[lot.id]?.status === 'error' && <div className="buyer-state buyer-error"><strong>Could not load buyer matches.</strong><span>{buyerMatches[lot.id].error}</span><button className="retry-button" type="button" onClick={() => loadBuyerMatches(lot.id)}>Try again</button></div>}{buyerMatches[lot.id]?.status === 'success' && buyerMatches[lot.id].data.matches.length === 0 && <div className="buyer-state">No matching buyers found for this lot right now.</div>}{buyerMatches[lot.id]?.status === 'success' && buyerMatches[lot.id].data.matches.length > 0 && <><div className="buyer-heading"><div><p className="eyebrow">Buyer matches <span>/</span> {lot.lot_number}</p><h3>Matching buyers</h3></div><span className="match-count-badge">{buyerMatches[lot.id].data.matches.length} found</span></div><div className="buyer-match-list">{buyerMatches[lot.id].data.matches.map((match) => <article className={`buyer-match-card ${match.verification_status === 'verified' ? 'is-verified' : ''}`} key={match.buyer_demand_id}><div className="buyer-match-top"><div><h4>{match.company_name}</h4><span className="buyer-type-badge">{match.buyer_type}</span>{match.verification_status === 'verified' && <span className="verified-badge">✓ Verified</span>}</div><div className="match-score"><strong>{match.match_percentage}%</strong><span>match</span></div></div><div className="buyer-match-details"><div><span className="detail-label">Location</span><span>{buyerLocationLabel(match.location)}</span></div><div><span className="detail-label">Demand</span><span>{match.demanded_quantity} {match.demand_unit}</span></div><div><span className="detail-label">Preferred price</span><span>{match.preferred_price ? formatRupees(match.preferred_price) : 'Not specified'}</span></div></div><p className="match-explanation">{match.match_explanation}</p><div className="buyer-match-actions">{buyerOfferViews[lot.id]?.buyerProfileId !== match.buyer_profile_id && <button className="view-offer-button" type="button" onClick={() => viewBuyerOffer(lot.id, match)}>View Offer <span aria-hidden="true">→</span></button>}</div>{buyerOfferViews[lot.id]?.buyerProfileId === match.buyer_profile_id && <div className="offer-section">{buyerOfferViews[lot.id].status === 'loading' && <div className="buyer-state"><span className="loading-mark" /> Loading offer...</div>}{buyerOfferViews[lot.id].status === 'error' && <div className="buyer-state buyer-error"><strong>Could not load offer.</strong><span>{buyerOfferViews[lot.id].error}</span></div>}{buyerOfferViews[lot.id].status === 'needs-offer' && <div><p className="buyer-state">No pending offer exists for this buyer.</p><button className="generate-offer-button" type="button" onClick={() => generateBuyerOffer(lot.id, match.buyer_profile_id)}>Generate Offer <span aria-hidden="true">→</span></button></div>}{buyerOfferViews[lot.id].status === 'generating' && <div className="buyer-state"><span className="loading-mark" /> Generating offer...</div>}{buyerOfferViews[lot.id].status === 'ready' && buyerOfferViews[lot.id].offer && <div className="offer-card"><div className="offer-card-header"><p className="eyebrow">Offer from {match.company_name}</p><span className={`offer-status-badge offer-status-${buyerOfferViews[lot.id].offer.offer_status}`}>{buyerOfferViews[lot.id].offer.offer_status}</span></div><div className="offer-details"><div><span className="detail-label">Price</span><strong>{formatRupees(buyerOfferViews[lot.id].offer.offered_price)} <small>/ {buyerOfferViews[lot.id].offer.unit}</small></strong></div><div><span className="detail-label">Quantity</span><strong>{buyerOfferViews[lot.id].offer.quantity} {buyerOfferViews[lot.id].offer.unit}</strong></div>{buyerOfferViews[lot.id].offer.valid_until && <div><span className="detail-label">Valid until</span><strong>{new Date(buyerOfferViews[lot.id].offer.valid_until).toLocaleDateString('en-IN')}</strong></div>}</div>{buyerOfferViews[lot.id].offer.offer_message && <p className="offer-message">{buyerOfferViews[lot.id].offer.offer_message}</p>}{buyerOfferViews[lot.id].offer.offer_status === 'pending' && buyerOfferViews[lot.id].status !== 'accepting' && <button className="accept-offer-button" type="button" onClick={() => acceptBuyerOffer(lot.id, buyerOfferViews[lot.id].offer.id)}>Accept Offer <span aria-hidden="true">✓</span></button>}{buyerOfferViews[lot.id].status === 'accepting' && <div className="buyer-state"><span className="loading-mark" /> Accepting offer...</div>}{buyerOfferViews[lot.id].status === 'accept-error' && <div className="buyer-state buyer-error"><strong>Could not accept offer.</strong><span>{buyerOfferViews[lot.id].error}</span></div>}</div>}{buyerAcceptances[lot.id]?.status === 'success' && <div className="order-success-card"><div className="order-success-header"><span className="order-success-icon">✓</span><div><strong>Offer Accepted</strong><p>Order Created</p></div></div><div className="order-details"><div><span className="detail-label">Buyer</span><span>{buyerAcceptances[lot.id].data.order.buyer_company_name}</span></div><div><span className="detail-label">Agreed price</span><strong>{formatRupees(buyerAcceptances[lot.id].data.order.agreed_price)}</strong></div><div><span className="detail-label">Quantity</span><strong>{buyerAcceptances[lot.id].data.order.agreed_quantity} {buyerAcceptances[lot.id].data.order.unit}</strong></div><div><span className="detail-label">Order status</span><span className="order-status">{buyerAcceptances[lot.id].data.order.order_status}</span></div></div></div>}</div>}</article>)}</div></>}</section></div> })}</div>}</section>
    {comparisonLot && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComparison() }}><section className="comparison-modal" role="dialog" aria-modal="true" aria-labelledby="comparison-title"><button className="close-button" type="button" onClick={closeComparison} aria-label="Close market comparison">×</button><p className="eyebrow">Market intelligence <span>/</span> {comparisonLot.lot_number}</p><h2 id="comparison-title">Where should you sell?</h2><p className="comparison-intro">{cropName(comparisonLot.crop_id)} · {comparisonLot.quantity} {comparisonLot.unit}</p>{comparisonLoading && <div className="comparison-state"><span className="loading-mark" /> Comparing available markets...</div>}{comparisonError && <div className="comparison-state comparison-error"><strong>Could not compare markets.</strong><span>{comparisonError}</span><button className="retry-button" type="button" onClick={() => compareMarkets(comparisonLot)}>Try again</button></div>}{comparison && comparison.results?.length === 0 && <div className="comparison-state">No market prices are available for this crop yet.</div>}{comparison && comparison.results?.length > 0 && <><div className="winner-summary"><div><p className="summary-label">Highest estimated net realization</p><strong>{comparison.highest_estimated_net_realization.market_name}</strong><span>Based on current demo market prices and estimated transport cost.</span></div><b>{formatRupees(comparison.highest_estimated_net_realization.net_realization)}</b></div><div className="comparison-list">{comparison.results.map((result) => { const winner = result.market_id === comparison.highest_estimated_net_realization.market_id; return <article className={`comparison-card ${winner ? 'is-winner' : ''}`} key={result.market_id}><div className="comparison-card-top"><div><h3>{result.market_name}</h3>{winner && <span className="winner-label">⭐ Highest estimated net realization</span>}</div><strong>{formatRupees(result.net_realization)}</strong></div><div className="comparison-metrics"><span><small>Price</small>{formatRupees(result.price)} / {result.price_unit}</span><span><small>Gross value</small>{formatRupees(result.gross_value)}</span><span><small>Estimated transport</small>{formatRupees(result.estimated_transport_cost)}</span></div></article>})}</div></>}</section></div>}
    <footer className="footer"><span>Kheti Setu</span><span>Connected to {API_BASE_URL || 'local backend proxy'}</span></footer>
    {priceHistoryLot && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePriceHistory() }}><section className="comparison-modal price-history-modal" role="dialog" aria-modal="true" aria-labelledby="price-history-title"><button className="close-button" type="button" onClick={closePriceHistory} aria-label="Close price history">×</button><p className="eyebrow">Price intelligence <span>/</span> {priceHistoryLot.lot_number}</p><h2 id="price-history-title">Recent price history</h2><p className="comparison-intro">{cropName(priceHistoryLot.crop_id)} · {priceHistoryLot.quantity} {priceHistoryLot.unit}</p>{priceTrendsLoading && <div className="comparison-state"><span className="loading-mark" /> Loading recent price history...</div>}{priceTrendsError && <div className="comparison-state comparison-error"><strong>Could not load price history.</strong><span>{priceTrendsError}</span><button className="retry-button" type="button" onClick={() => viewPriceHistory(priceHistoryLot)}>Try again</button></div>}{priceTrends && priceTrends.length === 0 && <div className="comparison-state">No price history is available for this crop yet.</div>}{priceTrends && priceTrends.length > 0 && <div className="price-trend-list">{priceTrends.map((trend) => { const hasHistory = trend.oldest_date && trend.latest_date; return <article className="price-trend-card" key={trend.market_id}><div className="price-trend-heading"><div><span className="recommendation-label">Market</span><h3>{trend.market_name}</h3></div><span className={`trend-badge trend-${trend.trend_direction.toLowerCase()}`}>{trend.trend_direction.replaceAll('_', ' ')}</span></div>{hasHistory ? <div className="price-observations"><div><span>Oldest observation · {trend.oldest_date}</span><strong>{formatRupees(trend.oldest_price)}</strong><small>Price unit not provided by API</small></div><div><span>Latest observation · {trend.latest_date}</span><strong>{formatRupees(trend.latest_price)}</strong><small>Price unit not provided by API</small></div></div> : <p className="insufficient-data">Insufficient data for historical comparison.</p>}<div className="price-trend-summary"><div><span>Absolute change</span><strong>{trend.absolute_change === null ? 'Not available' : formatRupees(trend.absolute_change)}</strong></div><div><span>Percentage change</span><strong>{trend.percentage_change === null ? 'Not available' : `${trend.percentage_change}%`}</strong></div></div></article> })}</div>}</section></div>}
  </main>
}

export default App
