# Contributing

Use Node.js 24.15 or newer. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:release`. Browser tests use `npm run test:ui`; install Chromium with `npx playwright install chromium` if no local browser is available. Set UI_TEST_SKIP_OAUTH=1 to avoid interfering with an existing local OAuth login.

Use temporary credentials and mock gateways in tests. Do not attach real messages, account IDs, authorization URLs, tokens, .env files or database dumps to issues or PRs. Report security findings using SECURITY.md.

Describe the concrete problem, changed behavior and validation. Preserve whitelist checks before downloads and sends, explicit provider billing, memory confirmation, and account isolation. A model's output cannot authorize a new recipient or provider. New media decoders must enforce size/duration limits and treat content as untrusted data.

Contributions to this repository are under the MIT license. Credit adapted code and retain upstream notices. External gateways, model weights and services retain their own licenses; do not add their binaries to this repository.
