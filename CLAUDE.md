# Cryptonic — repo conventions

- This repository is the **VEIL monorepo** (confidential-payments network). The
  `packages/*` workspaces belong to that one product family and share tooling.
- **One product per repo.** Unrelated products must NOT be added here — create a
  separate GitHub repository per product instead (public when it needs public
  docs such as a Chrome Web Store privacy-policy URL). Existing examples:
  - WebNotary → https://github.com/far-reach/webnotary (split out of PR #25)
  - Honest Web → https://github.com/far-reach/honestweb
- When creating a product repo, follow the pattern those two use: loadable code
  in `extension/` (or `src/`), README, PRIVACY.md, LICENSE, `docs/STORE_LISTING.md`
  for store submissions, store-submitted packages preserved in `release/`, and a
  CLAUDE.md with the product's own conventions.
- Note: the Claude GitHub App is installed with "Only select repositories" —
  a newly created repo must be added to the app's repository access before
  sessions can push to it, and repo creation itself must be done by a human.
