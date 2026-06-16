window.AGFJB_INTEL_API_BASE = 'https://script.google.com/macros/s/AKfycbyKFL24cqDgcx0SAfQ5I3j37IpqDb7_L9tOsqSMOw7hHxp41Hcqi4eDkeWeTtZMIc5p/exec';

function intelGetApiBase() {
  if (!window.AGFJB_INTEL_API_BASE) throw new Error('Configure AGFJB_INTEL_API_BASE em /inteligencia/_api.js ou no localStorage.');
  return window.AGFJB_INTEL_API_BASE.replace(/\/$/, '');
}

async function intelFetchJson(action, params = {}) {
  const url = new URL(intelGetApiBase());
  url.searchParams.set('action', action);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), { credentials: 'omit' });
  if (!res.ok) throw new Error(`Falha ${res.status} ao chamar ${action}`);
  return res.json();
}


