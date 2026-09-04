export function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function localDateValue() {
  const today = new Date()
  return formatLocalDate(today)
}

// ---------------------------------------------------------------------------
// Supported languages and speech locales
// ---------------------------------------------------------------------------
const SUPPORTED = ['en', 'kn', 'mr', 'hi', 'ta', 'te']

export function normalizeLanguage(lang) {
  return SUPPORTED.includes(lang) ? lang : null
}

const RECOGNITION_LOCALES = { en: 'en-IN', kn: 'kn-IN', mr: 'mr-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN' }

export function speechLocale(lang) {
  return RECOGNITION_LOCALES[lang] || null
}

// ---------------------------------------------------------------------------
// Small deterministic multilingual lexicon + parsers.
// This is NOT an NLP engine. It maps known demo tokens to master-data names.
// ---------------------------------------------------------------------------

// Whole-token matching that works with both Latin and Indic (non-\w) scripts.
// Note: Indic vowel signs (matras) are Unicode category Mc/Mn, not letters, so
// we treat marks (\p{M}) as part of a word to avoid splitting words like "सौ".
function wordBoundaryIncludes(text, term) {
  if (!term) return false
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escaped}([^\\p{L}\\p{M}\\p{N}]|$)`, 'u').test(text)
}

// Left-to-right evaluator for simple number-word phrases (e.g. "two hundred fifty").
function reduceNumberWords(words, map) {
  let result = 0
  let temp = 0
  for (const word of words) {
    const num = map[word]
    if (num === undefined) continue
    if (num < 100) temp += num
    else if (num === 100) temp = (temp || 1) * 100
    else { temp = (temp || 1) * num; result += temp; temp = 0 }
  }
  return result + temp
}

const NATIVE_DIGITS = {
  hi: '०१२३४५६७८९',
  mr: '०१२३४५६७८९',
  kn: '೦೧೨೩೪೫೬೭೮೯',
  ta: '௦௧௨௩௪௫௬௭௮௯',
  te: '౦౧౨౩౪౫౬౭౮౯',
}

const DIGIT_CHAR_MAP = {}
for (const chars of Object.values(NATIVE_DIGITS)) {
  chars.split('').forEach((ch, idx) => { DIGIT_CHAR_MAP[ch] = String(idx) })
}

function toLatinDigits(text) {
  return text.split('').map((ch) => DIGIT_CHAR_MAP[ch] ?? ch).join('')
}

const ENGLISH_NUMS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
}

const NUM_WORDS = {
  en: ENGLISH_NUMS,
  hi: {
    ...ENGLISH_NUMS,
    शून्य: 0, एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
    ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19,
    बीस: 20, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90, सौ: 100, हजार: 1000,
    ek: 1, do: 2, teen: 3, char: 4, paanch: 5, saat: 7, aath: 8, nau: 9, das: 10, bees: 20,
  },
  mr: {
    ...ENGLISH_NUMS,
    शून्य: 0, एक: 1, दोन: 2, तीन: 3, चार: 4, पाच: 5, सहा: 6, सात: 7, आठ: 8, नऊ: 9, दहा: 10,
    अकरा: 11, बारा: 12, तेरा: 13, चौदा: 14, पंधरा: 15, सोळा: 16, सतरा: 17, अठरा: 18, एकोणीस: 19,
    वीस: 20, तीस: 30, चाळीस: 40, पन्नास: 50, साठ: 60, सत्तर: 70, ऐंशी: 80, नव्वद: 90, शंभर: 100, हजार: 1000,
    don: 2, paach: 5, saha: 6, daha: 10,
  },
  kn: {
    ...ENGLISH_NUMS,
    ಸೊನ್ನೆ: 0, ಒಂದು: 1, ಎರಡು: 2, ಮೂರು: 3, ನಾಲ್ಕು: 4, ಐದು: 5, ಆರು: 6, ಏಳು: 7, ಎಂಟು: 8, ಒಂಬತ್ತು: 9, ಹತ್ತು: 10,
    ಹನ್ನೊಂದು: 11, ಹನ್ನೆರಡು: 12, ಹದಿಮೂರು: 13, ಹದಿನಾಲ್ಕು: 14, ಹದಿನೈದು: 15, ಹದಿನಾರು: 16, ಹದಿನೇಳು: 17, ಹದಿನೆಂಟು: 18, ಹತ್ತೊಂಬತ್ತು: 19,
    ಇಪ್ಪತ್ತು: 20, ಮೂವತ್ತು: 30, ನಲವತ್ತು: 40, ಐವತ್ತು: 50, ಅರವತ್ತು: 60, ಎಪ್ಪತ್ತು: 70, ಎಂಬತ್ತು: 80, ತೊಂಬತ್ತು: 90,
    ನೂರು: 100, ಸಾವಿರ: 1000,
  },
  ta: {
    ...ENGLISH_NUMS,
    பூஜ்யம்: 0, ஒன்று: 1, இரண்டு: 2, மூன்று: 3, நான்கு: 4, ஐந்து: 5, ஆறு: 6, ஏழு: 7, எட்டு: 8, ஒன்பது: 9, பத்து: 10,
    பதினொன்று: 11, பன்னிரண்டு: 12, பதின்மூன்று: 13, பதினான்கு: 14, பதினைந்து: 15, பதினாறு: 16, பதினேழு: 17, பதினெட்டு: 18, பத்தொன்பது: 19,
    இருபது: 20, முப்பது: 30, நாற்பது: 40, ஐம்பது: 50, அறுபது: 60, எழுபது: 70, எண்பது: 80, தொண்ணூறு: 90,
    நூறு: 100, ஆயிரம்: 1000,
  },
  te: {
    ...ENGLISH_NUMS,
    సున్న: 0, ఒకటి: 1, రెండు: 2, మూడు: 3, నాలుగు: 4, ఐదు: 5, ఆరు: 6, ఏడు: 7, ఎనిమిది: 8, తొమ్మిది: 9, పది: 10,
    పదకొండు: 11, పన్నెండు: 12, పదమూడు: 13, పద్నాలుగు: 14, పదిహేను: 15, పదహారు: 16, పదిహేడు: 17, పద్దెనిమిది: 18, పంతొమ్మిది: 19,
    ఇరవై: 20, ముప్పై: 30, నలభై: 40, యాభై: 50, అరవై: 60, డెబ్బై: 70, ఎనభై: 80, తొంభై: 90,
    వంద: 100, వెయ్యి: 1000, వేయి: 1000,
  },
}

export function parseQuantityNumber(rawText, language) {
  const text = rawText.toLowerCase()
  const latin = toLatinDigits(text)
  const digitRun = latin.match(/\d+(?:\.\d+)?/)
  if (digitRun) {
    return { value: Number(digitRun[0]), quantity: digitRun[0] }
  }
  const map = NUM_WORDS[normalizeLanguage(language) || 'en'] || ENGLISH_NUMS
  const tokens = text.split(/[^\p{L}\p{M}\p{N}]+/u).filter((t) => t && map[t] !== undefined)
  if (tokens.length === 0) return null
  const value = reduceNumberWords(tokens, map)
  if (value === 0 && !tokens.some((t) => map[t] === 0)) return null
  return { value, quantity: String(value) }
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
const UNITS = {
  kg: ['kg', 'kgs', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes', 'kilo', 'kilos', 'ಕೆಜಿ', 'ಕಿಲೋ', 'ಕಿಲೋಗ್ರಾಂ', 'किलो', 'किलोग्राम', 'किलोग्रॅम', 'கிலோ', 'கிலோகிராம்', 'గ్రామ్', 'కిలో', 'కిలోగ్రామ్'],
  quintal: ['quintal', 'quintals', 'ಕುಂಟಾಲ್', 'ಕ್ವಿಂಟಲ್', 'क्विंटल', 'क्विंटल', 'குவிண்டால்', 'క్వింటాల్'],
  tonne: ['tonne', 'tonnes', 'ton', 'tons', 'ಟನ್', 'टन', 'டன்', 'టన్ను'],
}

export function matchUnit(normalized) {
  const aliases = []
  for (const unit of Object.keys(UNITS)) {
    for (const a of UNITS[unit]) aliases.push({ a, unit })
  }
  aliases.sort((x, y) => y.a.length - x.a.length)
  for (const { a, unit } of aliases) {
    if (wordBoundaryIncludes(normalized, a)) return unit
  }
  return null
}

// ---------------------------------------------------------------------------
// Months and relative dates
// ---------------------------------------------------------------------------
const MONTHS = 'january february march april may june july august september october november december'.split(' ')

const LOCAL_MONTHS = {
  en: MONTHS,
  hi: ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  mr: ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'],
  kn: ['ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'],
  ta: ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்'],
  te: ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'],
}

// single-token month alias -> index, across all languages + transliterations
const MONTH_INDEX = {}
for (const lang of Object.keys(LOCAL_MONTHS)) {
  LOCAL_MONTHS[lang].forEach((m, i) => { if (m) MONTH_INDEX[m] = i })
}
// transliterations (Hindi-centric, widely understood)
{
  const translit = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const hiTranslit = ['janvari', 'febvari', 'maarch', 'april', 'mai', 'jun', 'julai', 'agast', 'sitambar', 'aktubar', 'navambar', 'disambar']
  translit.forEach((m, i) => { MONTH_INDEX[m] = i })
  hiTranslit.forEach((m, i) => { MONTH_INDEX[m] = i })
}

const RELATIVE_WORDS = {
  en: { today: ['today'], yesterday: ['yesterday'], beforeYesterday: ['day before yesterday'] },
  hi: { today: ['आज'], yesterday: ['कल', 'काल'], beforeYesterday: ['परसों'] },
  mr: { today: ['आज'], yesterday: ['काल'], beforeYesterday: ['परवा'] },
  kn: { today: ['ಇಂದು'], yesterday: ['ನಿನ್ನೆ'], beforeYesterday: ['ಮೊನ್ನೆ'] },
  ta: { today: ['இன்று'], yesterday: ['நேற்று'], beforeYesterday: ['நேற்று முன்தினம்'] },
  te: { today: ['ఈరోజు'], yesterday: ['నిన్న'], beforeYesterday: ['ఎల్లుండి'] },
}

export function parseVoiceDate(normalized, language = 'en') {
  const lang = normalizeLanguage(language) || 'en'
  const iso = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const year = Number(iso[1]); const month = Number(iso[2]); const day = Number(iso[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(year, month - 1, day)
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return formatLocalDate(date)
    }
    return ''
  }

  const rel = RELATIVE_WORDS[lang] || RELATIVE_WORDS.en
  const offsets = []
  for (const type of ['today', 'yesterday', 'beforeYesterday']) {
    for (const word of rel[type]) {
      if (wordBoundaryIncludes(normalized, word)) offsets.push(type === 'today' ? 0 : type === 'yesterday' ? 1 : 2)
    }
  }
  if (offsets.length > 1) return ''
  if (offsets.length === 1) {
    const date = new Date()
    date.setDate(date.getDate() - offsets[0])
    return formatLocalDate(date)
  }

  // "N days/weeks ago" — English words, accepted for any language for practicality
  const agoMatch = normalized.match(/\b(\d+|one|two|three|four|five|six|seven|a|ek|don|teen|paanch)\s+(?:day|days|week|weeks|दिवस|दिन|ಉ|வாரம்)\s*(?:ago|back|पहले|ಹಿಂದೆ|முன்பு)?\b/)
  if (agoMatch) {
    const num = Number(agoMatch[1]) || reduceNumberWords([agoMatch[1]], NUM_WORDS.en) || 1
    const isWeek = /week|வாரம்/.test(agoMatch[0])
    const days = (isWeek ? 7 : 1) * num
    if (days > 0 && days <= 366) {
      const date = new Date()
      date.setDate(date.getDate() - days)
      return formatLocalDate(date)
    }
    return ''
  }

  const dayMonth = normalized.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${Object.keys(MONTH_INDEX).join('|')})(?:\\s+(\\d{4}))?\\b`))
  const monthDay = normalized.match(new RegExp(`\\b(${Object.keys(MONTH_INDEX).join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`))
  if (dayMonth && monthDay) return ''
  const match = dayMonth || monthDay
  if (!match) return ''
  const day = Number(dayMonth ? match[1] : match[2])
  const month = MONTH_INDEX[dayMonth ? match[2] : match[1]]
  const year = Number(match[3] || new Date().getFullYear())
  const date = new Date(year, month, day)
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? formatLocalDate(date) : ''
}

