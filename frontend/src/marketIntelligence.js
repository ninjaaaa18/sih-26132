import { apiFetch } from './api'

const DAY_MS = 24 * 60 * 60 * 1000

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null
}

function dailyAverages(records) {
  const grouped = new Map()
  for (const record of records) {
    if (!record.date || !Number.isFinite(Number(record.price))) continue
    if (!grouped.has(record.date)) grouped.set(record.date, [])
    grouped.get(record.date).push(Number(record.price))
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, prices]) => ({ date, price: average(prices) }))
}

export function analyzePriceHistory(records) {
  const daily = dailyAverages(records)
  if (daily.length < 2) return { daily, latest: daily.at(-1) || null, previous: null, change: null, changePercent: null, direction: 'INSUFFICIENT_DATA' }
  const latest = daily.at(-1)
  const previous = daily.at(-2)
  const change = latest.price - previous.price
  const changePercent = previous.price ? (change / previous.price) * 100 : null
  return {
    daily,
    latest,
    previous,
    change,
    changePercent,
    direction: changePercent === null || Math.abs(changePercent) <= 1 ? 'STABLE' : changePercent > 0 ? 'RISING' : 'FALLING',
  }
}

export function forecastPrice(records) {
  const analysis = analyzePriceHistory(records)
  if (analysis.daily.length < 2) return { ...analysis, forecast: null, forecastDate: null, confidence: 'INSUFFICIENT_DATA' }
  const points = analysis.daily.slice(-7)
  const xMean = (points.length - 1) / 2
  const yMean = average(points.map((point) => point.price))
  const denominator = points.reduce((sum, _, index) => sum + (index - xMean) ** 2, 0)
  const slope = denominator ? points.reduce((sum, point, index) => sum + (index - xMean) * (point.price - yMean), 0) / denominator : 0
  const predicted = Math.max(0, yMean + slope * points.length)
  const lastDate = new Date(`${analysis.latest.date}T00:00:00Z`)
  const forecastDate = new Date(lastDate.getTime() + DAY_MS).toISOString().slice(0, 10)
  const confidence = points.length >= 5 ? 'MEDIUM' : 'LOW'
  return { ...analysis, forecast: predicted, forecastDate, confidence, sourceStart: points[0].date, sourceEnd: points.at(-1).date }
}

export async function loadCropMarketData(cropId) {
  const [pricesResult, trendsResult] = await Promise.allSettled([
    apiFetch(`/api/v1/market-prices?crop_id=${cropId}`),
    apiFetch(`/api/v1/price-trends?crop_id=${cropId}`),
  ])
  if (pricesResult.status === 'rejected') throw pricesResult.reason
  return {
    records: pricesResult.value,
    trends: trendsResult.status === 'fulfilled' ? trendsResult.value : [],
    analysis: analyzePriceHistory(pricesResult.value),
    forecast: forecastPrice(pricesResult.value),
  }
}

export function latestMarketPrices(records) {
  const latestDate = records.reduce((latest, record) => record.date > latest ? record.date : latest, '')
  return { date: latestDate, records: records.filter((record) => record.date === latestDate).sort((left, right) => Number(right.price) - Number(left.price)) }
}

export function summarizeCurrentPrices(records) {
  const latest = latestMarketPrices(records)
  const prices = latest.records.map((record) => Number(record.price))
  return { ...latest, minimum: prices.length ? Math.min(...prices) : null, maximum: prices.length ? Math.max(...prices) : null, best: latest.records[0] || null }
}

