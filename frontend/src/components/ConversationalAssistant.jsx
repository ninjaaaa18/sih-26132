import { useConversationalAssistant } from '../hooks/useConversationalAssistant'

export default function ConversationalAssistant({ crops, locations, language, t, onCreated, onSeeRecommendation }) {
  const assistant = useConversationalAssistant({ crops, locations, language, t, onCreateLot: onCreated, onSeeRecommendation })

  if (!assistant.open) {
    return (
      <button className="ai-launch" type="button" onClick={assistant.openAssistant} aria-label={t('ai.title')}>
        <span className="ai-launch-icon" aria-hidden="true">✦</span>
        <span>{t('ai.title')}</span>
      </button>
    )
  }

  const inputVisible = assistant.phase === 'speaking' || assistant.phase === 'confirming' || assistant.phase === 'error'

  return (
    <section className="ai-panel" aria-label={t('ai.title')}>
      <header className="ai-header">
        <div>
          <p className="eyebrow">{t('ai.tagline')}</p>
          <h3>{t('ai.title')}</h3>
        </div>
        <button className="close-button" type="button" onClick={assistant.closeAssistant} aria-label={t('ai.close')}>×</button>
      </header>

      <div className="ai-chat" role="log" aria-live="polite">
        {assistant.messages.map((message, index) => (
          <div key={index} className={`ai-bubble ai-bubble-${message.role}`}>{message.text}</div>
        ))}
        {assistant.listening && <div className="ai-listening" role="status"><span className="recording-dot" /> {t('ai.listening')}</div>}
        {assistant.phase === 'creating' && <div className="ai-status" role="status"><span className="loading-mark" /> {t('ai.processing')}</div>}
        {assistant.error && <div className="alert alert-error" role="alert">{assistant.error}</div>}
      </div>

      {assistant.phase === 'confirming' && (
        <div className="ai-confirm">
          <div className="ai-summary">
            <div><span>{t('form.crop')}</span><strong>{assistant.cropName(assistant.slots.crop_id)}</strong></div>
            <div><span>{t('form.quantity')}</span><strong>{assistant.slots.quantity} {assistant.slots.unit}</strong></div>
            <div><span>{t('form.pickup')}</span><strong>{assistant.locationName(assistant.slots.location_id)}</strong></div>
            <div><span>{t('form.harvest.date')}</span><strong>{assistant.slots.harvest_date}</strong></div>
          </div>
          <div className="ai-confirm-actions">
            <button className="submit-button" type="button" onClick={assistant.confirmCreate}>{t('ai.confirm.create')}</button>
            <button className="edit-voice-button" type="button" onClick={assistant.edit}>{t('ai.edit')}</button>
            <button className="edit-voice-button" type="button" onClick={assistant.cancel}>{t('ai.cancel')}</button>
          </div>
        </div>
      )}

      {assistant.phase === 'success' && (
        <div className="ai-success">
          <p className="ai-success-msg">{t('ai.success.detail')}</p>
          <div className="ai-confirm-actions">
            <button className="primary-button" type="button" onClick={assistant.seeRecommendation} disabled={!assistant.createdLotId}>{t('ai.recommendation')}</button>
            <button className="edit-voice-button" type="button" onClick={assistant.closeAssistant}>{t('ai.close')}</button>
          </div>
        </div>
      )}

      {inputVisible && (
        <form className="ai-input-row" onSubmit={(event) => { event.preventDefault(); assistant.submitText() }}>
          <button
            className="voice-button"
            type="button"
            onClick={assistant.toggleMic}
            aria-label={assistant.listening ? t('ai.stop') : t('ai.start')}
            disabled={assistant.phase === 'creating'}
          >
            {assistant.listening ? t('ai.stop') : t('ai.start')} <span aria-hidden="true">{assistant.listening ? '■' : '◉'}</span>
          </button>
          <input
            className="ai-text-input"
            type="text"
            value={assistant.input}
            onChange={(event) => assistant.setInput(event.target.value)}
            placeholder={t('ai.input.placeholder')}
            aria-label={t('ai.input.placeholder')}
            disabled={assistant.phase === 'creating'}
          />
          <button className="submit-button" type="submit" disabled={!assistant.input.trim() || assistant.phase === 'creating'}>{t('ai.send')}</button>
        </form>
      )}
    </section>
  )
}
