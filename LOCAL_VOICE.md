# 本地语音（实验性）

聊天仍使用原来的模型授权；Qwen3-TTS 语音推理在本机 GPU 运行，不收取语音 API 费用。电力、显存和下载空间由本机承担。台湾华语描述是生成指令，并不保证口音与自然度；必须试听验收。

使用 Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice（Apache-2.0），Serena 成年女声音色。Windows、Python 3.10、可用 NVIDIA GPU/驱动和足够磁盘空间是前提。模型约 4.5 GB，CUDA PyTorch 还需额外下载空间；实际显存以运行结果为准。

公开版提供 `powershell -ExecutionPolicy Bypass -File scripts/setup-local-tts.ps1`，在独立 `.venv-qwen` 安装 CUDA 12.4 版 PyTorch 2.6.0、torchaudio 2.6.0 和 requirements-qwen.txt，然后从官方 ModelScope 下载模型。无需继承系统 Python 包。`-Python` 可指定 Python 3.10 路径，`-SkipModelDownload` 仅安装环境。此新增安装脚本已做语法检查，但尚未在另一台全新 GPU 电脑完成下载与试听；现有机器上的模型推理记录不能替代该验收。

通过官方 ModelScope 下载模型到 `data/local-tts/model-ms`，包含主权重和 speech_tokenizer 权重。启动：`powershell -File scripts/start-local-tts.ps1`。等待日志出现 `LOCAL_TTS_READY`。本地服务只监听 127.0.0.1:8790，凭证自动生成在 data 目录，不应打包或共享。

试听通过后，在 `data/local-tts/settings.json` 写入 `{"enabled":true}` 才会切换。设为 false 可恢复原先的在线 Edge 音色。启动脚本不会自动开启切换。服务每次仅处理一条语音，忙碌或失败会报告失败，不会悄悄发送另一种音色。生成音频仍通过原来的 SILK 编码发送 QQ 原生语音条，WAV 只是内部中间格式。

Windows start.ps1 在本地语音开启且端口未监听时会启动工作进程；没有加入系统开机启动。模型首次加载需要等待，就绪前文字仍可用。不要开放 8790 到公网。
