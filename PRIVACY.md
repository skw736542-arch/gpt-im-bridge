# Data handling

GPT IM Bridge has no built-in analytics endpoint. It is a self-hosted, single-owner service; administrators can view its configured accounts and saved memories.

| Destination | Data | When |
| --- | --- | --- |
| Selected OpenAI/Pi provider | Allowed messages, bounded history, confirmed memories, images, extracted document text/video frames and transcribed speech | When responding or considering enabled proactive contact |
| Local OneBot gateway / selected messaging platform | Incoming/outgoing messages and media | When the corresponding channel is enabled |
| Local Codex CLI and its configured OpenAI service | Image prompt and optional reference images | When codex-subscription image generation is explicitly enabled |
| OpenRouter | Image prompts | Only when that separate backend is selected and authorized |
| Microsoft Edge speech service | Speech text | When online TTS is used; local Qwen instead keeps synthesis local |
| Model/package distribution hosts | Download requests and normal connection metadata | When installing dependencies or downloading Whisper/Qwen weights |

Whisper recognition and document/video decoding run locally. Resulting text/frames are sent to the selected model as described above. Group operators should inform participants before enabling AI processing; a sender must also pass the configured whitelist.

Credentials, history and role memories are encrypted at rest in SQLite. Configuration, whitelist and some event/status metadata are plaintext. .env contains the decryption key; protecting only the database is not enough. See AUTHENTICATION.md for CLI and worker credentials stored outside that database.

Short history expires after 24 hours when history is read; recent topics are used for seven days. Confirmed long-term memories remain until deleted. `/reset` clears short context, `/forget all` removes saved role memories, and the admin memory page supports review/deletion. Stopping memory use is not equivalent to erasing backups. Database deletion is not secure disk erasure.

No promise is made about the retention policy of external providers, gateway logs, the separate CLI or your own backups. Review their policies before sending sensitive material.