// ---------------------------------------------------------------------------
// Yes / No
// ---------------------------------------------------------------------------
const YES_WORDS = {
  en: ['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay'],
  mr: ['हो', 'होय', 'हां', 'haa'],
  hi: ['हाँ', 'हां', 'हा', 'haa'],
  kn: ['ಹೌದು'],
  ta: ['ஆம்'],
  te: ['అవును'],
}
const NO_WORDS = {
  en: ['no', 'nope', 'cancel', 'not', 'stop'],
  mr: ['नाही', 'ना'],
  hi: ['नहीं', 'ना', 'नही'],
  kn: ['ಇಲ್ಲ'],
  ta: ['இல்லை'],
  te: ['కాదు'],
}

export function matchYesNo(normalized, language) {
  const lang = normalizeLanguage(language) || 'en'
  const yes = [...(YES_WORDS[lang] || []), ...YES_WORDS.en]
  const no = [...(NO_WORDS[lang] || []), ...NO_WORDS.en]
  for (const word of yes) if (wordBoundaryIncludes(normalized, word)) return 'yes'
  for (const word of no) if (wordBoundaryIncludes(normalized, word)) return 'no'
  return null
}

// ---------------------------------------------------------------------------
// Demo crop lexicon (aliases -> canonical master-data name)
// ---------------------------------------------------------------------------
const CROP_ALIASES = {
  Tomato: ['टमाटर', 'टोमॅटो', 'टमाटा', 'ಟೊಮ್ಯಾಟೊ', 'ಟೊಮಾಟೊ', 'தக்காளி', 'టమాటా', 'తక్కాలి', 'tamatar', 'tamater', 'takkali'],
  Onion: ['प्याज', 'कांदा', 'ಈರುಳ್ಳಿ', 'வெங்காயம்', 'ఉల్లిపాయ', 'pyaaz', 'pyaj', 'kanda', 'ullipaya'],
  Potato: ['आलू', 'बटाटा', 'ಆಲೂಗಡ್ಡೆ', 'உருளைக்கிழங்கு', 'బంగాళాదుంప', 'aaloo', 'aloo', 'bataata', 'urulaikizhangu', 'bangaladumpa'],
  Maize: ['मक्का', 'मका', 'ಜೋಳ', 'சோளம்', 'మొక్కజొన్న', 'makka', 'maka', 'jola', 'cholam'],
}

