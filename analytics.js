window.trackAnalyticsEvent = function trackAnalyticsEvent() {};

(function initializeAnalytics() {
  const measurementId = String(window.APP_CONFIG?.gaMeasurementId || "").trim();
  if (!measurementId) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.trackAnalyticsEvent = function trackAnalyticsEvent(name, params = {}) {
    window.gtag("event", name, params);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", measurementId);
})();
