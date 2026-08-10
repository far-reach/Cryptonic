// WebNotary service worker: orchestrates capture → hash → timestamp → report →
// bundle → download, and owns the badge, capture history, and progress state.

import { sha256, bytesToHex, utf8, stableStringify, base64ToBytes } from './lib/hash.js';
import { buildTimeStampReq, fetchTimestamp, verifyToken } from './lib/rfc3161.js';
import { certToPem } from './lib/x509.js';
import { createZip } from './lib/zip.js';
import { buildReportPdf, buildVerifyTxt } from './lib/report.js';
import { idbPut, idbDelete, idbPrune, idbGet } from './lib/idb.js';
import { mergeSettings, enabledTsas } from './lib/tsas.js';

let captureInFlight = false;

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function getSettings() {
  const { wn_settings } = await chrome.storage.sync.get('wn_settings');
  return mergeSettings(wn_settings);
}

function badge(text, color = '#14532d', clearMs = 0) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  if (clearMs) setTimeout(() => chrome.action.setBadgeText({ text: '' }), clearMs);
}

function makeFileName(host, date, id) {
  const p = (v) => String(v).padStart(2, '0');
  const stamp = `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
  const safeHost = (host || 'page').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 60) || 'page';
  return `${stamp}_${safeHost}_${id.slice(0, 8)}.zip`;
}

// ---------------------------------------------------------------------------
// Page metadata collector — injected into the page, must be self-contained.
// ---------------------------------------------------------------------------

async function collectPageMetadata() {
  const t = (fn) => { try { return fn(); } catch { return null; } };
  const out = {};
  out.location = t(() => ({ href: location.href, origin: location.origin }));
  out.document = t(() => ({
    title: document.title,
    characterSet: document.characterSet,
    contentType: document.contentType,
    lastModified: document.lastModified,
    referrer: document.referrer || null,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
  }));
  out.meta = t(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    description: document.querySelector('meta[name="description"]')?.content?.slice(0, 500) ?? null,
  }));
  out.dimensions = t(() => ({
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    pageWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    pageHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    devicePixelRatio: devicePixelRatio,
    screenWidth: screen.width,
    screenHeight: screen.height,
    colorDepth: screen.colorDepth,
  }));
  out.browser = t(() => ({
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: Array.from(navigator.languages ?? []),
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    brands: navigator.userAgentData?.brands ?? null,
  }));
  try {
    out.browser.highEntropy = await navigator.userAgentData?.getHighEntropyValues(
      ['platform', 'platformVersion', 'architecture', 'uaFullVersion', 'fullVersionList'],
    ) ?? null;
  } catch { out.browser.highEntropy = null; }
  out.timezone = t(() => ({
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: -new Date().getTimezoneOffset(),
    localTime: new Date().toString(),
  }));
  out.navigationTiming = t(() => {
    const n = performance.getEntriesByType('navigation')[0];
    if (!n) return null;
    return {
      type: n.type,
      protocol: n.nextHopProtocol || null,
      responseStatus: n.responseStatus ?? null,
      redirectCount: n.redirectCount,
      transferSize: n.transferSize,
      encodedBodySize: n.encodedBodySize,
      decodedBodySize: n.decodedBodySize,
      domContentLoadedMs: Math.round(n.domContentLoadedEventEnd),
      loadEventMs: Math.round(n.loadEventEnd),
    };
  });
  out.resources = t(() => {
    const rs = performance.getEntriesByType('resource');
    return {
      count: rs.length,
      truncated: rs.length > 1500,
      entries: rs.slice(0, 1500).map((r) => ({
        url: r.name.slice(0, 2000),
        type: r.initiatorType,
        protocol: r.nextHopProtocol || null,
        transferSize: r.transferSize,
      })),
    };
  });
  out.frames = t(() => Array.from(document.querySelectorAll('iframe'))
    .slice(0, 100).map((f) => (f.src || '').slice(0, 500)).filter(Boolean));
  return out;
}

// ---------------------------------------------------------------------------
// Screenshot capture
// ---------------------------------------------------------------------------

async function pngDims(bytes) {
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const d = { width: bmp.width, height: bmp.height };
    bmp.close();
    return d;
  } catch {
    return { width: null, height: null };
  }
}

// Full-page capture via the DevTools protocol: a single atomic render of the
// whole document, no scroll-and-stitch artifacts. Shows Chrome's debugging
// infobar for the second or two we stay attached.
async function captureFullPage(tabId) {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');
  try {
    const metrics = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics');
    const size = metrics.cssContentSize ?? metrics.contentSize;
    const width = Math.min(Math.max(1, Math.ceil(size.width)), 8192);
    const fullHeight = Math.max(1, Math.ceil(size.height));
    const height = Math.min(fullHeight, 16384); // GPU texture limit guard
    const res = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    const bytes = base64ToBytes(res.data);
    const dims = await pngDims(bytes);
    return { bytes, mode: 'fullpage', truncated: fullHeight > height, cssWidth: width, cssHeight: height, ...dims };
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function captureViewport(windowId) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bytes = base64ToBytes(dataUrl.split(',')[1]);
  const dims = await pngDims(bytes);
  return { bytes, mode: 'viewport', truncated: false, cssWidth: null, cssHeight: null, ...dims };
}

async function captureMhtml(tabId) {
  return new Promise((resolve, reject) => {
    chrome.pageCapture.saveAsMHTML({ tabId }, (blob) => {
      const err = chrome.runtime.lastError;
      if (err || !blob) reject(new Error(err?.message ?? 'MHTML capture returned no data'));
      else resolve(blob);
    });
  });
}

async function makeJpegPreview(pngBytes) {
  const bmp = await createImageBitmap(new Blob([pngBytes], { type: 'image/png' }));
  const scale = Math.min(1000 / bmp.width, 7000 / bmp.height, 1);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

// ---------------------------------------------------------------------------
// Timestamping
// ---------------------------------------------------------------------------

async function requestOneTimestamp(tsa, imprint) {
  const t0 = Date.now();
  try {
    const { tsq, nonceHex } = buildTimeStampReq(imprint);
    const tsr = await fetchTimestamp(tsa.url, tsq);
    const verdict = await verifyToken(tsr, { expectedImprint: imprint, expectedNonceHex: nonceHex });
    if (!verdict.statusInfo?.granted) {
      throw new Error(verdict.checks.find((c) => c.id === 'status')?.detail || 'TSA rejected the request');
    }
    if (!verdict.tstInfo) throw new Error('response contained no timestamp token');
    for (const critical of ['imprint', 'nonce']) {
      const c = verdict.checks.find((ch) => ch.id === critical);
      if (c && !c.ok) throw new Error(`token failed ${critical} check`);
    }
    const tst = verdict.tstInfo;
    return {
      id: tsa.id, name: tsa.name, url: tsa.url, caNote: tsa.caNote ?? null, ok: true,
      tsq, tsr,
      certsPem: verdict.certificates.map((c) => certToPem(c)).join(''),
      genTime: tst.genTime.iso,
      serialHex: tst.serialHex,
      policyOid: tst.policyOid,
      accuracy: tst.accuracy,
      signerSubject: verdict.signerCert?.subject.text ?? null,
      signerIssuer: verdict.signerCert?.issuer.text ?? null,
      signatureVerified: verdict.checks.find((c) => c.id === 'signature')?.ok ?? false,
      allChecksOk: verdict.ok,
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { id: tsa.id, name: tsa.name, url: tsa.url, caNote: tsa.caNote ?? null, ok: false, error: String(e?.message ?? e), ms: Date.now() - t0 };
  }
}

// ---------------------------------------------------------------------------
// Offscreen document: blob-URL minting for chrome.downloads
// ---------------------------------------------------------------------------

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Create an object URL so the evidence bundle ZIP can be saved via chrome.downloads.',
    });
  } catch (e) {
    if (!String(e?.message).includes('single offscreen')) throw e;
  }
}

async function downloadBundle(captureId, fileName) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ type: 'wn-offscreen-make-url', id: captureId });
  if (!res?.ok) throw new Error(res?.error ?? 'could not prepare bundle for download');
  const downloadId = await chrome.downloads.download({
    url: res.url,
    filename: `WebNotary/${fileName}`,
    conflictAction: 'uniquify',
    saveAs: false,
  });
  const { wn_pending = {} } = await chrome.storage.session.get('wn_pending');
  wn_pending[downloadId] = captureId;
  await chrome.storage.session.set({ wn_pending });
  return downloadId;
}

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state) return;
  const { wn_pending = {} } = await chrome.storage.session.get('wn_pending');
  const captureId = wn_pending[delta.id];
  if (!captureId) return;
  if (delta.state.current === 'complete') {
    delete wn_pending[delta.id];
    await chrome.storage.session.set({ wn_pending });
    chrome.runtime.sendMessage({ type: 'wn-offscreen-revoke', id: captureId }).catch(() => {});
    await idbDelete(captureId).catch(() => {});
    await updateHistoryEntry(captureId, { state: 'saved' });
    broadcast({ type: 'wn-history-updated' });
  } else if (delta.state.current === 'interrupted') {
    delete wn_pending[delta.id];
    await chrome.storage.session.set({ wn_pending });
    // Keep the bundle in IndexedDB so the popup can offer a retry.
    await updateHistoryEntry(captureId, { state: 'download-failed' });
    broadcast({ type: 'wn-history-updated' });
  }
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

async function pushHistoryEntry(entry) {
  const { wn_history = [] } = await chrome.storage.local.get('wn_history');
  wn_history.unshift(entry);
  await chrome.storage.local.set({ wn_history: wn_history.slice(0, 50) });
}

async function updateHistoryEntry(id, patch) {
  const { wn_history = [] } = await chrome.storage.local.get('wn_history');
  const idx = wn_history.findIndex((e) => e.id === id);
  if (idx >= 0) {
    wn_history[idx] = { ...wn_history[idx], ...patch };
    await chrome.storage.local.set({ wn_history });
  }
}

// ---------------------------------------------------------------------------
// The capture pipeline
// ---------------------------------------------------------------------------

async function startCapture(tabId, opts = {}) {
  if (captureInFlight) {
    broadcast({ type: 'wn-error', error: 'A capture is already in progress.' });
    return;
  }
  captureInFlight = true;
  const id = crypto.randomUUID();
  const started = new Date();
  let stepsState = {};
  let tab = null;

  const setStep = async (step, st, detail = null) => {
    stepsState = { ...stepsState, [step]: st };
    const state = {
      id, tabId,
      url: tab?.url ?? null,
      title: tab?.title ?? null,
      startedUtc: started.toISOString(),
      steps: stepsState,
      detail,
    };
    await chrome.storage.session.set({ wn_active: state });
    broadcast({ type: 'wn-progress', state });
  };

  try {
    badge('•', '#1e3a8a');
    tab = await chrome.tabs.get(tabId);
    const u = new URL(tab.url ?? 'about:blank');
    if (!['http:', 'https:', 'file:'].includes(u.protocol)) {
      throw new Error(`Pages at ${u.protocol}// URLs cannot be captured. Open a regular web page and try again.`);
    }
    const settings = await getSettings();
    const version = chrome.runtime.getManifest().version;

    // 1. Page metadata
    await setStep('meta', 'run');
    let pageMeta = null;
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId }, func: collectPageMetadata });
      pageMeta = results?.[0]?.result ?? null;
    } catch { /* e.g. no file-URL access; capture continues with less metadata */ }
    await setStep('meta', pageMeta ? 'ok' : 'warn', pageMeta ? null : 'Page scripting unavailable; capturing with reduced metadata.');

    // 2. Screenshot
    await setStep('shot', 'run');
    let shot = null;
    let shotError = null;
    if (settings.screenshotMode === 'fullpage') {
      try { shot = await captureFullPage(tabId); } catch (e) { shotError = e; }
    }
    if (!shot) {
      try { shot = await captureViewport(tab.windowId); } catch (e) { shotError = shotError ?? e; }
    }
    const shotName = shot ? (shot.mode === 'fullpage' ? 'screenshot-fullpage.png' : 'screenshot-viewport.png') : null;
    await setStep('shot', shot ? (shot.mode === 'fullpage' || settings.screenshotMode === 'viewport' ? 'ok' : 'warn') : 'warn',
      shot ? (shot.mode === 'fullpage' ? null : 'Full-page capture unavailable; captured visible viewport instead.')
        : `Screenshot failed: ${shotError?.message ?? 'unknown error'}`);

    // 3. MHTML archive
    await setStep('mhtml', 'run');
    let mhtmlBytes;
    try {
      const blob = await captureMhtml(tabId);
      mhtmlBytes = new Uint8Array(await blob.arrayBuffer());
    } catch (e) {
      throw new Error(`This page cannot be archived as MHTML (${e.message}). PDF-viewer and browser-internal pages are not capturable.`);
    }
    await setStep('mhtml', 'ok');

    // 4. Metadata + digests + manifest
    await setStep('hash', 'run');
    const completed = new Date();
    const metadata = {
      format: 'webnotary-capture-metadata',
      formatVersion: 1,
      captureId: id,
      tool: { name: 'WebNotary', version, serviceWorkerUserAgent: navigator.userAgent },
      request: { url: tab.url, title: tab.title ?? null, trigger: opts.trigger ?? 'popup' },
      times: { startedUtc: started.toISOString(), completedUtc: completed.toISOString(), startedEpochMs: started.getTime() },
      operator: {
        name: settings.operatorName || null,
        organization: settings.organization || null,
        matter: opts.matter || null,
        notes: opts.notes || null,
      },
      page: pageMeta,
      capture: {
        screenshot: shot ? {
          file: shotName,
          mode: shot.mode,
          truncated: shot.truncated,
          pixelWidth: shot.width,
          pixelHeight: shot.height,
          cssWidth: shot.cssWidth,
          cssHeight: shot.cssHeight,
          bytes: shot.bytes.length,
        } : null,
        mhtmlBytes: mhtmlBytes.length,
      },
    };
    const metadataBytes = utf8(stableStringify(metadata));

    const files = {};
    const artifacts = [];
    const addArtifact = async (name, bytes) => {
      const hex = bytesToHex(await sha256(bytes));
      files[name] = hex;
      artifacts.push({ name, bytes, sha256: hex });
    };
    await addArtifact('capture.mhtml', mhtmlBytes);
    if (shot) await addArtifact(shotName, shot.bytes);
    await addArtifact('metadata.json', metadataBytes);

    const manifest = {
      format: 'webnotary-evidence-manifest',
      formatVersion: 1,
      captureId: id,
      createdUtc: completed.toISOString(),
      hashAlgorithm: 'SHA-256',
      files,
      note: 'The SHA-256 digest of this file, byte-for-byte, is the message imprint submitted to each RFC 3161 time-stamping authority recorded in report.pdf and the timestamps/ directory.',
    };
    const manifestBytes = utf8(stableStringify(manifest));
    const manifestHash = await sha256(manifestBytes);
    const manifestHashHex = bytesToHex(manifestHash);
    await setStep('hash', 'ok');

    // 5. RFC 3161 timestamps (all enabled TSAs, in parallel)
    await setStep('tsa', 'run');
    const tsaList = enabledTsas(settings);
    let tsaResults = [];
    if (tsaList.length) {
      tsaResults = await Promise.all(tsaList.map((t) => requestOneTimestamp(t, manifestHash)));
    }
    const okTs = tsaResults.filter((r) => r.ok);
    await setStep('tsa',
      okTs.length === tsaResults.length && okTs.length > 0 ? 'ok' : okTs.length > 0 ? 'warn' : 'warn',
      okTs.length === 0
        ? (tsaList.length ? 'All time-stamping authorities failed — bundle will carry hashes but no trusted timestamp.' : 'No TSAs enabled in settings.')
        : okTs.length < tsaResults.length ? `${okTs.length}/${tsaResults.length} TSAs granted a timestamp.` : null);

    // 6. Report + VERIFY.txt
    await setStep('report', 'run');
    let preview = null;
    if (shot) preview = await makeJpegPreview(shot.bytes).catch(() => null);
    const dims = pageMeta?.dimensions;
    const reportModel = {
      captureId: id,
      tool: { name: 'WebNotary', version },
      url: tab.url,
      finalUrl: pageMeta?.location?.href ?? null,
      title: tab.title ?? pageMeta?.document?.title ?? null,
      times: {
        startedUtc: started.toISOString(),
        completedUtc: completed.toISOString(),
        timezone: pageMeta?.timezone ?? null,
      },
      operator: metadata.operator,
      artifacts: artifacts.map((a) => ({ name: a.name, size: a.bytes.length, sha256: a.sha256 })),
      manifestSha256: manifestHashHex,
      timestamps: tsaResults,
      environment: {
        userAgent: pageMeta?.browser?.userAgent ?? navigator.userAgent,
        platform: pageMeta?.browser?.highEntropy?.platform
          ? `${pageMeta.browser.highEntropy.platform} ${pageMeta.browser.highEntropy.platformVersion ?? ''}`.trim()
          : pageMeta?.browser?.platform ?? null,
        viewport: dims ? `${dims.viewportWidth} × ${dims.viewportHeight} CSS px` : null,
        pageDims: dims ? `${dims.pageWidth} × ${dims.pageHeight} CSS px` : null,
        devicePixelRatio: dims?.devicePixelRatio ?? null,
        screenshotDesc: shot
          ? `${shot.mode === 'fullpage' ? 'Full page' : 'Visible viewport'}, ${shot.width} × ${shot.height} px PNG${shot.truncated ? ' (page taller than capture limit; truncated)' : ''}`
          : `not captured${shotError ? ` (${shotError.message})` : ''}`,
        contentType: pageMeta?.document?.contentType ?? null,
        charset: pageMeta?.document?.characterSet ?? null,
        lastModified: pageMeta?.document?.lastModified ?? null,
        referrer: pageMeta?.document?.referrer ?? null,
        protocol: pageMeta?.navigationTiming?.protocol ?? null,
        transferSize: pageMeta?.navigationTiming?.transferSize ?? null,
        resourceCount: pageMeta?.resources?.count ?? null,
        resourcesTruncated: pageMeta?.resources?.truncated ?? false,
        frameCount: pageMeta?.frames?.length ?? null,
      },
      preview,
      screenshotName: shotName,
      screenshotTruncated: shot?.truncated ?? false,
    };
    const reportBytes = buildReportPdf(reportModel);
    const verifyTxt = buildVerifyTxt(reportModel);
    await setStep('report', 'ok');

    // 7. Bundle
    await setStep('bundle', 'run');
    const entries = [
      { name: 'report.pdf', data: reportBytes, date: completed },
      { name: 'VERIFY.txt', data: utf8(verifyTxt), date: completed },
      { name: 'evidence-manifest.json', data: manifestBytes, date: completed },
    ];
    for (const a of artifacts) entries.push({ name: a.name, data: a.bytes, date: completed });
    for (const r of tsaResults) {
      if (!r.ok) continue;
      entries.push({ name: `timestamps/${r.id}.tsq`, data: r.tsq, date: completed });
      entries.push({ name: `timestamps/${r.id}.tsr`, data: r.tsr, date: completed });
      if (r.certsPem) entries.push({ name: `timestamps/${r.id}-certs.pem`, data: utf8(r.certsPem), date: completed });
    }
    const zipBytes = createZip(entries);
    await setStep('bundle', 'ok');

    // 8. Save
    await setStep('save', 'run');
    const fileName = makeFileName(u.hostname, completed, id);
    await idbPut({ id, blob: new Blob([zipBytes], { type: 'application/zip' }), name: fileName, createdMs: Date.now() });
    const downloadId = await downloadBundle(id, fileName);
    await setStep('save', 'ok');

    const entry = {
      id,
      url: tab.url,
      title: tab.title ?? '',
      host: u.hostname,
      capturedUtc: completed.toISOString(),
      manifestSha256: manifestHashHex,
      fileName: `WebNotary/${fileName}`,
      size: zipBytes.length,
      timestamps: okTs.map((r) => ({ name: r.name, genTime: r.genTime })),
      tsFailures: tsaResults.length - okTs.length,
      state: 'saving',
      downloadId,
    };
    await pushHistoryEntry(entry);
    await chrome.storage.session.remove('wn_active');
    broadcast({ type: 'wn-done', entry, noTimestamp: okTs.length === 0 });
    badge(okTs.length ? '✓' : '!', okTs.length ? '#14532d' : '#92400e', 6000);
  } catch (e) {
    console.error('[WebNotary] capture failed:', e);
    await chrome.storage.session.remove('wn_active');
    broadcast({ type: 'wn-error', error: String(e?.message ?? e) });
    badge('!', '#b91c1c', 8000);
  } finally {
    captureInFlight = false;
  }
}

async function redownload(captureId) {
  const rec = await idbGet(captureId);
  if (!rec) return { ok: false, error: 'This bundle is no longer stored locally (it is removed after a successful save).' };
  const downloadId = await downloadBundle(captureId, rec.name);
  await updateHistoryEntry(captureId, { state: 'saving', downloadId });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'wn-capture') {
    startCapture(msg.tabId, { matter: msg.matter, notes: msg.notes, trigger: msg.trigger ?? 'popup' });
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === 'wn-redownload') {
    redownload(msg.id)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'capture-evidence' && tab?.id != null) {
    startCapture(tab.id, { trigger: 'keyboard-shortcut' });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'wn-capture',
    title: 'Capture this page as evidence',
    contexts: ['page'],
  }, () => void chrome.runtime.lastError);
  idbPrune(7 * 24 * 3600 * 1000).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wn-capture' && tab?.id != null) {
    startCapture(tab.id, { trigger: 'context-menu' });
  }
});