const CROP_ALIAS_INDEX = {}
for (const canonical of Object.keys(CROP_ALIASES)) {
  CROP_ALIASES[canonical].forEach((a) => { CROP_ALIAS_INDEX[a] = canonical })
}

export function matchCrops(normalized, crops) {
  const found = new Set()
  crops.forEach((crop) => {
    if (normalized.includes(crop.name.toLowerCase())) found.add(crop.id)
  })
  for (const term of Object.keys(CROP_ALIAS_INDEX)) {
    if (wordBoundaryIncludes(normalized, term)) {
      const canonical = CROP_ALIAS_INDEX[term]
      const crop = crops.find((c) => c.name.toLowerCase() === canonical.toLowerCase())
      if (crop) found.add(crop.id)
    }
  }
  return crops.filter((crop) => found.has(crop.id))
}

// ---------------------------------------------------------------------------
// Demo location lexicon (alias -> canonical name token)
// ---------------------------------------------------------------------------
const LOCATION_ALIASES = {
  'maharashtra': ['महाराष्ट्र', 'ಮಹಾರಾಷ್ಟ್ರ', 'மகாராஷ்டிரா', 'మహారాష్ట్ర'],
  'karnataka': ['ಕರ್ನಾಟಕ', 'कर्नाटक', 'கருநாடகம்', 'కర్ణాటక'],
  'nashik': ['नाशिक', 'ನಾಶಿಕ್', 'நாசிக்', 'నాసిక్'],
  'pune': ['पुणे', 'ಪುಣೆ', 'புனே', 'పూణే'],
  'ahmednagar': ['अहमदनगर', 'ಅಹಮದ್ನಗರ్'],
  'thane': ['ठाणे', 'ಠಾಣೆ'],
  'bengaluru': ['ಬೆಂಗಳೂರು', 'बेंगलुरु', 'பெங்களூரு', 'బెంగళూరు'],
  'belagavi': ['ಬೆಳಗಾವಿ', 'बेळगाव'],
  'mysuru': ['ಮೈಸೂರು', 'मैसूर', 'மைசூர்', 'మైసూర్'],
  'dharwad': ['ಧಾರವಾಡ', 'धारवाड'],
  'niphad': ['निफाड', 'ನಿಫಾದ್'],
  'junnar': ['जुन्नर', 'ಜುನ್ನಾರ್'],
  'rahta': ['राहता', 'ರಾಹತಾ'],
  'devanahalli': ['ದೇವನಹಳ್ಳಿ', 'देवनहळ्ळी'],
  'macleshwar': ['ಮಾಕಲೇಶ್ವರ'],
  'saragur': ['ಸರಗೂರು', 'ಸರಗೂರು'],
  'hubballi': ['ಹುಬ್ಬಳ್ಳಿ', 'हुब्बल्ली'],
  'lasalgaon': ['लासलगांव', 'ಲಾಸಲಗಾಂವ್', 'லாஸல்கான்'],
  'ale': ['अळे', 'ಅಲೆ'],
  'shirdi': ['शिर्डी', 'ಶಿರಡಿ'],
  'vashi': ['वाशी', 'ವಾಶಿ', 'வாஷி'],
  'rural': ['ಗ್ರಾಮೀಣ', 'ग्रामीण'],
}

