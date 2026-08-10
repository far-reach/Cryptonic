// Capture pipeline steps — shared by the service worker (progress reporting)
// and the popup (progress rendering).

export const STEPS = [
  ['meta', 'Collecting page metadata'],
  ['shot', 'Capturing screenshot'],
  ['mhtml', 'Archiving page (MHTML)'],
  ['hash', 'Computing SHA-256 digests'],
  ['tsa', 'Requesting trusted timestamps'],
  ['report', 'Building chain-of-custody report'],
  ['bundle', 'Packaging evidence bundle'],
  ['save', 'Saving to Downloads'],
];
