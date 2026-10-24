# Acceptance evidence — 0.9.0-alpha.1

Date: 2026-10-24. Results are scoped, not a claim of universal compatibility.

| Check | Result |
| --- | --- |
| Windows fresh npm installation | Passed in an isolated release directory |
| Typecheck / 38 program tests / build | Passed on Windows and Ubuntu 24.04, Node 24.15 |
| Fresh runtime | Login, CSRF, model catalog, bundled assets and configuration after restart passed on both OS environments |
| Browser | 1440 / 768 / 390 px passed; temporary test database, no real account |
| Python media environment | Fresh venv installation and pip check passed |
| Real file decoding | 10 checks: PNG, GIF, text, rejected executable, DOCX, XLSX, PDF, encrypted PDF rejection, MP4 frames/audio |
| npm advisories | 0 known advisories in the current audit; does not cover Python, gateways or undisclosed issues |
| Local Qwen installer | Syntax checked; fresh second-machine GPU installation not completed |
| Docker | Callback mapping fixed; local image pull blocked by registry networking, hosted run pending |
| New QQ media on phone | User agreed to test; item-by-item results pending |

## Earlier local deployment evidence

The user completed ChatGPT OAuth and confirmed text replies in WeChat. A saved Pi OAuth model request and vision request succeeded. Codex CLI built-in image generation returned actual PNGs in two requests, approximately 63 and 112 seconds. These were local CLI results, not proof of QQ image delivery.

The user confirmed native QQ voice could be received and played. Optional local Qwen inference and SILK conversion succeeded on the original GPU environment; naturalness and Taiwan accent remain subjective audition requirements. No phone pass is inferred for a newly generated voice merely because synthesis succeeded.

OAuth program tests use real SDK PKCE/callback handling with mocked token exchange. Gateway tests use local mock services. They do not substitute for real account authorization or recipient playback.

## Not implemented / bounded

No QQ social posting or real-time calls. WeChat native voice output remains disabled. Videos and animated images are sampled; documents are bounded text extraction. Scanned PDFs, old DOC, executable files and encrypted documents are not supported. Image generation uses the separate Codex CLI account or explicitly selected OpenRouter; it is not a claim that every multimodal function consumes one ChatGPT quota pool.

Live credentials, personal account numbers, private conversations and user artwork have been excluded from this release.