const LOCATION_ALIAS_INDEX = {}
for (const canonical of Object.keys(LOCATION_ALIASES)) {
  LOCATION_ALIASES[canonical].forEach((a) => { LOCATION_ALIAS_INDEX[a] = canonical })
}

function locationTokensPresent(normalized, location) {
  const tokens = [location.village, location.tehsil, location.district, location.state]
  for (const token of tokens) {
    if (!token) continue
    const canonical = token.toLowerCase()
    if (wordBoundaryIncludes(normalized, canonical)) return true
    if (LOCATION_ALIAS_INDEX[canonical]) {
      for (const alias of LOCATION_ALIASES[canonical] || []) {
        if (wordBoundaryIncludes(normalized, alias)) return true
      }
    }
  }
  return false
}

export function matchLocations(normalized, locations) {
  return locations.filter((location) => locationTokensPresent(normalized, location))
}

// ---------------------------------------------------------------------------
// Main multilingual transcript parser
// ---------------------------------------------------------------------------
export function parseVoiceTranscript(transcript, crops, locations, language = 'en') {
  const normalized = transcript.toLowerCase()
  const issues = []

  const number = parseQuantityNumber(normalized, language)
  const unit = matchUnit(normalized, language)

  const cropMatches = matchCrops(normalized, crops)
  const locationMatches = matchLocations(normalized, locations)
  const dateValue = parseVoiceDate(normalized, language)

  if (!number) issues.push('quantity')
  if (!unit) issues.push('unit')
  if (cropMatches.length !== 1) issues.push(cropMatches.length ? 'one unambiguous crop' : 'crop')
  if (locationMatches.length !== 1) issues.push(locationMatches.length ? 'one unambiguous location' : 'location')
  if (!dateValue) issues.push('harvest date')

  return {
    values: {
      crop_id: cropMatches.length === 1 ? cropMatches[0].id : '',
      quantity: number ? number.quantity : '',
      unit: unit || '',
      harvest_date: dateValue,
      location_id: locationMatches.length === 1 ? locationMatches[0].id : '',
    },
    issues,
  }
}