const RESPONSES = {
  en: {
    current: ({ crop, current }) => current.best ? `${crop} prices are ${formatMoney(current.minimum)} to ${formatMoney(current.maximum)} per quintal across available markets. ${current.best.market_name} is highest at ${formatMoney(current.best.price)} per quintal (${current.date}).` : `No ${crop} market price is available yet.`,
    trend: ({ crop, analysis }) => analysis.latest ? `${crop} prices are ${direction(analysis.direction)}. The latest average is ${formatMoney(analysis.latest.price)} per quintal, ${analysis.changePercent === null ? 'with no comparable percentage change' : `${Math.abs(analysis.changePercent).toFixed(2)}% ${analysis.change >= 0 ? 'higher' : 'lower'} than the previous available day`} (${analysis.latest.date}).` : `I do not have enough ${crop} price history to calculate a trend.`,
    forecast: ({ crop, forecast }) => forecast.forecast === null ? `I do not have enough recent ${crop} price history to make a reliable forecast.` : `The estimated ${crop} price for ${forecast.forecastDate} is around ${formatMoney(forecast.forecast)} per quintal, based on ${forecast.sourceStart} to ${forecast.sourceEnd}. This is a forecast, not a guaranteed price; confidence is ${forecast.confidence.toLowerCase()}.`,
    decision: ({ crop, current, forecast }) => forecast.forecast === null ? `I do not have enough recent ${crop} history to advise whether to wait. Compare any confirmed buyer offer with today's available price.` : forecast.forecast > current.best?.price ? `${crop} prices are trending ${direction(forecast.direction)} and the short-term estimate is higher, so waiting may offer some upside. The forecast is uncertain; compare any guaranteed buyer offer before deciding.` : `${crop} prices are not showing a clear near-term upside. Selling today may reduce uncertainty, but compare the confirmed buyer offer with the latest market price first.`,
    market: ({ crop, results }) => results.length ? `${results[0].market_name} has the highest estimated net realization for ${crop} after transport cost, at ${formatMoney(results[0].net_realization)}. The market price is ${formatMoney(results[0].price)} and estimated transport is ${formatMoney(results[0].estimated_transport_cost)}.` : `I could not find market comparison data for ${crop}.`,
    buyers: ({ crop, matches }) => matches.length ? `I found ${matches.length} buyer matches for ${crop}: ${matches.slice(0, 3).map((match) => `${match.company_name} (${formatMoney(match.preferred_price)} per ${match.preferred_price_unit})`).join(', ')}.` : `I could not find an active buyer demand large enough for this ${crop} lot.`,
    needCrop: 'Which crop should I check?',
    error: 'I could not load the market data right now. Please try again.',
  },
}

const FALLBACK_RESPONSES = RESPONSES.en
const LANGUAGE_RESPONSES = {
  kn: { needCrop: 'ಯಾವ ಬೆಳೆಯನ್ನು ಪರಿಶೀಲಿಸಬೇಕು?', error: 'ಈಗ ಮಾರುಕಟ್ಟೆ ದತ್ತಾಂಶವನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.' },
  mr: { needCrop: 'कोणत्या पिकाची माहिती पाहू?', error: 'सध्या बाजाराचा डेटा लोड करता आला नाही. पुन्हा प्रयत्न करा.' },
  hi: { needCrop: 'मैं किस फसल की जांच करूं?', error: 'अभी बाजार का डेटा लोड नहीं हो सका। कृपया फिर कोशिश करें।' },
  ta: { needCrop: 'எந்தப் பயிரைச் சரிபார்க்க வேண்டும்?', error: 'இப்போது சந்தைத் தரவை ஏற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.' },
  te: { needCrop: 'ఏ పంటను పరిశీలించాలి?', error: 'ఇప్పుడు మార్కెట్ డేటాను లోడ్ చేయలేకపోయాను. మళ్లీ ప్రయత్నించండి.' },
}

function formatMoney(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value)) }
function direction(value) { return ({ RISING: 'rising', FALLING: 'falling', STABLE: 'stable' })[value] || 'not clear' }

export function buildMarketAnswer(kind, payload, language, t) {
  if (t) {
    const translated = t(`market.${kind}`, payload)
    if (translated !== `market.${kind}`) return translated
  }
  const templates = RESPONSES[language] || RESPONSES.en
  const overrides = LANGUAGE_RESPONSES[language] || {}
  if (kind === 'needCrop') return overrides.needCrop || templates.needCrop
  if (kind === 'error') return overrides.error || templates.error
  return (templates[kind] || FALLBACK_RESPONSES[kind])(payload)
}
