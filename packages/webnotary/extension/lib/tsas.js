// Built-in RFC 3161 time-stamping authorities and the settings schema.
// Pure data + merge helpers (no chrome.*) so options, background, and tests
// share one source of truth.

export const BUILTIN_TSAS = [
  {
    id: 'freetsa',
    name: 'FreeTSA',
    url: 'https://freetsa.org/tsr',
    caNote: 'https://freetsa.org/files/cacert.pem',
    blurb: 'Free community TSA, HTTPS endpoint.',
  },
  {
    id: 'digicert',
    name: 'DigiCert',
    url: 'https://timestamp.digicert.com',
    caNote: 'DigiCert Trusted Root G4 — https://cacerts.digicert.com/',
    blurb: 'Commercial CA’s public timestamp service.',
  },
  {
    id: 'sectigo',
    name: 'Sectigo',
    url: 'https://timestamp.sectigo.com',
    caNote: 'Sectigo/AAA roots — https://www.sectigo.com/',
    blurb: 'Commercial CA’s public timestamp service.',
  },
  {
    id: 'certum',
    name: 'Certum',
    url: 'http://time.certum.pl',
    caNote: 'Certum Trusted Network CA — https://www.certum.eu/',
    blurb: 'EU (eIDAS-listed) provider. Plain-HTTP endpoint: only the 32-byte digest travels, and token integrity comes from the TSA signature, not the transport.',
  },
];

export const DEFAULT_SETTINGS = {
  operatorName: '',
  organization: '',
  screenshotMode: 'fullpage', // 'fullpage' (chrome.debugger) | 'viewport' (captureVisibleTab)
  tsaEnabled: { freetsa: true, digicert: true, sectigo: false, certum: false },
  customTsa: { enabled: false, url: '' },
};

export function mergeSettings(stored) {
  const s = stored ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    tsaEnabled: { ...DEFAULT_SETTINGS.tsaEnabled, ...(s.tsaEnabled ?? {}) },
    customTsa: { ...DEFAULT_SETTINGS.customTsa, ...(s.customTsa ?? {}) },
  };
}

export function enabledTsas(settings) {
  const list = BUILTIN_TSAS.filter((t) => settings.tsaEnabled[t.id]);
  if (settings.customTsa.enabled && /^https?:\/\//.test(settings.customTsa.url)) {
    list.push({ id: 'custom', name: 'Custom TSA', url: settings.customTsa.url.trim(), caNote: null, blurb: '' });
  }
  return list;
}
