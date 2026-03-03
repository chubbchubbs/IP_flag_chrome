'use strict';

const FLAG_POPUP_CDN = 'https://flagcdn.com/w320/';

function showState(id) {
  document.querySelectorAll('.state').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function fmt(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function render(data) {
  if (!data.country && data.error) {
    document.getElementById('errMsg').textContent = data.error;
    showState('state-error');
    return;
  }

  const img = document.getElementById('flagImg');
  if (data.country) {
    img.src = `${FLAG_POPUP_CDN}${data.country}.png`;
    img.alt = data.countryName || data.country;
  }

  document.getElementById('countryName').textContent = data.countryName || data.country || '—';
  document.getElementById('ipAddr').textContent       = data.ip          || '—';
  document.getElementById('city').textContent         = data.city        || '—';
  document.getElementById('region').textContent       = data.region      || '—';
  document.getElementById('lastUpdate').textContent   = fmt(data.lastUpdate);

  showState('state-main');
}

async function loadData() {
  showState('state-loading');
  try {
    const data = await chrome.storage.local.get([
      'ip', 'country', 'countryName', 'city', 'region', 'lastUpdate', 'error'
    ]);

    if (!data.country && !data.error) {
      // Service worker hasn't responded yet — retry in 1 s
      setTimeout(loadData, 1000);
      return;
    }

    render(data);
  } catch (e) {
    document.getElementById('errMsg').textContent = e.message;
    showState('state-error');
  }
}

function attachRefresh(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.classList.add('spinning');
    showState('state-loading');

    try {
      const resp = await chrome.runtime.sendMessage({ action: 'refresh' });
      if (resp?.error) throw new Error(resp.error);
      // Small delay to ensure storage is written before we read it
      setTimeout(loadData, 400);
    } catch (e) {
      document.getElementById('errMsg').textContent = e.message;
      showState('state-error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('spinning');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  attachRefresh('btnRefresh');
  attachRefresh('btnRetry');
  loadData();
});
