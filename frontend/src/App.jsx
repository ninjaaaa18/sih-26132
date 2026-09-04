import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_BASE_URL, DEMO_FARMER_ID, apiFetch } from "./api";
import {
  LANGS,
  localizeError,
  localizedBuyerType,
  localizedCropName,
  localizedExplanation,
  localizedLocation,
  localizedOfferMessage,
  localizedOfferStatus,
  localizedOrderStatus,
  localizedRecommendationReason,
  localizedStatus,
  localizedTrend,
  localizedUnit,
  translate,
} from "./translations";
import { parseVoiceTranscript, speechLocale } from "./voiceParsing";
import ConversationalAssistant from "./components/ConversationalAssistant";
import "./App.css";

const emptyForm = {
  crop_id: "",
  quantity: "",
  unit: "kg",
  harvest_date: "",
  location_id: "",
  price_expectation: "",
};

function locationLabel(location, language) {
  return localizedLocation(location, language);
}

function formatRupees(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function PriceHistoryChart({ records, language, t }) {
  const usableRecords = records.filter(
    (record) => record.date && Number.isFinite(Number(record.price)),
  );
  const dates = [...new Set(usableRecords.map((record) => record.date))].sort();
  const markets = [
    ...new Set(usableRecords.map((record) => record.market_name)),
  ];
  if (dates.length === 0 || markets.length === 0) return null;

  const width = 720;
  const height = 320;
  const padding = { top: 22, right: 22, bottom: 52, left: 68 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = usableRecords.map((record) => Number(record.price));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || Math.max(maximum * 0.05, 1);
  const chartMinimum = minimum - range * 0.1;
  const chartMaximum = maximum + range * 0.1;
  const xFor = (date) =>
    padding.left +
    (dates.indexOf(date) / Math.max(dates.length - 1, 1)) * chartWidth;
  const yFor = (price) =>
    padding.top +
    ((chartMaximum - Number(price)) / (chartMaximum - chartMinimum)) *
      chartHeight;
  const colors = [
    "#2c704d",
    "#d99c25",
    "#a94736",
    "#4169a1",
    "#8b5e3c",
    "#6b4f8a",
    "#287c8c",
  ];
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => chartMinimum + ((chartMaximum - chartMinimum) * index) / 4,
  ).reverse();

  return (
    <div
      className="price-chart"
      aria-label={`${t("price.recent")} ${t("compare.price")}`}
    >
      <div className="price-chart-legend">
        {markets.map((market, index) => (
          <span key={market}>
            <i style={{ backgroundColor: colors[index % colors.length] }} />
            {market}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${t("compare.price")} ${t("price.chart.axis")}`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              className="price-chart-grid"
            />
            <text
              x={padding.left - 10}
              y={yFor(tick) + 4}
              textAnchor="end"
              className="price-chart-label"
            >
              ₹{Math.round(tick).toLocaleString("en-IN")}
            </text>
          </g>
        ))}
        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
          className="price-chart-axis"
        />
        <text
          transform={`translate(16 ${padding.top + chartHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          className="price-chart-label"
        >
          {t("price.chart.axis")}
        </text>
        <text
          x={padding.left + chartWidth / 2}
          y={height - 8}
          textAnchor="middle"
          className="price-chart-label"
        >
          {t("price.chart.date")}
        </text>
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          className="price-chart-axis"
        />
        {dates.map(
          (date, index) =>
            (index === 0 ||
              index === dates.length - 1 ||
              index % Math.ceil(dates.length / 5) === 0) && (
              <text
                key={date}
                x={xFor(date)}
                y={height - padding.bottom + 25}
                textAnchor="middle"
                className="price-chart-label"
              >
                {new Date(`${date}T00:00:00`).toLocaleDateString(`${language}-IN`, { day: "numeric", month: "short" })}
              </text>
            ),
        )}
        {markets.map((market, marketIndex) => {
          const marketRecords = usableRecords
            .filter((record) => record.market_name === market)
            .sort((left, right) => left.date.localeCompare(right.date));
          const path = marketRecords
            .map(
              (record, index) =>
                `${index === 0 ? "M" : "L"} ${xFor(record.date)} ${yFor(record.price)}`,
            )
            .join(" ");
          return (
            <g key={market}>
              <path
                d={path}
                className="price-chart-line"
                style={{ stroke: colors[marketIndex % colors.length] }}
              />
              {marketRecords.map((record) => (
                <circle
                  key={`${market}-${record.date}`}
                  cx={xFor(record.date)}
                  cy={yFor(record.price)}
                  r="4"
                  className="price-chart-point"
                  style={{ fill: colors[marketIndex % colors.length] }}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function App() {
  const [language, setLanguage] = useState(
    () => localStorage.getItem("kheti-setu-lang") || "en",
  );
  const t = (key, args) => translate(language, key, args);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const [crops, setCrops] = useState([]);
  const [locations, setLocations] = useState([]);
  const [farmer, setFarmer] = useState(null);
  const [lots, setLots] = useState([]);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [lotsError, setLotsError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [comparisonLot, setComparisonLot] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [recommendations, setRecommendations] = useState({});
  const [buyerMatches, setBuyerMatches] = useState({});
  const [buyerOffers, setBuyerOffers] = useState({});
  const [buyerOfferViews, setBuyerOfferViews] = useState({});
  const [buyerAcceptances, setBuyerAcceptances] = useState({});
  const [sellStates, setSellStates] = useState({});
  const [priceHistoryLot, setPriceHistoryLot] = useState(null);
  const [priceTrends, setPriceTrends] = useState(null);
  const [priceRecords, setPriceRecords] = useState([]);
  const [priceTrendsLoading, setPriceTrendsLoading] = useState(false);
  const [priceTrendsError, setPriceTrendsError] = useState("");
  const [lotOrders, setLotOrders] = useState({});
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceDetails, setVoiceDetails] = useState(null);
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      apiFetch("/api/v1/crops"),
      apiFetch("/api/v1/locations"),
      apiFetch(`/api/v1/farmer-profiles/${DEMO_FARMER_ID}`),
    ])
      .then(([cropResult, locationResult, farmerResult]) => {
        if (!active) return;
        if (cropResult.status === "fulfilled") setCrops(cropResult.value);
        if (locationResult.status === "fulfilled")
          setLocations(locationResult.value);
        if (farmerResult.status === "fulfilled") {
          setFarmer(farmerResult.value);
          setForm((current) => ({
            ...current,
            location_id: farmerResult.value.location_id,
          }));
        }
        const failedResult = [cropResult, locationResult, farmerResult].find(
          (result) => result.status === "rejected",
        );
        if (failedResult) setError(localizeError(failedResult.reason.message, t));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    loadLots();
    return () => {
      active = false;
    };
  }, []);

  async function loadLotOrder(lotId) {
    try {
      const result = await apiFetch(`/api/v1/produce-lots/${lotId}/order-info`);
      setLotOrders((current) => ({ ...current, [lotId]: result }));
    } catch {
      setLotOrders((current) => ({ ...current, [lotId]: null }));
    }
  }

  useEffect(() => {
    if (lotsLoading || lots.length === 0) return;
    for (const lot of lots) {
      if (!recommendations[lot.id]) {
        loadRecommendation(lot.id);
      }
      if (
        !(lot.id in lotOrders) &&
        (lot.lot_status === "sold" || lot.lot_status === "accepted")
      ) {
        loadLotOrder(lot.id);
      }
    }
  }, [lots, lotsLoading, recommendations, lotOrders]);

  async function loadLots() {
    setLotsLoading(true);
    setLotsError("");
    try {
      const result = await apiFetch(
        `/api/v1/produce-lots?farmer_profile_id=${DEMO_FARMER_ID}`,
      );
      const loaded = Array.isArray(result) ? result : result?.lots || [];
      setLots(loaded);
    } catch (requestError) {
      setLotsError(localizeError(requestError.message, t));
    } finally {
      setLotsLoading(false);
    }
  }

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    localStorage.setItem("kheti-setu-lang", nextLanguage);
  }

  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
    setSubmitError("");
    setSuccess("");
  }

  function startVoiceCapture() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError(t("voice.unsupported"));
      return;
    }
    const locale = speechLocale(language);
    if (!locale) {
      setVoiceError(t("ai.unsupported.lang"));
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = locale;
    recognition.onstart = () => {
      setVoiceListening(true);
      setVoiceError("");
      setVoiceTranscript("");
      setVoiceDetails(null);
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      setVoiceTranscript(transcript);
      const parsed = parseVoiceTranscript(transcript, crops, locations);
      setVoiceDetails(parsed);
      if (parsed.issues.length === 0)
        setForm((current) => ({ ...current, ...parsed.values }));
    };
    recognition.onerror = (event) => {
      setVoiceListening(false);
      setVoiceError(
        event.error === "not-allowed"
          ? t("voice.permission")
          : t("voice.failed", event.error),
      );
    };
    recognition.onend = () => setVoiceListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopVoiceCapture() {
    recognitionRef.current?.stop();
    setVoiceListening(false);
  }

  function editVoiceDetails() {
    if (voiceDetails)
      setForm((current) => ({ ...current, ...voiceDetails.values }));
    setVoiceDetails(null);
    setVoiceError("");
  }

  function confirmVoiceLot() {
    handleSubmit({ preventDefault: () => {} });
    setVoiceDetails(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    setSuccess("");
    try {
      const created = await apiFetch("/api/v1/produce-lots", {
        method: "POST",
        body: JSON.stringify({
          farmer_profile_id: DEMO_FARMER_ID,
          crop_id: form.crop_id,
          lot_number: `LOT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          quantity: Number(form.quantity),
          unit: form.unit,
          harvest_date: form.harvest_date,
          location_id: form.location_id,
          price_expectation: form.price_expectation
            ? Number(form.price_expectation)
            : null,
        }),
      });
      await loadLots();
      loadRecommendation(created.id);
      setForm((current) => ({
        ...emptyForm,
        location_id: current.location_id,
      }));
      setSuccess(t("success.lot.saved"));
    } catch (requestError) {
      setSubmitError(localizeError(requestError.message, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function compareMarkets(lot) {
    setComparisonLot(lot);
    setComparison(null);
    setComparisonError("");
    setComparisonLoading(true);
    try {
      const result = await apiFetch(
        `/api/v1/produce-lots/${lot.id}/net-realization`,
      );
      setComparison(result);
    } catch (requestError) {
      setComparisonError(localizeError(requestError.message, t));
    } finally {
      setComparisonLoading(false);
    }
  }

  async function loadRecommendation(lotId) {
    setRecommendations((current) => ({
      ...current,
      [lotId]: { status: "loading" },
    }));
    try {
      const result = await apiFetch(
        `/api/v1/produce-lots/${lotId}/recommendation`,
      );
      setRecommendations((current) => ({
        ...current,
        [lotId]: { status: "success", data: result },
      }));
    } catch (requestError) {
      setRecommendations((current) => ({
        ...current,
        [lotId]: { status: "error", error: localizeError(requestError.message, t) },
      }));
    }
  }

  async function handleAssistantCreated(created) {
    await loadLots();
    loadRecommendation(created.id);
    setSuccess(t("success.lot.saved"));
  }

  function scrollToLots() {
    document
      .getElementById("lots")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadBuyerMatches(lotId) {
    setBuyerMatches((current) => ({
      ...current,
      [lotId]: { status: "loading" },
    }));
    setBuyerOfferViews((current) => ({ ...current, [lotId]: null }));
    setBuyerAcceptances((current) => ({ ...current, [lotId]: null }));
    try {
      const result = await apiFetch(
        `/api/v1/produce-lots/${lotId}/buyer-matches`,
      );
      setBuyerMatches((current) => ({
        ...current,
        [lotId]: { status: "success", data: result },
      }));
    } catch (requestError) {
      setBuyerMatches((current) => ({
        ...current,
        [lotId]: { status: "error", error: localizeError(requestError.message, t) },
      }));
    }
  }

  async function sellLot(lot) {
    setSellStates((current) => ({
      ...current,
      [lot.id]: { status: "loading" },
    }));
    try {
      await apiFetch(`/api/v1/produce-lots/${lot.id}/sell`, {
        method: "POST",
      });
      await loadLots();
      setSellStates((current) => ({
        ...current,
        [lot.id]: { status: "success" },
      }));
    } catch (requestError) {
      setSellStates((current) => ({
        ...current,
        [lot.id]: { status: "error", error: localizeError(requestError.message, t) },
      }));
    }
  }

  async function loadBuyerOffers(lotId) {
    setBuyerOffers((current) => ({
      ...current,
      [lotId]: { status: "loading" },
    }));
    try {
      const result = await apiFetch(
        `/api/v1/produce-lots/${lotId}/buyer-offers`,
      );
      setBuyerOffers((current) => ({
        ...current,
        [lotId]: { status: "success", data: result },
      }));
      return result;
    } catch (requestError) {
      setBuyerOffers((current) => ({
        ...current,
        [lotId]: { status: "error", error: localizeError(requestError.message, t) },
      }));
      throw requestError;
    }
  }

  async function viewBuyerOffer(lotId, match) {
    setBuyerOfferViews((current) => ({
      ...current,
      [lotId]: {
        status: "loading",
        buyerProfileId: match.buyer_profile_id,
        companyName: match.company_name,
      },
    }));
    try {
      const offersResult = await loadBuyerOffers(lotId);
      const pendingOffer = offersResult.offers?.find(
        (offer) =>
          offer.buyer_profile_id === match.buyer_profile_id &&
          offer.offer_status === "pending",
      );
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: {
          status: pendingOffer ? "ready" : "needs-offer",
          buyerProfileId: match.buyer_profile_id,
          companyName: match.company_name,
          offer: pendingOffer || null,
          preferredPriceUnit: match.preferred_price_unit,
        },
      }));
    } catch (requestError) {
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: {
          status: "error",
          buyerProfileId: match.buyer_profile_id,
          companyName: match.company_name,
          error: localizeError(requestError.message, t),
        },
      }));
    }
  }

  async function generateBuyerOffer(lotId, buyerProfileId) {
    setBuyerOfferViews((current) => ({
      ...current,
      [lotId]: { ...current[lotId], status: "generating" },
    }));
    try {
      const offer = await apiFetch(
        `/api/v1/produce-lots/${lotId}/buyer-offers`,
        {
          method: "POST",
          body: JSON.stringify({ buyer_profile_id: buyerProfileId }),
        },
      );
      setBuyerOffers((current) => ({
        ...current,
        [lotId]: {
          status: "success",
          data: {
            produce_lot_id: lotId,
            offers: [
              offer,
              ...(current[lotId]?.data?.offers || []).filter(
                (item) => item.id !== offer.id,
              ),
            ],
          },
        },
      }));
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: { ...current[lotId], status: "ready", offer },
      }));
    } catch (requestError) {
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: {
          ...current[lotId],
          status: "error",
          error: localizeError(requestError.message, t),
        },
      }));
    }
  }

  async function acceptBuyerOffer(lotId, offerId) {
    setBuyerOfferViews((current) => ({
      ...current,
      [lotId]: { ...current[lotId], status: "accepting" },
    }));
    try {
      const result = await apiFetch(`/api/v1/buyer-offers/${offerId}/accept`, {
        method: "POST",
      });
      setBuyerAcceptances((current) => ({
        ...current,
        [lotId]: { status: "success", data: result },
      }));
      setLotOrders((current) => ({ ...current, [lotId]: result.order }));
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: { ...current[lotId], status: "accepted", offer: result.offer },
      }));
      const updatedLot = await apiFetch(`/api/v1/produce-lots/${lotId}`);
      setLots((current) =>
        current.map((item) => (item.id === lotId ? updatedLot : item)),
      );
    } catch (requestError) {
      setBuyerOfferViews((current) => ({
        ...current,
        [lotId]: {
          ...current[lotId],
          status: "accept-error",
          error: localizeError(requestError.message, t),
        },
      }));
    }
  }

  function buyerLocationLabel(matchLocation) {
    return localizedLocation(matchLocation, language);
  }

  async function viewPriceHistory(lot) {
    setPriceHistoryLot(lot);
    setPriceTrends(null);
    setPriceRecords([]);
    setPriceTrendsError("");
    setPriceTrendsLoading(true);
    const [trendsResult, recordsResult] = await Promise.allSettled([
      apiFetch(`/api/v1/price-trends?crop_id=${lot.crop_id}`),
      apiFetch(`/api/v1/market-prices?crop_id=${lot.crop_id}`),
    ]);
    if (trendsResult.status === "fulfilled") setPriceTrends(trendsResult.value);
    if (recordsResult.status === "fulfilled")
      setPriceRecords(recordsResult.value);
    const failedResult = [trendsResult, recordsResult].find(
      (result) => result.status === "rejected",
    );
    if (failedResult) setPriceTrendsError(localizeError(failedResult.reason.message, t));
    setPriceTrendsLoading(false);
  }

  function closeComparison() {
    setComparisonLot(null);
    setComparison(null);
    setComparisonError("");
  }

  function closePriceHistory() {
    setPriceHistoryLot(null);
    setPriceTrends(null);
    setPriceRecords([]);
    setPriceTrendsError("");
  }

  const cropName = (id) =>
    localizedCropName(crops.find((crop) => crop.id === id)?.name, language) || t("table.unknown.crop");
  const locationName = (id) => {
    const location = locations.find((item) => item.id === id);
    return location ? locationLabel(location, language) : t("table.unknown.location");
  };
  const lotStatusLabel = (value) => localizedStatus(value, language) || t("status.unknown");
  const trendLabel = (value) => localizedTrend(value, language) || t("trend.insufficient");
  const buyerTypeLabel = (value) => localizedBuyerType(value, language) || value;
  const offerStatusLabel = (value) => localizedOfferStatus(value, language) || value;
  const orderStatusLabel = (value) => localizedOrderStatus(value, language) || value;
  const unitLabel = (value) => localizedUnit(value, language) || value;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={t("a11y.home")}>
          <span className="brand-mark">KS</span>
          <span>Kheti Setu</span>
        </a>
        <div className="topbar-actions">
          <span className="demo-label">{t("demo.farmer")}</span>
          <select
            className="language-select"
            value={language}
            onChange={(event) => changeLanguage(event.target.value)}
            aria-label={t("a11y.language")}
          >
            {LANGS.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </header>
      <section className="welcome-row">
        <div>
          <p className="eyebrow">
            {t("farmer.workspace")} <span>/</span>{" "}
            {farmer?.full_name || t("loading.profile")}
          </p>
          <h1>
            {t("greeting.morning")},{" "}
            {farmer?.full_name?.split(" ")[0] || t("greeting.farmer")}.
          </h1>
          <p className="welcome-copy">{t("welcome.copy")}</p>
        </div>
        <a className="primary-button" href="#add-lot">
          {t("action.add.lot")} <span>+</span>
        </a>
      </section>
      {error && (
        <div className="alert alert-error" role="alert">
          <strong>{t("error.load.farm")}</strong> {error}
        </div>
      )}
      <ConversationalAssistant
        crops={crops}
        locations={locations}
        language={language}
        t={t}
        onCreated={handleAssistantCreated}
        onSeeRecommendation={scrollToLots}
        onViewPriceHistory={viewPriceHistory}
      />
      <section className="workspace-grid">
        <div className="form-panel" id="add-lot">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("form.new.entry")}</p>
              <h2>{t("form.add.lot")}</h2>
            </div>
            <div className="voice-actions">
              <button
                className="voice-button"
                type="button"
                onClick={voiceListening ? stopVoiceCapture : startVoiceCapture}
                disabled={loading || submitting}
              >
                {voiceListening ? t("voice.stop") : t("voice.create")}{" "}
                <span aria-hidden="true">{voiceListening ? "■" : "◉"}</span>
              </button>
              <span className="step-count">
                01 <span>/ 01</span>
              </span>
            </div>
          </div>
          {voiceListening && (
            <div className="voice-status" role="status">
              <span className="recording-dot" /> {t("voice.listening")}
            </div>
          )}
          {voiceError && (
            <div className="alert alert-error" role="alert">
              {voiceError}
            </div>
          )}
          {voiceTranscript && (
            <div className="voice-transcript">
              <span>{t("voice.transcript")}</span>
              <strong>“{voiceTranscript}”</strong>
            </div>
          )}
          {voiceDetails && (
            <div className="voice-confirmation">
              <p className="eyebrow">{t("voice.detected")}</p>
              {voiceDetails.issues.length > 0 ? (
                <>
                  <strong>{t("voice.attention")}</strong>
                  <p>
                    {t("voice.missing")} {voiceDetails.issues.map((issue) => t(issue)).join(", ")}.
                  </p>
                  <button
                    className="edit-voice-button"
                    type="button"
                    onClick={editVoiceDetails}
                  >
                    {t("voice.edit.form")}
                  </button>
                </>
              ) : (
                <>
                  <p className="voice-summary">
                    {t("voice.crop")}:{" "}
                    <strong>{cropName(voiceDetails.values.crop_id)}</strong>
                    <br />
                    {t("voice.quantity")}:{" "}
                    <strong>
                      {voiceDetails.values.quantity} {unitLabel(voiceDetails.values.unit)}
                    </strong>
                    <br />
                    {t("voice.harvest.date")}:{" "}
                    <strong>{voiceDetails.values.harvest_date}</strong>
                    <br />
                    {t("voice.location")}:{" "}
                    <strong>
                      {locationName(voiceDetails.values.location_id)}
                    </strong>
                  </p>
                  <div className="voice-confirm-actions">
                    <button
                      className="submit-button"
                      type="button"
                      onClick={confirmVoiceLot}
                      disabled={submitting}
                    >
                      {t("voice.confirm.create")} <span>→</span>
                    </button>
                    <button
                      className="edit-voice-button"
                      type="button"
                      onClick={editVoiceDetails}
                    >
                      {t("voice.edit")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                <span>
                  {t("form.crop")} <b>*</b>
                </span>
                <select
                  name="crop_id"
                  value={form.crop_id}
                  onChange={updateField}
                  required
                  disabled={loading || submitting}
                >
                  <option value="">{t("form.choose.crop")}</option>
                  {crops.map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {localizedCropName(crop.name, language)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  {t("form.quantity")} <b>*</b>
                </span>
                <input
                  name="quantity"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.quantity}
                  onChange={updateField}
                  placeholder={t("form.e.g")}
                  required
                  disabled={submitting}
                />
              </label>
              <label>
                <span>
                  {t("form.unit")} <b>*</b>
                </span>
                <select
                  name="unit"
                  value={form.unit}
                  onChange={updateField}
                  required
                  disabled={submitting}
                >
                  <option value="kg">{t("form.kg")}</option>
                  <option value="quintal">{t("form.quintal")}</option>
                  <option value="tonne">{t("form.tonne")}</option>
                </select>
              </label>
              <label>
                <span>
                  {t("form.harvest.date")} <b>*</b>
                </span>
                <input
                  name="harvest_date"
                  type="date"
                  value={form.harvest_date}
                  onChange={updateField}
                  required
                  disabled={submitting}
                />
              </label>
              <label className="wide-field">
                <span>
                  {t("form.pickup")} <b>*</b>
                </span>
                <select
                  name="location_id"
                  value={form.location_id}
                  onChange={updateField}
                  required
                  disabled={loading || submitting}
                >
                  <option value="">{t("form.choose.location")}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {locationLabel(location, language)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  {t("form.expected.price")} <small>{t("form.per.unit")}</small>
                </span>
                <div className="input-prefix">
                  <span>₹</span>
                  <input
                    name="price_expectation"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.price_expectation}
                    onChange={updateField}
                    placeholder={t("form.optional")}
                    disabled={submitting}
                  />
                </div>
              </label>
            </div>
            {submitError && (
              <div className="alert alert-error" role="alert">
                {submitError}
              </div>
            )}
            {success && (
              <div className="alert alert-success" role="status">
                {success}
              </div>
            )}
            <div className="form-footer">
              <p>
                <b>*</b> {t("form.required.fields")}
              </p>
              <button
                className="submit-button"
                type="submit"
                disabled={loading || submitting || Boolean(error)}
              >
                {submitting ? t("form.saving") : t("form.save")} <span>→</span>
              </button>
            </div>
          </form>
        </div>
        <aside className="summary-panel">
          <p className="eyebrow">{t("summary.at.glance")}</p>
          <div className="lot-count">
            <strong>{lots.length}</strong>
            <span>
              {" "}
              {lots.length === 1
                ? t("summary.active.lot")
                : t("summary.active.lots")}
              <br />
              {t("summary.this.session")}
            </span>
          </div>
          <div className="rule" />
          <p className="summary-note">
            <span className="status-dot" /> {t("summary.ready")}
          </p>
          <p className="fine-print">{t("summary.fine.print")}</p>
          <div className="field-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </aside>
      </section>
      <section className="lots-section" id="lots">
        <div className="section-heading lots-heading">
          <div>
            <p className="eyebrow">{t("lots.harvest.log")}</p>
            <h2>{t("lots.my")}</h2>
          </div>
          {lots.length > 0 && (
            <span className="lot-badge">
              {lots.length} {t("lots.saved")}
            </span>
          )}
        </div>
        {lotsLoading ? (
          <div className="empty-state">
            <span className="loading-mark" />
            <div>
              <h3>{t("lots.loading")}</h3>
            </div>
          </div>
        ) : lotsError ? (
          <div className="empty-state">
            <div>
              <h3>{t("lots.error.title")}</h3>
              <p className="empty-error">{lotsError}</p>
              <button className="retry-button" type="button" onClick={loadLots}>
                {t("action.try.again")}
              </button>
            </div>
          </div>
        ) : lots.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">＋</span>
            <div>
              <h3>{t("lots.empty.title")}</h3>
              <p>{t("lots.empty.copy")}</p>
            </div>
          </div>
        ) : (
          <div
            className="lots-table"
            role="table"
            aria-label={t("lots.table.aria")}
          >
            <div className="table-row table-head">
              <span>{t("table.lot.number")}</span>
              <span>{t("table.crop")}</span>
              <span>{t("table.quantity")}</span>
              <span>{t("table.harvested")}</span>
              <span>{t("table.location")}</span>
              <span>{t("table.expected.price")}</span>
              <span />
            </div>
            {lots.map((lot) => {
              const recommendation = recommendations[lot.id];
              const recommendedMarket =
                recommendation?.data?.recommended_market;
              const lotOrder = lotOrders[lot.id];
              return (
                <div className="lot-entry" key={lot.id}>
                  <div className="table-row">
                    <strong>
                      {lot.lot_number}{" "}
                      <span
                        className={`lot-status-badge status-${lot.lot_status}`}
                      >
                        {lotStatusLabel(lot.lot_status)}
                      </span>
                    </strong>
                    <span>{cropName(lot.crop_id)}</span>
                    <span>
                      {lot.quantity} {unitLabel(lot.unit)}
                    </span>
                    <span>{lot.harvest_date}</span>
                    <span>{locationName(lot.location_id)}</span>
                    <span>
                      {lot.price_expectation
                        ? `₹${lot.price_expectation}`
                        : t("table.not.set")}
                    </span>
                    <button
                      className="compare-button"
                      type="button"
                      onClick={() => compareMarkets(lot)}
                    >
                      {t("action.compare")} <span aria-hidden="true">→</span>
                    </button>
                    <button
                      className="history-button"
                      type="button"
                      onClick={() => viewPriceHistory(lot)}
                    >
                      {t("action.price.history")}{" "}
                      <span aria-hidden="true">↗</span>
                    </button>
                    {lot.lot_status !== "sold" &&
                      lot.lot_status !== "cancelled" &&
                      lot.lot_status !== "offered" &&
                      lot.lot_status !== "accepted" && (
                        <>
                          <button
                          className="sell-button"
                          type="button"
                          onClick={() => sellLot(lot)}
                          disabled={sellStates[lot.id]?.status === "loading"}
                        >
                          {sellStates[lot.id]?.status === "loading"
                            ? t("sell.selling")
                            : t("action.sell.lot")} <span aria-hidden="true">→</span>
                          </button>
                          <button
                          className="find-buyers-button"
                          type="button"
                          onClick={() => loadBuyerMatches(lot.id)}
                          disabled={buyerMatches[lot.id]?.status === "loading"}
                        >
                          {t("action.find.buyers")} <span aria-hidden="true">→</span>
                          </button>
                        </>
                      )}
                  </div>
                  {lotOrder &&
                    (lot.lot_status === "sold" ||
                      lot.lot_status === "accepted") && (
                      <div className="sold-info">
                        <strong>{lotOrder.buyer_company_name}</strong>
                        <span>
                          {t("order.bought.at")}{" "}
                          {formatRupees(lotOrder.agreed_price)} /{" "}
                          {unitLabel(lotOrder.unit)}
                        </span>
                        <span className="order-status">
                          {orderStatusLabel(lotOrder.order_status)}
                        </span>
                      </div>
                    )}
                  <section
                    className={`recommendation-panel ${recommendation?.status === "success" && recommendedMarket ? "has-recommendation" : ""}`}
                    aria-label={`${t("rec.for")} ${lot.lot_number}`}
                  >
                    {(!recommendation ||
                      recommendation.status === "loading") && (
                      <div className="recommendation-state">
                        <span className="loading-mark" /> {t("rec.loading")}
                      </div>
                    )}
                    {recommendation?.status === "error" && (
                      <div className="recommendation-state recommendation-error">
                        <strong>{t("rec.error")}</strong>
                        <span>{recommendation.error}</span>
                        <button
                          className="retry-button"
                          type="button"
                          onClick={() => loadRecommendation(lot.id)}
                        >
                          {t("action.try.again")}
                        </button>
                      </div>
                    )}
                    {recommendation?.status === "success" &&
                      !recommendedMarket && (
                        <div className="recommendation-state">
                          <strong>{t("rec.none")}</strong>
                          <span>
                            {recommendation.data.reasons?.[0] ||
                              t("rec.no.data")}
                          </span>
                        </div>
                      )}
                    {recommendation?.status === "success" &&
                      recommendedMarket && (
                        <>
                          <div className="recommendation-heading">
                            <div>
                              <p className="eyebrow">{t("rec.recommended")}</p>
                              <h3>{recommendedMarket.market_name}</h3>
                            </div>
                            <span className="recommendation-badge">
                              {t("rec.best.fit")}
                            </span>
                          </div>
                          <div className="recommendation-metrics">
                            <div>
                              <span>{t("rec.price.per.unit")}</span>
                              <strong>
                                {formatRupees(recommendedMarket.price)}{" "}
                                <small>/ {unitLabel(recommendedMarket.price_unit)}</small>
                              </strong>
                            </div>
                            <div>
                              <span>{t("rec.net.realization")}</span>
                              <strong>
                                {formatRupees(
                                  recommendedMarket.net_realization,
                                )}
                              </strong>
                            </div>
                            <div>
                              <span>{t("rec.price.trend")}</span>
                              <strong
                                className={`trend-${recommendedMarket.trend_direction.toLowerCase()}`}
                              >
                                {trendLabel(recommendedMarket.trend_direction)}
                                {recommendedMarket.percentage_change !== null &&
                                  recommendedMarket.percentage_change !==
                                    undefined && (
                                    <small>
                                      {" "}
                                      {Number(
                                        recommendedMarket.percentage_change,
                                      ) > 0
                                        ? "+"
                                        : ""}
                                      {recommendedMarket.percentage_change}%
                                    </small>
                                  )}
                              </strong>
                            </div>
                          </div>
                          <div className="recommendation-footer">
                            <div>
                              <span className="recommendation-label">
                                {t("rec.why.market")}
                              </span>
                              <ul>
                                {recommendation.data.reasons?.map((reason) => (
                                  <li key={reason}>{localizedRecommendationReason(reason, t, language)}</li>
                                ))}
                              </ul>
                            </div>
                            {recommendation.data.next_best_market && (
                              <div className="next-best">
                                <span className="recommendation-label">
                                  {t("rec.next.best")}
                                </span>
                                <strong>
                                  {
                                    recommendation.data.next_best_market
                                      .market_name
                                  }
                                </strong>
                                {recommendation.data
                                  .advantage_over_next_best !== null &&
                                  recommendation.data
                                    .advantage_over_next_best !== undefined && (
                                    <span>
                                      {formatRupees(
                                        recommendation.data
                                          .advantage_over_next_best,
                                      )}{" "}
                                      {t("rec.advantage")}
                                    </span>
                                  )}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                  </section>
                  <section
                    className="buyer-panel"
                    aria-label={`${t("buyer.aria")} ${lot.lot_number}`}
                  >
                    {sellStates[lot.id]?.status === "error" && (
                      <div className="buyer-state buyer-error">
                        <strong>{t("sell.error")}</strong>
                        <span>{sellStates[lot.id].error}</span>
                      </div>
                    )}
                    {(buyerMatches[lot.id]?.status === "selling" ||
                      buyerMatches[lot.id]?.status === "loading") && (
                      <div className="buyer-state">
                        <span className="loading-mark" />{" "}
                        {buyerMatches[lot.id]?.status === "selling"
                          ? t("sell.selling")
                          : t("buyer.searching")}
                      </div>
                    )}
                    {buyerMatches[lot.id]?.status === "error" && (
                      <div className="buyer-state buyer-error">
                        <strong>{t("buyer.load.error")}</strong>
                        <span>{buyerMatches[lot.id].error}</span>
                        <button
                          className="retry-button"
                          type="button"
                          onClick={() => loadBuyerMatches(lot.id)}
                        >
                          {t("action.try.again")}
                        </button>
                      </div>
                    )}
                    {buyerMatches[lot.id]?.status === "success" &&
                      buyerMatches[lot.id].data.matches.length === 0 && (
                        <div className="buyer-state">{t("buyer.none")}</div>
                      )}
                    {buyerMatches[lot.id]?.status === "success" &&
                      buyerMatches[lot.id].data.matches.length > 0 && (
                        <>
                          <div className="buyer-heading">
                            <div>
                              <p className="eyebrow">
                                {t("buyer.matches")} <span>/</span>{" "}
                                {lot.lot_number}
                              </p>
                              <h3>{t("buyer.matching.buyers")}</h3>
                            </div>
                            <span className="match-count-badge">
                              {buyerMatches[lot.id].data.matches.length}{" "}
                              {t("buyer.found")}
                            </span>
                          </div>
                          <div className="buyer-match-list">
                            {buyerMatches[lot.id].data.matches.map((match) => (
                              <article
                                className={`buyer-match-card ${match.verification_status === "verified" ? "is-verified" : ""}`}
                                key={match.buyer_demand_id}
                              >
                                <div className="buyer-match-top">
                                  <div>
                                    <h4>{match.company_name}</h4>
                                    <span className="buyer-type-badge">
                                      {buyerTypeLabel(match.buyer_type)}
                                    </span>
                                    {match.verification_status ===
                                      "verified" && (
                                      <span className="verified-badge">
                                        ✓ {t("buyer.verified")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="match-score">
                                    <strong>{match.match_percentage}%</strong>
                                    <span>{t("buyer.match")}</span>
                                  </div>
                                </div>
                                <div className="buyer-match-details">
                                  <div>
                                    <span className="detail-label">
                                      {t("buyer.location")}
                                    </span>
                                    <span>
                                      {buyerLocationLabel(match.location)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="detail-label">
                                      {t("buyer.demand")}
                                    </span>
                                    <span>
                                      {match.demanded_quantity}{" "}
                                      {unitLabel(match.demand_unit)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="detail-label">
                                      {t("buyer.preferred.price")}
                                    </span>
                                    <span>
                                      {match.preferred_price
                                        ? `${formatRupees(match.preferred_price)} / ${unitLabel(match.preferred_price_unit)}`
                                        : t("buyer.not.specified")}
                                    </span>
                                  </div>
                                </div>
                                <p className="match-explanation">
                                  {localizedExplanation(match.match_explanation, t)}
                                </p>
                                <div className="buyer-match-actions">
                                  {buyerOfferViews[lot.id]?.buyerProfileId !==
                                    match.buyer_profile_id && (
                                    <button
                                      className="view-offer-button"
                                      type="button"
                                      onClick={() =>
                                        viewBuyerOffer(lot.id, match)
                                      }
                                    >
                                      {t("offer.view")}{" "}
                                      <span aria-hidden="true">→</span>
                                    </button>
                                  )}
                                </div>
                                {buyerOfferViews[lot.id]?.buyerProfileId ===
                                  match.buyer_profile_id && (
                                  <div className="offer-section">
                                    {buyerOfferViews[lot.id].status ===
                                      "loading" && (
                                      <div className="buyer-state">
                                        <span className="loading-mark" />{" "}
                                        {t("offer.loading")}
                                      </div>
                                    )}
                                    {buyerOfferViews[lot.id].status ===
                                      "error" && (
                                      <div className="buyer-state buyer-error">
                                        <strong>{t("offer.load.error")}</strong>
                                        <span>
                                          {buyerOfferViews[lot.id].error}
                                        </span>
                                      </div>
                                    )}
                                    {buyerOfferViews[lot.id].status ===
                                      "needs-offer" && (
                                      <div>
                                        <p className="buyer-state">
                                          {t("offer.none.pending")}
                                        </p>
                                        <button
                                          className="generate-offer-button"
                                          type="button"
                                          onClick={() =>
                                            generateBuyerOffer(
                                              lot.id,
                                              match.buyer_profile_id,
                                            )
                                          }
                                        >
                                          {t("offer.generate")}{" "}
                                          <span aria-hidden="true">→</span>
                                        </button>
                                      </div>
                                    )}
                                    {buyerOfferViews[lot.id].status ===
                                      "generating" && (
                                      <div className="buyer-state">
                                        <span className="loading-mark" />{" "}
                                        {t("offer.generating")}
                                      </div>
                                    )}
                                    {buyerOfferViews[lot.id].status ===
                                      "ready" &&
                                      buyerOfferViews[lot.id].offer && (
                                        <div className="offer-card">
                                          <div className="offer-card-header">
                                            <p className="eyebrow">
                                              {t("offer.from")}{" "}
                                              {match.company_name}
                                            </p>
                                            <span
                                              className={`offer-status-badge offer-status-${buyerOfferViews[lot.id].offer.offer_status}`}
                                            >
                                              {offerStatusLabel(
                                                buyerOfferViews[lot.id].offer
                                                  .offer_status,
                                              )}
                                            </span>
                                          </div>
                                          <div className="offer-details">
                                            <div>
                                              <span className="detail-label">
                                                {t("offer.price")}
                                              </span>
                                              <strong>
                                                {formatRupees(
                                                  buyerOfferViews[lot.id].offer
                                                    .offered_price,
                                                )}{" "}
                                                <small>
                                                  /{" "}
                                                  {unitLabel(buyerOfferViews[lot.id].offer.unit)}
                                                </small>
                                              </strong>
                                            </div>
                                            <div>
                                              <span className="detail-label">
                                                {t("offer.quantity")}
                                              </span>
                                              <strong>
                                                {
                                                  buyerOfferViews[lot.id].offer
                                                    .quantity
                                                }{" "}
                                                {unitLabel(buyerOfferViews[lot.id].offer.unit)}
                                              </strong>
                                            </div>
                                            {buyerOfferViews[lot.id].offer
                                              .valid_until && (
                                              <div>
                                                <span className="detail-label">
                                                  {t("offer.valid.until")}
                                                </span>
                                                <strong>
                                                  {new Date(
                                                    buyerOfferViews[lot.id]
                                                      .offer.valid_until,
                                                  ).toLocaleDateString(`${language}-IN`, { day: "numeric", month: "short", year: "numeric" })}
                                                </strong>
                                              </div>
                                            )}
                                          </div>
                                          {buyerOfferViews[lot.id].offer
                                            .offer_message && (
                                            <p className="offer-message">
                                              {localizedOfferMessage(buyerOfferViews[lot.id].offer.offer_message, t)}
                                            </p>
                                          )}
                                          {buyerOfferViews[lot.id].offer
                                            .offer_status === "pending" &&
                                            buyerOfferViews[lot.id].status !==
                                              "accepting" && (
                                              <button
                                                className="accept-offer-button"
                                                type="button"
                                                onClick={() =>
                                                  acceptBuyerOffer(
                                                    lot.id,
                                                    buyerOfferViews[lot.id]
                                                      .offer.id,
                                                  )
                                                }
                                              >
                                                {t("offer.accept")}{" "}
                                                <span aria-hidden="true">
                                                  ✓
                                                </span>
                                              </button>
                                            )}
                                          {buyerOfferViews[lot.id].status ===
                                            "accepting" && (
                                            <div className="buyer-state">
                                              <span className="loading-mark" />{" "}
                                              {t("offer.accepting")}
                                            </div>
                                          )}
                                          {buyerOfferViews[lot.id].status ===
                                            "accept-error" && (
                                            <div className="buyer-state buyer-error">
                                              <strong>
                                                {t("offer.accept.error")}
                                              </strong>
                                              <span>
                                                {buyerOfferViews[lot.id].error}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    {buyerAcceptances[lot.id]?.status ===
                                      "success" && (
                                      <div className="order-success-card">
                                        <div className="order-success-header">
                                          <span className="order-success-icon">
                                            ✓
                                          </span>
                                          <div>
                                            <strong>
                                              {t("order.accepted")}
                                            </strong>
                                            <p>{t("order.created")}</p>
                                          </div>
                                        </div>
                                        <div className="order-details">
                                          <div>
                                            <span className="detail-label">
                                              {t("order.buyer")}
                                            </span>
                                            <span>
                                              {
                                                buyerAcceptances[lot.id].data
                                                  .order.buyer_company_name
                                              }
                                            </span>
                                          </div>
                                          <div>
                                            <span className="detail-label">
                                              {t("order.agreed.price")}
                                            </span>
                                            <strong>
                                              {formatRupees(
                                                buyerAcceptances[lot.id].data
                                                  .order.agreed_price,
                                              )}
                                            </strong>
                                          </div>
                                          <div>
                                            <span className="detail-label">
                                              {t("order.quantity")}
                                            </span>
                                            <strong>
                                              {
                                                buyerAcceptances[lot.id].data
                                                  .order.agreed_quantity
                                              }{" "}
                                              {unitLabel(buyerAcceptances[lot.id].data.order.unit)}
                                            </strong>
                                          </div>
                                          <div>
                                            <span className="detail-label">
                                              {t("order.status")}
                                            </span>
                                            <span className="order-status">
                                              {orderStatusLabel(
                                                buyerAcceptances[lot.id].data
                                                  .order.order_status,
                                              )}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </article>
                            ))}
                          </div>
                        </>
                      )}
                  </section>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {comparisonLot &&
        createPortal(
          (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeComparison();
          }}
        >
          <section
            className="comparison-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="comparison-title"
          >
            <button
              className="close-button"
              type="button"
              onClick={closeComparison}
              aria-label={t("modal.close.compare")}
            >
              ×
            </button>
            <p className="eyebrow">
              {t("compare.intelligence")} <span>/</span>{" "}
              {comparisonLot.lot_number}
            </p>
            <h2 id="comparison-title">{t("compare.where")}</h2>
            <p className="comparison-intro">
              {cropName(comparisonLot.crop_id)} · {comparisonLot.quantity}{" "}
              {unitLabel(comparisonLot.unit)}
            </p>
            {comparisonLoading && (
              <div className="comparison-state">
                <span className="loading-mark" /> {t("compare.loading")}
              </div>
            )}
            {comparisonError && (
              <div className="comparison-state comparison-error">
                <strong>{t("compare.error")}</strong>
                <span>{comparisonError}</span>
                <button
                  className="retry-button"
                  type="button"
                  onClick={() => compareMarkets(comparisonLot)}
                >
                  {t("action.try.again")}
                </button>
              </div>
            )}
            {comparison && comparison.results?.length === 0 && (
              <div className="comparison-state">{t("compare.none")}</div>
            )}
            {comparison && comparison.results?.length > 0 && (
              <>
                <div className="winner-summary">
                  <div>
                    <p className="summary-label">{t("compare.highest.net")}</p>
                    <strong>
                      {comparison.highest_estimated_net_realization.market_name}
                    </strong>
                    <span>{t("compare.demo.note")}</span>
                  </div>
                  <b>
                    {formatRupees(
                      comparison.highest_estimated_net_realization
                        .net_realization,
                    )}
                  </b>
                </div>
                <div className="comparison-list">
                  {comparison.results.map((result) => {
                    const winner =
                      result.market_id ===
                      comparison.highest_estimated_net_realization.market_id;
                    return (
                      <article
                        className={`comparison-card ${winner ? "is-winner" : ""}`}
                        key={result.market_id}
                      >
                        <div className="comparison-card-top">
                          <div>
                            <h3>{result.market_name}</h3>
                            {winner && (
                              <span className="winner-label">
                                ⭐ {t("compare.winner.label")}
                              </span>
                            )}
                          </div>
                          <strong>
                            {formatRupees(result.net_realization)}
                          </strong>
                        </div>
                        <div className="comparison-metrics">
                          <span>
                            <small>{t("compare.price")}</small>
                            {formatRupees(result.price)} / {unitLabel(result.price_unit)}
                          </span>
                          <span>
                            <small>{t("compare.gross")}</small>
                            {formatRupees(result.gross_value)}
                          </span>
                          <span>
                            <small>{t("compare.transport")}</small>
                            {formatRupees(result.estimated_transport_cost)}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
          ),
          document.body,
        )}
      <footer className="footer">
        <span>Kheti Setu</span>
        <span>
          {t("footer.connected")} {API_BASE_URL || t("footer.proxy")}
        </span>
      </footer>
      {priceHistoryLot &&
        createPortal(
          (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePriceHistory();
          }}
        >
          <section
            className="comparison-modal price-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-history-title"
          >
            <button
              className="close-button"
              type="button"
              onClick={closePriceHistory}
              aria-label={t("modal.close.price")}
            >
              ×
            </button>
            <p className="eyebrow">
              {t("price.intelligence")} <span>/</span>{" "}
              {priceHistoryLot.lot_number}
            </p>
            <h2 id="price-history-title">{t("price.recent")}</h2>
            <p className="comparison-intro">
              {cropName(priceHistoryLot.crop_id)} · {priceHistoryLot.quantity}{" "}
              {unitLabel(priceHistoryLot.unit)}
            </p>
            {priceTrendsLoading && (
              <div className="comparison-state">
                <span className="loading-mark" /> {t("price.loading")}
              </div>
            )}
            {priceTrendsError && (
              <div className="comparison-state comparison-error">
                <strong>{t("price.error")}</strong>
                <span>{priceTrendsError}</span>
                <button
                  className="retry-button"
                  type="button"
                  onClick={() => viewPriceHistory(priceHistoryLot)}
                >
                  {t("action.try.again")}
                </button>
              </div>
            )}
            {priceTrends && priceTrends.length === 0 && (
              <div className="comparison-state">{t("price.none")}</div>
            )}
            {((priceTrends && priceTrends.length > 0) || priceRecords.length > 0) && (
              <>
                <PriceHistoryChart records={priceRecords} language={language} t={t} />
                {priceTrends && priceTrends.length > 0 && <div className="price-trend-list">
                {priceTrends.map((trend) => {
                  const hasHistory = trend.oldest_date && trend.latest_date;
                  return (
                    <article className="price-trend-card" key={trend.market_id}>
                      <div className="price-trend-heading">
                        <div>
                          <span className="recommendation-label">
                            {t("price.market")}
                          </span>
                          <h3>{trend.market_name}</h3>
                        </div>
                        <span
                          className={`trend-badge trend-${trend.trend_direction.toLowerCase()}`}
                        >
                          {trendLabel(trend.trend_direction)}
                        </span>
                      </div>
                      {hasHistory ? (
                        <div className="price-observations">
                          <div>
                            <span>
                              {t("price.oldest")} · {new Date(`${trend.oldest_date}T00:00:00`).toLocaleDateString(`${language}-IN`, { day: "numeric", month: "short" })}
                            </span>
                            <strong>{formatRupees(trend.oldest_price)}</strong>
                            <small>/ {unitLabel(trend.price_unit)}</small>
                          </div>
                          <div>
                            <span>
                              {t("price.latest")} · {new Date(`${trend.latest_date}T00:00:00`).toLocaleDateString(`${language}-IN`, { day: "numeric", month: "short" })}
                            </span>
                            <strong>{formatRupees(trend.latest_price)}</strong>
                            <small>/ {unitLabel(trend.price_unit)}</small>
                          </div>
                        </div>
                      ) : (
                        <p className="insufficient-data">
                          {t("price.insufficient")}
                        </p>
                      )}
                      <div className="price-trend-summary">
                        <div>
                          <span>{t("price.absolute.change")}</span>
                          <strong>
                            {trend.absolute_change === null
                              ? t("price.not.available")
                              : formatRupees(trend.absolute_change)}
                          </strong>
                        </div>
                        <div>
                          <span>{t("price.percentage.change")}</span>
                          <strong>
                            {trend.percentage_change === null
                              ? t("price.not.available")
                              : `${trend.percentage_change}%`}
                          </strong>
                        </div>
                      </div>
                    </article>
                  );
                })}
                </div>}
              </>
            )}
          </section>
        </div>
          ),
          document.body,
        )}
    </main>
  );
}

export default App;
