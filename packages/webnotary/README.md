# WebNotary — evidence-grade web capture

**A Chrome extension that turns "screenshot it" into evidence.** One click captures the page as
an MHTML archive plus a full-page screenshot, computes SHA-256 digests of every artifact,
obtains **RFC 3161 trusted timestamps** from independent time-stamping authorities, and packages
everything with a **chain-of-custody PDF** into a self-verifying evidence bundle — entirely
client-side. No account, no server, no telemetry.

**Who it's for:** solo/small-firm litigators, insurance adjusters, HR & compliance teams,
private investigators, brand-protection and IP teams — anyone who needs defensible captures but
is priced out of enterprise remote-browser services (Page Vault-class tools run $195–$10,000/mo).
WebNotary's technical bar — hash + qualified timestamp + archive + custody report, supporting
authentication under FRE 901(b)(9) and self-authentication under FRE 902(13)/(14) — is met with
open, independently verifiable standards.

## What a capture produces

One ZIP in `Downloads/WebNotary/`:

| File | Role |
|---|---|
| `report.pdf` | Human-readable chain-of-custody report: URLs, times, operator, digests, TSA tokens, verification steps, operator-declaration signature block, page preview. |
| `VERIFY.txt` | Plain-text verification guide with the exact `sha256sum` / `openssl ts` commands and expected values. |
| `capture.mhtml` | Complete page archive (DOM, styles, images, frames) via `chrome.pageCapture`. |
| `screenshot-fullpage.png` | Single atomic full-page render via the DevTools protocol (falls back to viewport). |
| `metadata.json` | Forensic context: request/final URLs, timings, user agent + client hints, viewport/page geometry, timezone, navigation timing, subresource list, iframes. |
| `evidence-manifest.json` | SHA-256 digest of each artifact. **The SHA-256 of this file is what gets timestamped.** |
| `timestamps/<tsa>.tsq/.tsr` | The exact RFC 3161 request (with nonce) and the TSA's signed response, per authority. |
| `timestamps/<tsa>-certs.pem` | Signer/intermediate certificates extracted from each token, for offline verification. |

The digest structure is two-level: artifacts → manifest → timestamp. One token therefore covers
every artifact, and any modification anywhere breaks verification.

## Trust model

- **Integrity** — SHA-256 digests computed locally with WebCrypto at capture time.
- **Existence by a fixed time** — each enabled TSA (FreeTSA and DigiCert by default; Sectigo,
  Certum, or any custom/eIDAS-qualified endpoint optional) signs the manifest digest + UTC time
  per RFC 3161. Two independent authorities = redundant time anchors. Only the 32-byte digest
  and a random nonce ever leave the machine.
- **Verification without WebNotary** — bundles verify with `sha256sum` + `openssl ts -verify`
  (commands and expected values are in `VERIFY.txt` and `report.pdf`). The extension also ships
  a **Verify page**: drop a bundle and it re-checks every digest, the CMS signature, the ESS
  signing-certificate binding, message imprint, and nonce — locally.
- **Honest limits** — client-side capture reflects the operator's session; tokens prove
  *what/when*, not *who served it* (the archive and metadata support that inference). Chain-of-
  trust to the TSA root is validated via the OpenSSL step, not inside the extension. All of this
  is stated in the report's *Scope & limitations* — no overclaiming.

## Install (developer / unpacked)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `packages/webnotary/extension/`.
3. Open any page → click the WebNotary icon → **Capture evidence** (or `Alt+Shift+S`, or the
   right-click menu). First capture: set your operator name in **Settings**.

Requires Chrome 116+. During a full-page screenshot Chrome shows its standard "started
debugging" bar for a moment; switch to viewport-only mode in Settings if you prefer.

## Architecture

```
extension/
  manifest.json         MV3; activeTab+scripting+pageCapture+debugger+downloads+storage+offscreen+contextMenus
  background.js         service worker — the capture pipeline (metadata → screenshot → MHTML →
                        hash → RFC 3161 (parallel TSAs) → PDF report → ZIP → download)
  offscreen.(html|js)   mints blob: URLs for downloads (workers can't createObjectURL); handoff via IndexedDB
  popup/                capture UI: matter/notes, live step progress, history, retry
  options/              operator identity, TSA toggles + custom endpoint (optional host permission), capture mode
  verify/               drag-and-drop bundle verifier (zip or loose files, re-zipped bundles OK)
  lib/
    asn1.js             DER encode/decode (definite-length; rejects BER indefinite)
    rfc3161.js          TSQ builder, TSR/CMS/TSTInfo parser, token verifier
                        (RSA PKCS#1 v1.5, RSA-PSS, ECDSA P-256/384/521; ESS certID v1/v2; nonce+imprint)
    x509.js             certificate parse (names, validity, SPKI, SKI) + PEM export
    hash.js             WebCrypto digests, hex/b64, CRC32, deterministic JSON
    zip.js              store-only writer (evidence stays byte-identical) + store/deflate reader
    pdf.js              minimal PDF 1.4 writer (core-14 fonts, JPEG embed, pagination)
    report.js           chain-of-custody PDF + VERIFY.txt builders
    idb.js, tsas.js, steps.js
```

Everything is vanilla ES modules — no build step, no dependencies. The same `lib/` files run in
the service worker, the extension pages, and Node (tests).

## Tests

```bash
cd packages/webnotary
npm test
```

24 tests, no framework. Highlights: the suite stands up a **real local TSA with OpenSSL**
(root CA + RSA and ECDSA P-256 signers), answers our own TSQ via `openssl ts -reply`, and runs
the extension's `verifyToken` against it — plus negative cases (wrong imprint, wrong nonce,
tampered TSTInfo), bare-token form, `openssl ts -verify` interop on our request, ZIP round-trips
validated by `unzip`/Python's `zipfile`, and structural PDF checks (xref offsets).

Regenerate icons with `npm run icons` (pure-Node PNG writer, no image deps).

## Roadmap

- OpenTimestamps (Bitcoin) as a free secondary anchor alongside RFC 3161
- Optional cloud escrow of bundles (Cloudflare R2/Supabase) for team custody + sharing
- Scheduled/recurring monitoring captures; batch capture of URL lists
- Native messaging helper for long-term archive formats (WACZ) and PDF/A reports
- eIDAS qualified-TSA presets and per-matter TSA policies

## Legal note

WebNotary produces records *designed to support* authentication of electronic evidence (e.g.,
FRE 901(b)(9), 902(13), 902(14)) — admissibility is always determined by the tribunal. Nothing
in this repository or its output is legal advice.
