# Delivery — 0.9.0-alpha.1

Start with README.md. This is an experimental source release with locked Node dependencies, base Python requirements, optional local Qwen setup, tests and Docker core configuration.

Install dependencies and build on the target machine. The GitHub source archive excludes dist, node_modules, virtual environments, downloaded models and runtime data. The separately prepared release ZIP may include built dist files and a SHA-256 manifest.

No .env, OAuth credentials, QQ gateway token, personal memory, custom user artwork, external QQ client/gateway or model weights are shipped. For an existing deployment, preserve the original .env and data and never overwrite them with a fresh installation.

Ordinary QQ uses an independently installed compatible OneBot gateway. Official QQ uses an application. Neither is the same as ChatGPT OAuth or the management password.

See ACCEPTANCE.md for actual checks and pending phone/GPU acceptance. See AUTHENTICATION.md, PRIVACY.md and THIRD_PARTY_NOTICES.md before enabling external services.
