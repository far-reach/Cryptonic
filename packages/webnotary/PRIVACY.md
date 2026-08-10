# WebNotary privacy policy

_Last updated: 2026-08-10_

WebNotary is built so that your captures are nobody's business but yours.

## What WebNotary processes

When you explicitly start a capture, the extension processes — **entirely on your device** —
the current page's content (MHTML archive, screenshot), page metadata (URL, title, timings,
browser/user-agent details, viewport geometry, timezone, subresource URLs), and the operator
details you typed into the extension (name, organization, matter, notes). These become the
evidence bundle saved to your own Downloads folder.

## What leaves your device

Exactly one thing, and only during a capture: a **32-byte SHA-256 digest** of the bundle's
manifest plus a random nonce, sent to the RFC 3161 time-stamping authorities you enabled in
Settings (defaults: FreeTSA, DigiCert). A digest is mathematically irreversible — it reveals
nothing about the page content. The TSA's signed response is stored in your bundle. Their
processing of that request is governed by the respective TSA's terms.

## What WebNotary does NOT do

- No accounts, no sign-in.
- No analytics, telemetry, or crash reporting.
- No remote servers of ours — captures, reports, and verification all run locally.
- No reading of browsing activity outside an explicit capture (the extension uses `activeTab`
  and only touches the tab you invoked it on).
- No sale or sharing of any data. We never see your data in the first place.

## Storage

Capture history (URL, title, digest, timestamps) and your settings are stored in Chrome's
extension storage on your device (and, for settings, Chrome's own sync if you use it). Finished
bundles are staged briefly in extension-local IndexedDB until the download completes, then
deleted. You can clear everything by removing the extension.

## Contact

Questions: open an issue on the repository.
