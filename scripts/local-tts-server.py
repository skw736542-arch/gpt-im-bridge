"""Local-only, authenticated, single-inference Qwen speech worker."""
import base64
import io
import json
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'local-tts'
DATA.mkdir(parents=True, exist_ok=True)
TOKEN = DATA / 'worker-token'
if not TOKEN.exists():
    TOKEN.write_text(secrets.token_urlsafe(32), encoding='utf-8')
token = TOKEN.read_text(encoding='utf-8').strip()
busy = threading.Lock()

import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

torch.set_num_threads(4)
model = Qwen3TTSModel.from_pretrained(
    str(DATA / 'model-ms'), device_map='cuda:0', dtype=torch.bfloat16,
    attn_implementation='sdpa', local_files_only=True,
)
STYLE = ('成年女生，自然的台湾华语口音，像跟熟悉的朋友面对面聊天。'
         '温暖轻松，语速自然，句子有轻重和起伏，停顿自然。'
         '不要播音腔，不要朗诵，不要夸张撒娇，不要刻意拖长尾音。')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, data):
        payload = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        if not secrets.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
            return self.respond(401, {'error': 'unauthorized'})
        if self.path != '/tts':
            return self.respond(404, {'error': 'not_found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8192:
                raise ValueError()
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError()
            text = payload.get('text')
            if not isinstance(text, str) or not 0 < len(text.strip()) <= 180:
                raise ValueError()
        except (ValueError, TypeError):
            return self.respond(400, {'error': 'invalid_text'})
        if not busy.acquire(blocking=False):
            return self.respond(429, {'error': 'busy'})
        try:
            started = time.monotonic()
            with torch.inference_mode():
                wavs, sr = model.generate_custom_voice(
                    text=text, language='Auto', speaker='Serena', instruct=STYLE,
                    max_new_tokens=720,
                )
            duration = len(wavs[0]) / sr
            if not 0 < duration <= 60:
                raise ValueError('duration')
            output = io.BytesIO()
            sf.write(output, wavs[0], sr, format='WAV', subtype='PCM_16')
            self.respond(200, {'data': base64.b64encode(output.getvalue()).decode(),
                              'duration': round(duration * 1000), 'format': 'wav',
                              'elapsedMs': round((time.monotonic()-started)*1000)})
        except Exception as exc:
            print('synthesis_failed:' + type(exc).__name__, flush=True)
            self.respond(500, {'error': 'synthesis_failed'})
        finally:
            busy.release()

print('LOCAL_TTS_READY 127.0.0.1:8790', flush=True)
ThreadingHTTPServer(('127.0.0.1', 8790), Handler).serve_forever()

