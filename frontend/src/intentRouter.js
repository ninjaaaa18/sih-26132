import { matchCrops, matchLocations, normalizeLanguage } from './voiceParsing'

const INTENTS = {
  CREATE_LOT: 'CREATE_LOT',
  CURRENT_PRICE: 'CURRENT_PRICE',
  PRICE_TREND: 'PRICE_TREND',
  PRICE_FORECAST: 'PRICE_FORECAST',
  SELL_DECISION: 'SELL_DECISION',
  COMPARE_MARKETS: 'COMPARE_MARKETS',
  MARKET_RECOMMENDATION: 'MARKET_RECOMMENDATION',
  FIND_BUYERS: 'FIND_BUYERS',
  MY_LOTS: 'MY_LOTS',
  MY_ORDERS: 'MY_ORDERS',
  RECOMMENDATION: 'RECOMMENDATION',
  GENERAL_FARMING: 'GENERAL_FARMING',
  HELP: 'HELP',
  UNKNOWN: 'UNKNOWN',
}

const WORDS = {
  cancel: ['cancel', 'रद्द', 'रद्द करा', 'ರದ್ದು', 'ரத்து', 'రద్దు'],
  price: ['price', 'भाव', 'किंमत', 'ಬೆಲೆ', 'விலை', 'ధర'],
  trend: ['trend', 'increasing', 'increase', 'rising', 'falling', 'बढ़', 'घट', 'वाढ', 'कमी', 'ಏರುತ್ತ', 'ಇಳಿಯುತ್ತ', 'உயர', 'குறைய', 'పెరుగ', 'తగ్గ'],
  forecast: ['tomorrow', 'next week', 'expected', 'forecast', 'कल', 'उद्या', 'नಾಳೆ', 'நாளை', 'రేపు', 'अपेक्षित', 'अंदाज', 'மதிப்பீடு'],
  market: ['market', 'mandi', 'बाजार', 'बाज़ार', 'बाजारात', 'ಮಾರುಕಟ್ಟೆ', 'சந்தை', 'మార్కెట్'],
  buyer: ['buyer', 'buy', 'खरीदार', 'खरेदीदार', 'ಖರೀದಿದಾರ', 'வாங்குபவர்', 'కొనుగోలుదారు'],
  lot: ['lot', 'harvest', 'create', 'list', 'sell my', 'have ', 'लॉट', 'कापणी', 'पीक', 'लॉट', 'ಲಾಟ್', 'ಕಟಾವು', 'பயிர்', 'அறுவடை', 'లాట్', 'కోత'],
  farming: ['store', 'storage', 'irrigation', 'harvest', 'grading', 'transport', 'post-harvest', 'संग्रह', 'सिंचाई', 'भंडारण', 'साठवण', 'पाणी', 'ಸಂಗ್ರಹ', 'ನೀರಾವರಿ', 'சேமிப்பு', 'நீர்ப்பாசனம்', 'నిల్వ', 'నీటిపారుదల'],
}

function includesAny(text, terms) { return terms.some((term) => text.includes(term)) }

export function detectIntent(text, crops, locations, context = {}) {
  const normalized = String(text || '').normalize('NFKC').toLowerCase()
  const language = normalizeLanguage(context.language) || 'en'
  const cropMatches = matchCrops(normalized, crops)
  const locationMatches = matchLocations(normalized, locations)
  const crop = cropMatches.length === 1 ? cropMatches[0] : context.crop || null
  const intents = []
  if (includesAny(normalized, WORDS.cancel)) return { intents: [INTENTS.HELP], intent: INTENTS.HELP, command: 'cancel', crop, location: locationMatches[0] || context.location || null, language }
  const isQuestion = /\?|^(what|which|who|is|will|should|how|where|show|find|are|can)\b/i.test(normalized)
  const wantsForecast = includesAny(normalized, WORDS.forecast)
  const wantsTrend = includesAny(normalized, WORDS.trend)
  const wantsPrice = includesAny(normalized, WORDS.price)
  const wantsMarket = includesAny(normalized, WORDS.market)
  const wantsBuyers = includesAny(normalized, WORDS.buyer)
  const wantsLot = includesAny(normalized, WORDS.lot)
  if (normalized.includes('should i sell') || normalized.includes('sell today') || normalized.includes('wait')) intents.push(INTENTS.SELL_DECISION)
  else if (wantsForecast) intents.push(INTENTS.PRICE_FORECAST)
  else if (wantsTrend) intents.push(INTENTS.PRICE_TREND)
  else if (wantsPrice) intents.push(INTENTS.CURRENT_PRICE)
  if (wantsBuyers) intents.push(INTENTS.FIND_BUYERS)
  if (wantsMarket && (normalized.includes('best') || normalized.includes('better') || normalized.includes('which') || normalized.includes('where') || normalized.includes('what'))) intents.push(INTENTS.MARKET_RECOMMENDATION)
  if (wantsMarket && (normalized.includes('compare') || normalized.includes('vs') || normalized.includes('versus'))) intents.push(INTENTS.COMPARE_MARKETS)
  if (normalized.includes('my lots') || normalized.includes('show lots') || normalized.includes('what did i sell')) intents.push(INTENTS.MY_LOTS)
  if (normalized.includes('orders') || normalized.includes('order')) intents.push(INTENTS.MY_ORDERS)
  if (normalized.includes('recommendation')) intents.push(INTENTS.RECOMMENDATION)
  if (wantsLot && !isQuestion && !wantsPrice && !wantsBuyers && !wantsMarket) intents.push(INTENTS.CREATE_LOT)
  if (intents.length === 0 && includesAny(normalized, WORDS.farming)) intents.push(INTENTS.GENERAL_FARMING)
  if (intents.length === 0) intents.push(INTENTS.UNKNOWN)
  return { intents: [...new Set(intents)], intent: intents[0], crop, location: locationMatches[0] || context.location || null, language, text: normalized }
}

export { INTENTS }
