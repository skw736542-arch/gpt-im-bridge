# Public release checklist

Release: 0.9.0-alpha.1. Publish as an experimental pre-release with the limitations below, not as an all-platform finished product.

## Completed locally

- MIT license, dependency inventory, retained upstream notices, attribution of reference projects and removal of user-supplied artwork.
- No live .env, SQLite, models, virtual environments, account IDs or private application details in the source selection.
- Fresh Windows dependency installation, typecheck, 38 program tests, build, fresh runtime/login/persistence checks.
- Browser checks at 1440/768/390 widths.
- Fresh Python media environment, pip compatibility check and 10 real decoder checks.
- Fresh Ubuntu 24.04 installation with Node 24.15: typecheck, 38 tests, build and first-run/restart persistence checks. Platform-specific package downloads required a cache-assisted retry.
- Docker callback configuration repaired: container listener plus loopback-only 1455 publication, with a dedicated integration check. Local Docker image download was blocked by Docker Hub connectivity; hosted CI must supply the actual container result.

## Explicit remaining acceptance

- Real new QQ image, document, sticker and video messages: awaiting user result. A willingness to test is not a passed test.
- New local voice installer on another fresh GPU machine: not verified. Local inference on the original deployment and installer syntax checks are separate evidence.
- Docker real OpenAI account token exchange is not covered by a synthetic wrong-state callback check.
- Online GitHub Actions results must be checked after upload; do not claim success in advance.

Authentication and privacy boundaries are in AUTHENTICATION.md and PRIVACY.md. The separate CLI account and external gateway/worker credentials are not all stored in one encrypted database. No OpenAI program approval is claimed.

Only the reviewed source selection may be uploaded. Old local deployment ZIPs may contain historical account metadata and are not the public release artifact.
