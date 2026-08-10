import { STEPS } from '../lib/steps.js';

const $ = (id) => document.getElementById(id);
let activeTab = null;

const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');

function fmtAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function renderProgress(state) {
  show('progress'); hide('result'); hide('error');
  $('captureBtn').disabled = true;
  const ul = $('stepList');
  ul.textContent = '';
  for (const [stepId, label] of STEPS) {
    const st = state.steps?.[stepId] ?? 'pending';
    const li = document.createElement('li');
    li.className = `step ${st}`;
    const icon = document.createElement('span');
    icon.className = `step-icon${st === 'run' ? ' spinner' : ''}`;
    icon.textContent = st === 'ok' ? '✓' : st === 'warn' ? '⚠' : st === 'fail' ? '✕' : st === 'run' ? '' : '·';
    const text = document.createElement('span');
    text.textContent = label;
    li.append(icon, text);
    ul.appendChild(li);
  }
  if (state.detail) {
    const li = document.createElement('li');
    li.className = 'step-detail';
    li.textContent = state.detail;
    ul.appendChild(li);
  }
}

function renderDone(entry, noTimestamp) {
  hide('progress'); hide('error'); show('result');
  $('captureBtn').disabled = false;
  $('resultFile').textContent = `Downloads/${entry.fileName}`;
  $('resultTs').textContent = entry.timestamps.length
    ? `Trusted timestamp${entry.timestamps.length > 1 ? 's' : ''}: ${entry.timestamps.map((t) => `${t.name} @ ${t.genTime}`).join(' · ')}`
    : 'No trusted timestamp obtained.';
  $('resultHash').textContent = entry.manifestSha256;
  const warn = $('resultWarn');
  if (noTimestamp) {
    warn.textContent = 'All time-stamping authorities failed — the bundle carries digests but no RFC 3161 token. Check your network or TSA settings and consider re-capturing.';
    show('resultWarn');
  } else if (entry.tsFailures > 0) {
    warn.textContent = `${entry.tsFailures} of the configured TSAs failed; the bundle carries the successful token(s).`;
    show('resultWarn');
  } else {
    hide('resultWarn');
  }
}

function renderError(message) {
  hide('progress'); hide('result'); show('error');
  $('captureBtn').disabled = false;
  $('errorMsg').textContent = message;
}

async function renderHistory() {
  const { wn_history = [] } = await chrome.storage.local.get('wn_history');
  const ul = $('recentList');
  ul.textContent = '';
  if (!wn_history.length) { show('recentEmpty'); return; }
  hide('recentEmpty');
  for (const entry of wn_history.slice(0, 4)) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'recent-item';
    const dot = document.createElement('span');
    dot.className = `recent-dot ${entry.state === 'download-failed' ? 'fail' : entry.timestamps?.length ? 'ok' : 'warn'}`;
    const main = document.createElement('span');
    main.className = 'recent-main';
    const host = document.createElement('span');
    host.className = 'recent-host';
    host.textContent = entry.host || entry.url;
    const sub = document.createElement('span');
    sub.className = 'recent-sub';
    sub.textContent = `${fmtAgo(entry.capturedUtc)}${entry.timestamps?.length ? ` · ${entry.timestamps.length} TSA` : ' · no timestamp'}`;
    main.append(host, document.createElement('br'), sub);
    const action = document.createElement('span');
    action.className = 'recent-action';
    action.textContent = entry.state === 'download-failed' ? 'Retry save' : 'Show file';
    btn.append(dot, main, action);
    btn.addEventListener('click', async () => {
      if (entry.state === 'download-failed') {
        const res = await chrome.runtime.sendMessage({ type: 'wn-redownload', id: entry.id });
        if (!res?.ok) renderError(res?.error ?? 'Could not restart the download.');
      } else if (entry.downloadId != null) {
        chrome.downloads.show(entry.downloadId);
      }
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  let url = null;
  try { url = new URL(tab?.url ?? ''); } catch { /* tab without URL access */ }
  const supported = !!url && ['http:', 'https:', 'file:'].includes(url.protocol);
  $('tabTitle').textContent = tab?.title || url?.href || 'Current page';
  $('tabHost').textContent = url ? (url.hostname || url.href) : '';
  if (!supported) {
    show('unsupported');
    $('captureBtn').disabled = true;
  }

  const { wn_settings } = await chrome.storage.sync.get('wn_settings');
  $('operatorLine').textContent = wn_settings?.operatorName
    ? `Operator: ${wn_settings.operatorName}${wn_settings.organization ? ` · ${wn_settings.organization}` : ''}`
    : 'Tip: set your operator name in Settings — it is recorded in the chain-of-custody report.';

  const { wn_last_matter } = await chrome.storage.local.get('wn_last_matter');
  if (wn_last_matter) $('matter').value = wn_last_matter;

  const { wn_active } = await chrome.storage.session.get('wn_active');
  if (wn_active) renderProgress(wn_active);

  await renderHistory();
}

$('captureBtn').addEventListener('click', async () => {
  if (!activeTab?.id) return;
  const matter = $('matter').value.trim();
  await chrome.storage.local.set({ wn_last_matter: matter });
  renderProgress({ steps: { meta: 'run' } });
  chrome.runtime.sendMessage({
    type: 'wn-capture',
    tabId: activeTab.id,
    matter,
    notes: $('notes').value.trim(),
    trigger: 'popup',
  });
});

$('copyHash').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('resultHash').textContent);
  $('copyHash').textContent = 'Copied';
  setTimeout(() => { $('copyHash').textContent = 'Copy'; }, 1500);
});

$('openVerify').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('verify/verify.html') });
});
$('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'wn-progress') renderProgress(msg.state);
  else if (msg?.type === 'wn-done') { renderDone(msg.entry, msg.noTimestamp); renderHistory(); }
  else if (msg?.type === 'wn-error') renderError(msg.error);
  else if (msg?.type === 'wn-history-updated') renderHistory();
});

init();
