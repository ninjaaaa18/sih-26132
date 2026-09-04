export function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function localDateValue() {
  const today = new Date()
  return formatLocalDate(today)
}

export function parseVoiceDate(normalized) {
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

export function parseVoiceTranscript(transcript, crops, locations) {
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
