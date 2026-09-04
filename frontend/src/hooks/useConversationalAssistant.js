import { useCallback, useEffect, useRef, useState } from 'react'
import { DEMO_FARMER_ID, apiFetch } from '../api'
import { matchYesNo, parseVoiceTranscript, speechLocale } from '../voiceParsing'

const FIELD_ORDER = ['crop_id', 'quantity', 'unit', 'location_id', 'harvest_date']
const EMPTY_SLOTS = { crop_id: '', quantity: '', unit: '', harvest_date: '', location_id: '' }

export function useConversationalAssistant({ crops, locations, language, t, onCreateLot, onSeeRecommendation }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [slots, setSlots] = useState({ ...EMPTY_SLOTS })
  const [phase, setPhase] = useState('idle')
  const [listening, setListening] = useState(false)
  const [input, setInput] = useState('')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [createdLotId, setCreatedLotId] = useState(null)
  const recognitionRef = useRef(null)
  const dataRef = useRef({ crops, locations, t, language })
  dataRef.current = { crops, locations, t, language }

  const micSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  function cropEntry(id) { return dataRef.current.crops.find((c) => c.id === id) }
  function locationEntry(id) { return dataRef.current.locations.find((l) => l.id === id) }

  const cropName = useCallback((id) => cropEntry(id)?.name || dataRef.current.t('table.unknown.crop'), [])
  const locationName = useCallback((id) => {
    const entry = locationEntry(id)
    if (!entry) return dataRef.current.t('table.unknown.location')
    return [entry.village, entry.tehsil, entry.district, entry.state].filter(Boolean).join(', ')
  }, [])

  function tr(key) { return dataRef.current.t(key) }

  function missingFields(current) {
    return FIELD_ORDER.filter((field) => !current[field])
  }

  function askFor(field) {
    const key = { crop_id: 'ai.ask.crop', quantity: 'ai.ask.quantity', unit: 'ai.ask.unit', location_id: 'ai.ask.location', harvest_date: 'ai.ask.date' }[field]
    return tr(key)
  }

  function pushMessage(role, text) {
    setMessages((current) => [...current, { role, text }])
  }

  function resetConversation() {
    setSlots({ ...EMPTY_SLOTS })
    setTranscript('')
    setError('')
    setCreatedLotId(null)
  }

  function startAssistant() {
    resetConversation()
    setMessages([])
    setPhase('speaking')
    pushMessage('assistant', tr('ai.greeting'))
  }

  function openAssistant() {
    if (open) return
    setOpen(true)
    startAssistant()
  }

  function closeAssistant() {
    recognitionRef.current?.stop()
    setListening(false)
    setPhase('idle')
    setInput('')
    setOpen(false)
  }

  function processUtterance(rawText) {
    const text = String(rawText || '').trim()
    const currentPhase = phase
    if (!text) {
      setError(tr('ai.empty'))
      pushMessage('assistant', tr('ai.empty'))
      return
    }
    pushMessage('farmer', text)
    setTranscript(text)

    if (currentPhase === 'confirming') {
      handleConfirmation(text)
      return
    }

    const parsed = parseVoiceTranscript(text, dataRef.current.crops, dataRef.current.locations, dataRef.current.language)
    const next = { ...slots }
    for (const field of FIELD_ORDER) {
      if (parsed.values[field]) next[field] = parsed.values[field]
    }
    const missing = missingFields(next)
    if (missing.length === 0) {
      setSlots(next)
      setPhase('confirming')
      pushMessage('assistant', tr('ai.confirm.prompt'))
      return
    }
    setSlots(next)
    pushMessage('assistant', askFor(missing[0]))
  }

  function handleConfirmation(text) {
    const verdict = matchYesNo(text.toLowerCase().trim(), dataRef.current.language)
    if (verdict === 'yes') {
      confirmCreate()
      return
    }
    if (verdict === 'no') {
      setPhase('speaking')
      setMessages([...messages, { role: 'assistant', text: tr('ai.restart') }])
      pushMessage('assistant', askFor('crop_id'))
      return
    }
    pushMessage('assistant', tr('ai.confirm.unclear'))
  }

  async function confirmCreate() {
    if (phase !== 'confirming') return
    const missing = missingFields(slots)
    if (missing.length > 0) {
      setPhase('speaking')
      pushMessage('assistant', askFor(missing[0]))
      return
    }
    setPhase('creating')
    setError('')
    try {
      const created = await apiFetch('/api/v1/produce-lots', {
        method: 'POST',
        body: JSON.stringify({
          farmer_profile_id: DEMO_FARMER_ID,
          crop_id: slots.crop_id,
          lot_number: `LOT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          quantity: Number(slots.quantity),
          unit: slots.unit,
          harvest_date: slots.harvest_date,
          location_id: slots.location_id,
          price_expectation: null,
        }),
      })
      setCreatedLotId(created.id)
      setPhase('success')
      setSlots({ ...EMPTY_SLOTS })
      pushMessage('assistant', tr('ai.success'))
      if (onCreateLot) await onCreateLot(created)
    } catch (requestError) {
      setPhase('error')
      setError(requestError.message)
      pushMessage('assistant', `${tr('ai.error')} ${requestError.message}`)
    }
  }

  function edit() {
    setSlots({ ...EMPTY_SLOTS })
    setCreatedLotId(null)
    setPhase('speaking')
    pushMessage('assistant', tr('ai.restart'))
    pushMessage('assistant', askFor('crop_id'))
  }

  function cancel() {
    recognitionRef.current?.stop()
    setListening(false)
    setPhase('idle')
    setInput('')
    setOpen(false)
  }

  function seeRecommendation() {
    if (onSeeRecommendation && createdLotId) onSeeRecommendation(createdLotId)
  }

  function submitText() {
    const text = input
    setInput('')
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
    }
    processUtterance(text)
  }

  function handleRecognitionError(event) {
    setListening(false)
    const code = event.error
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      setError(tr('ai.permission'))
      pushMessage('assistant', tr('ai.permission'))
    } else if (code === 'language-not-supported') {
      setError(tr('ai.unsupported.lang'))
      pushMessage('assistant', tr('ai.unsupported.lang'))
    } else if (code === 'network') {
      setError(tr('ai.recognition.error'))
      pushMessage('assistant', tr('ai.recognition.error'))
    } else if (code === 'no-speech') {
      setError(tr('ai.empty'))
      pushMessage('assistant', tr('ai.empty'))
    } else if (code === 'aborted') {
      setError('')
    } else {
      setError(tr('ai.recognition.error'))
      pushMessage('assistant', tr('ai.recognition.error'))
    }
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    if (!micSupported) {
      setError(tr('ai.unsupported'))
      pushMessage('assistant', tr('ai.unsupported'))
      return
    }
    const locale = speechLocale(dataRef.current.language)
    if (!locale) {
      setError(tr('ai.unsupported.lang'))
      pushMessage('assistant', tr('ai.unsupported.lang'))
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = locale
    recognition.onstart = () => { setListening(true); setError('') }
    recognition.onresult = (event) => {
      const result = event.results[0][0].transcript.trim()
      setListening(false)
      processUtterance(result)
    }
    recognition.onerror = handleRecognitionError
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
  }

  useEffect(() => {
    return () => { recognitionRef.current?.stop() }
  }, [])

  return {
    open,
    openAssistant,
    closeAssistant,
    messages,
    phase,
    listening,
    micSupported,
    error,
    transcript,
    slots,
    cropName,
    locationName,
    input,
    setInput,
    submitText,
    toggleMic,
    confirmCreate,
    edit,
    cancel,
    seeRecommendation,
    createdLotId,
  }
}
