# Chrome Web Store listing (draft)

## Name
WebNotary — Evidence-Grade Web Capture

## Summary (132 chars max)
Tamper-evident web capture: MHTML + screenshot, SHA-256 digests, RFC 3161 trusted timestamps, chain-of-custody PDF. 100% local.

## Description

**Turn "screenshot it" into evidence.**

One click captures the page in front of you as a self-verifying evidence bundle:

✔ Complete MHTML archive of the page (DOM, styles, images, frames)
✔ Full-page screenshot (single atomic render — no scroll-stitching artifacts)
✔ SHA-256 digest of every artifact, tied together in an evidence manifest
✔ RFC 3161 trusted timestamps from independent authorities (FreeTSA + DigiCert by default;
  Sectigo, Certum, or your own eIDAS-qualified TSA optional)
✔ Chain-of-custody PDF report with verification instructions and a signature block
✔ Forensic metadata: URLs, timings, browser fingerprint, timezone, subresource list

Everything happens locally in your browser. The only bytes that ever leave your machine are a
32-byte hash sent to the timestamp authorities — never the page, never your data. No account.
No subscription server. Bundles verify forever with standard tools (`sha256sum`, `openssl ts`)
or the built-in drag-and-drop Verify page.

**Built for people who need defensible captures without enterprise pricing:** solo and
small-firm litigators, insurance adjusters and SIU teams, HR and compliance, private
investigators, IP and brand-protection teams, journalists.

**Designed to support authentication of electronic evidence** — the hash + trusted timestamp +
documented automated process aligns with FRE 901(b)(9) and the self-authentication routes of
FRE 902(13)/(14) (certification by a qualified person; digital identification by hashing).
Admissibility is always up to the tribunal; WebNotary is not legal advice.

## Category
Productivity → Tools (or Workflow & Planning)

## Permission justifications (for the review form)

| Permission | Why it is needed |
|---|---|
| `activeTab`, `scripting` | Read the page's metadata (title, timings, dimensions, resource list) for the capture the user explicitly triggered. No background access to browsing. |
| `pageCapture` | Produce the MHTML archive of the captured tab. |
| `debugger` | One atomic full-page screenshot via `Page.captureScreenshot` (attached only for the seconds of the capture; the user can switch to viewport-only mode in Settings, which never attaches). |
| `downloads` | Save the evidence bundle ZIP to Downloads/WebNotary. |
| `storage` | Settings, capture history, and in-flight progress state. |
| `offscreen` | Service workers cannot create object URLs; the offscreen document turns the finished bundle into a downloadable blob URL. |
| `contextMenus` | The "Capture this page as evidence" right-click entry. |
| Host permissions (freetsa.org, timestamp.digicert.com, timestamp.sectigo.com, time.certum.pl) | POST the 32-byte digest to the RFC 3161 time-stamping authorities. |
| Optional host permissions (`http(s)://*/*`) | Only requested if the user configures a custom/eIDAS TSA endpoint, and only for that origin. |

## Privacy disclosures
- Collects/transmits: nothing except the SHA-256 digest + nonce to the user-chosen TSAs.
- No analytics, no remote code, no accounts. See PRIVACY.md.
