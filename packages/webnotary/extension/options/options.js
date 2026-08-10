import { BUILTIN_TSAS, mergeSettings } from '../lib/tsas.js';

const $ = (id) => document.getElementById(id);
let settings;

function renderTsaList() {
  const ul = $('tsaList');
  ul.textContent = '';
  for (const tsa of BUILTIN_TSAS) {
    const li = document.createElement('li');
    li.className = 'tsa-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `tsa-${tsa.id}`;
    cb.checked = !!settings.tsaEnabled[tsa.id];
    cb.addEventListener('change', () => { settings.tsaEnabled[tsa.id] = cb.checked; });
    const label = document.createElement('label');
    label.htmlFor = cb.id;
    label.style.fontWeight = '400';
    const name = document.createElement('div');
    name.className = 'tsa-name';
    name.textContent = tsa.name;
    const url = document.createElement('div');
    url.className = 'tsa-url';
    url.textContent = tsa.url;
    const blurb = document.createElement('div');
    blurb.className = 'tsa-blurb';
    blurb.textContent = tsa.blurb;
    label.append(name, url, blurb);
    li.append(cb, label);
    ul.appendChild(li);
  }
}

async function load() {
  const { wn_settings } = await chrome.storage.sync.get('wn_settings');
  settings = mergeSettings(wn_settings);
  $('operatorName').value = settings.operatorName;
  $('organization').value = settings.organization;
  $('customEnabled').checked = settings.customTsa.enabled;
  $('customUrl').value = settings.customTsa.url;
  ($('modeFull')).checked = settings.screenshotMode === 'fullpage';
  ($('modeViewport')).checked = settings.screenshotMode === 'viewport';
  renderTsaList();
}

$('save').addEventListener('click', async () => {
  settings.operatorName = $('operatorName').value.trim();
  settings.organization = $('organization').value.trim();
  settings.screenshotMode = $('modeViewport').checked ? 'viewport' : 'fullpage';
  settings.customTsa = {
    enabled: $('customEnabled').checked,
    url: $('customUrl').value.trim(),
  };

  if (settings.customTsa.enabled) {
    let origin;
    try {
      const u = new URL(settings.customTsa.url);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad scheme');
      origin = `${u.origin}/*`;
    } catch {
      alert('The custom TSA URL must be a valid http(s) URL.');
      return;
    }
    // Built-in hosts are already covered by host_permissions; only ask otherwise.
    const already = await chrome.permissions.contains({ origins: [origin] }).catch(() => false);
    if (!already) {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        alert('Without permission to contact that host, the custom TSA cannot be used. It stays disabled.');
        settings.customTsa.enabled = false;
        $('customEnabled').checked = false;
      }
    }
  }

  await chrome.storage.sync.set({ wn_settings: settings });
  $('savedToast').classList.remove('hidden');
  setTimeout(() => $('savedToast').classList.add('hidden'), 2000);
});

load();
