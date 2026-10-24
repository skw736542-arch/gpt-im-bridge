"""Download separately licensed upstream weights; never redistribute them in releases."""
from pathlib import Path
from modelscope import snapshot_download

target = Path(__file__).resolve().parent.parent / 'data' / 'local-tts' / 'model-ms'
snapshot_download('Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', local_dir=str(target))
required = [target / 'model.safetensors', target / 'config.json']
if not all(path.is_file() for path in required):
    raise RuntimeError('Download did not produce the required model files')
print('Local Qwen weights downloaded; review LOCAL_VOICE.md before enabling.')
