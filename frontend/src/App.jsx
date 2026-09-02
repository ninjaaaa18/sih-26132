import { useEffect, useState } from 'react'
import { API_BASE_URL, DEMO_FARMER_ID, apiFetch } from './api'
import './App.css'

const emptyForm = { crop_id: '', quantity: '', unit: 'kg', harvest_date: '', location_id: '', price_expectation: '' }

function locationLabel(location) {
  return [location.village, location.tehsil, location.district, location.state].filter(Boolean).join(', ')
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
      setForm((current) => ({ ...emptyForm, location_id: current.location_id }))
      setSuccess('Your produce lot was saved successfully.')
    } catch (requestError) {
      setSubmitError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const cropName = (id) => crops.find((crop) => crop.id === id)?.name || 'Unknown crop'
  const locationName = (id) => { const location = locations.find((item) => item.id === id); return location ? locationLabel(location) : 'Unknown location' }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Kheti Setu home"><span className="brand-mark">KS</span><span>Kheti Setu</span></a><span className="demo-label">Demo farmer</span></header>
    <section className="welcome-row"><div><p className="eyebrow">Farmer workspace <span>/</span> {farmer?.full_name || 'Loading profile'}</p><h1>Good morning, {farmer?.full_name?.split(' ')[0] || 'farmer'}.</h1><p className="welcome-copy">Keep your harvest details close. Add a lot when produce is ready to move.</p></div><a className="primary-button" href="#add-lot">Add produce lot <span>+</span></a></section>
    {error && <div className="alert alert-error" role="alert"><strong>Could not load your farm data.</strong> {error}</div>}
    <section className="workspace-grid">
      <div className="form-panel" id="add-lot"><div className="section-heading"><div><p className="eyebrow">New entry</p><h2>Add produce lot</h2></div><span className="step-count">01 <span>/ 01</span></span></div>
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
    <section className="lots-section"><div className="section-heading lots-heading"><div><p className="eyebrow">Your harvest log</p><h2>My produce lots</h2></div>{lots.length > 0 && <span className="lot-badge">{lots.length} saved</span>}</div>{lots.length === 0 ? <div className="empty-state"><span className="empty-icon">＋</span><div><h3>No lots in this session yet</h3><p>Create your first produce lot above. It will appear here after it is saved.</p></div></div> : <div className="lots-table" role="table" aria-label="My produce lots"><div className="table-row table-head"><span>Lot number</span><span>Crop</span><span>Quantity</span><span>Harvested</span><span>Location</span><span>Expected price</span></div>{lots.map((lot) => <div className="table-row" key={lot.id}><strong>{lot.lot_number}</strong><span>{cropName(lot.crop_id)}</span><span>{lot.quantity} {lot.unit}</span><span>{lot.harvest_date}</span><span>{locationName(lot.location_id)}</span><span>{lot.price_expectation ? `₹${lot.price_expectation}` : 'Not set'}</span></div>)}</div>}</section>
    <footer className="footer"><span>Kheti Setu</span><span>Connected to {API_BASE_URL || 'local backend proxy'}</span></footer>
  </main>
}

export default App
