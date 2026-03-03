'use strict';

const UPDATE_ALARM = 'updateFlag';
const GEO_URL_PRIMARY  = 'https://ipinfo.io/json';
const GEO_URL_FALLBACK = 'https://freeipapi.com/api/json';
const FLAG_CDN         = 'https://flagcdn.com/w128/';
const ICON_SIZES       = [16, 32, 48, 128];

// ── Geo fetch ──────────────────────────────────────────────────────────────

async function fetchGeoData() {
  // Primary: ipinfo.io (free, 50k req/month, extension-friendly)
  try {
    const resp = await fetch(GEO_URL_PRIMARY, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if (resp.ok) {
      const d = await resp.json();
      if (d.country) {
        return {
          ip:          d.ip,
          country:     d.country.toLowerCase(),
          countryName: d.country,
          city:        d.city   || '',
          region:      d.region || ''
        };
      }
      console.warn('[FlagExt] ipinfo.io bad response:', JSON.stringify(d).slice(0, 200));
    } else {
      console.warn('[FlagExt] ipinfo.io HTTP', resp.status);
    }
  } catch (e) {
    console.warn('[FlagExt] ipinfo.io failed:', e.message);
  }

  // Fallback: freeipapi.com (free, unlimited, HTTPS)
  try {
    const resp = await fetch(GEO_URL_FALLBACK, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if (resp.ok) {
      const d = await resp.json();
      if (d.countryCode) {
        return {
          ip:          d.ipAddress,
          country:     d.countryCode.toLowerCase(),
          countryName: d.countryName || d.countryCode,
          city:        d.cityName    || '',
          region:      d.regionName  || ''
        };
      }
      console.warn('[FlagExt] freeipapi.com bad response:', JSON.stringify(d).slice(0, 200));
    } else {
      console.warn('[FlagExt] freeipapi.com HTTP', resp.status);
    }
  } catch (e) {
    console.warn('[FlagExt] freeipapi.com failed:', e.message);
  }

  return null;
}

// ── Flag icon builder ──────────────────────────────────────────────────────

async function buildIconImageData(countryCode) {
  const url  = `${FLAG_CDN}${countryCode}.png`;
  const resp = await fetch(url, { cache: 'default' });
  if (!resp.ok) throw new Error(`Flag fetch HTTP ${resp.status} for "${countryCode}"`);

  const blob   = await resp.blob();
  const bitmap = await createImageBitmap(blob);
  const result = {};

  for (const size of ICON_SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx    = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    // Scale preserving aspect ratio, center on square canvas
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const w     = Math.round(bitmap.width  * scale);
    const h     = Math.round(bitmap.height * scale);
    const x     = Math.round((size - w) / 2);
    const y     = Math.round((size - h) / 2);

    ctx.drawImage(bitmap, x, y, w, h);

    // Subtle border so white-background flags are visible
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth   = 0.75;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    result[size] = ctx.getImageData(0, 0, size, size);
  }

  bitmap.close();
  return result;
}

// ── Core update routine ────────────────────────────────────────────────────

async function updateFlag() {
  const started = new Date().toISOString();
  console.log('[FlagExt] Updating…', started);

  const geo = await fetchGeoData();
  if (!geo) {
    await chrome.storage.local.set({
      error:       'Не удалось определить местоположение по IP',
      lastAttempt: started
    });
    console.error('[FlagExt] Geo lookup failed');
    return;
  }

  // Persist to storage (popup reads from here)
  await chrome.storage.local.set({
    ip:          geo.ip,
    country:     geo.country,
    countryName: geo.countryName,
    city:        geo.city,
    region:      geo.region,
    lastUpdate:  started,
    lastAttempt: started,
    error:       null
  });

  try {
    const imageData = await buildIconImageData(geo.country);
    await chrome.action.setIcon({ imageData });
    await chrome.action.setTitle({
      title: `${geo.countryName}\nIP: ${geo.ip}\n${[geo.city, geo.region].filter(Boolean).join(', ')}`
    });
    console.log('[FlagExt] Icon set →', geo.countryName, geo.ip);
  } catch (e) {
    console.error('[FlagExt] setIcon failed:', e);
    await chrome.storage.local.set({ error: e.message });
  }
}

// ── Event listeners ────────────────────────────────────────────────────────

// Popup "refresh" button
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'refresh') {
    updateFlag()
      .then(() => sendResponse({ ok: true }))
      .catch(e  => sendResponse({ error: e.message }));
    return true; // keep channel open for async response
  }
});

// Extension installed / updated
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.clearAll(() => {
    chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 1 });
  });
  updateFlag();
});

// Browser startup (service worker may have been killed overnight)
chrome.runtime.onStartup.addListener(() => {
  updateFlag();
});

// Periodic alarm (every 1 minute)
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === UPDATE_ALARM) updateFlag();
});
