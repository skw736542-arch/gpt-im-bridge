# Third-party notices and provenance

LICENSE applies to this project's own code. External programs, dependencies, fonts, model weights and services retain their own licenses. QQ clients, gateways, Codex CLI, CUDA libraries and downloaded model weights are not redistributed.

## Dependency records

- Pi AI 1.4.0: MIT; model catalog, OAuth and inference. Upstream notice: third-party/references/pi-LICENSE.txt.
- Fastify and plugins, qrcode, zod, the QQ SDK, silk-wasm and development tools: exact locked versions, declared licenses and retained notices are recorded in third-party/dependencies.json and third-party/npm.
- Geist: Copyright 2024 The Geist Project Authors, SIL OFL 1.1; full notice at public/fonts/OFL.txt.
- Python: pinned in requirements-voice.txt; optional Qwen in requirements-qwen.txt, with separately installed CUDA PyTorch. Pillow, pypdf, openpyxl, PyAV, edge-tts, faster-whisper, CTranslate2 and other dependencies retain upstream licenses. A wrapper's license does not necessarily cover bundled codecs.
- Qwen/Whisper model weights are downloaded separately under upstream terms, not included in this source release.

Run `npm run licenses` after npm ci to regenerate the npm inventory. Packages absent on the current platform are marked as not installed; license metadata is not a substitute for inspecting binaries before redistributing them. This source release excludes node_modules.

## Reference projects

- [earendil-works/pi](https://github.com/earendil-works/pi): actual dependency and documented authentication/model APIs.
- [XavierJiezou/codex-weixin](https://github.com/XavierJiezou/codex-weixin): earlier discovery/reference for personal WeChat integration. Its MIT notice is retained at third-party/references/codex-weixin-LICENSE.txt. This project is not its official fork and does not claim the general integration concept as exclusively original.
- [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge): reference for OneBot bridging and contextual initiative. The original qg-bridge link could not be fetched during this review; the accessible qq-bridge project is credited. Its DSH implementation and credentials are not bundled.
- [OneBot v11](https://github.com/botuniverse/onebot-11): public action/event and record-message protocol.

The project was assembled and iterated with Codex assistance for a local deployment. Pre-public development history is not a complete upstream provenance audit. Report any omitted attribution with the exact file and source so it can be corrected; the initial Git commit is not evidence of exclusive authorship.

## External boundaries

SnowLuma/NapCat are independently obtained gateways. Review their own licenses and conditions; this project's MIT license grants no rights to their code or proprietary components. Setup scripts do not install these gateways.

Codex CLI is separately installed and logged in. Pi OAuth does not authorize it. OpenRouter is a separate optional billed provider. Microsoft Edge speech is an external service receiving synthesis text. Local Qwen and Whisper do not turn those services into GPT subscription audio endpoints.

The original user-provided character artwork is excluded. The simple SVG avatar was drawn for this repository and is covered by MIT.
