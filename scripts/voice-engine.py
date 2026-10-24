import sys, json, base64, asyncio, os, io
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
os.environ['HF_HUB_DISABLE_XET']='1'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS']='1'
if os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY'):os.environ.pop('ALL_PROXY',None)
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
async def run(request):
    action=request['action']
    if action=='pcm':
        import av
        raw=base64.b64decode(request['data'],validate=True)
        if len(raw)>10*1024*1024:raise ValueError('size')
        chunks=[];size=0
        with av.open(io.BytesIO(raw)) as container:
            resampler=av.AudioResampler(format='s16',layout='mono',rate=24000)
            for frame in container.decode(audio=0):
                for f in resampler.resample(frame):
                    b=f.to_ndarray().tobytes();size+=len(b)
                    if size>24000*2*60:raise ValueError('duration')
                    chunks.append(b)
            for f in resampler.resample(None):chunks.append(f.to_ndarray().tobytes())
        return {'data':base64.b64encode(b''.join(chunks)).decode()}
    if action in ('tts','voices'):
        settings=ROOT/'data'/'local-tts'/'settings.json'
        if action=='tts' and settings.exists() and json.loads(settings.read_text(encoding='utf-8-sig')).get('enabled'):
            from urllib.request import Request, build_opener, ProxyHandler
            text=request['text']
            if not isinstance(text,str) or not 0<len(text)<=180:raise ValueError('length')
            token=(ROOT/'data'/'local-tts'/'worker-token').read_text(encoding='utf-8').strip()
            req=Request('http://127.0.0.1:8790/tts',data=json.dumps({'text':text}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
            with build_opener(ProxyHandler({})).open(req,timeout=80) as response:
                return json.loads(response.read(8000000))
        import edge_tts
        proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
        if action=='voices':
            voices=await edge_tts.list_voices(proxy=proxy)
            return {'voices':[v['ShortName'] for v in voices if v['Locale']=='zh-TW' and v['Gender']=='Female']}
        text=request['text']
        if not 0<len(text)<=180: raise ValueError('length')
        speech=edge_tts.Communicate(text,'zh-TW-HsiaoYuNeural',rate='+0%',proxy=proxy)
        chunks=[]
        async for chunk in speech.stream():
            if chunk['type']=='audio':chunks.append(chunk['data'])
        audio=b''.join(chunks)
        if not audio:raise ValueError('empty audio')
        return {'data':base64.b64encode(audio).decode(),'format':'mp3'}
    if action in ('download','asr'):
        from faster_whisper import WhisperModel
        model=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=4,download_root=str(ROOT/'data'/'speech-models'),local_files_only=action=='asr')
        if action=='download':return {'ready':True}
        import av, numpy as np
        raw=base64.b64decode(request['data'],validate=True)
        if len(raw)>10*1024*1024:raise ValueError('size')
        samples=[];count=0
        with av.open(io.BytesIO(raw)) as container:
            resampler=av.AudioResampler(format='s16',layout='mono',rate=16000)
            for frame in container.decode(audio=0):
                for f in resampler.resample(frame):
                    a=f.to_ndarray().flatten();count+=a.size
                    if count>16000*60:raise ValueError('duration')
                    samples.append(a)
        if not samples:raise ValueError('empty')
        audio=np.concatenate(samples).astype(np.float32)/32768.0
        segments,info=model.transcribe(audio,beam_size=1,vad_filter=True,condition_on_previous_text=False)
        return {'text':''.join(s.text for s in segments).strip()[:12000],'duration':len(audio)/16000}
    raise ValueError('action')
try:
    request=json.loads(sys.stdin.read(16000000));print(json.dumps(asyncio.run(run(request)),ensure_ascii=False))
except Exception as exc:
    print(json.dumps({'error':type(exc).__name__}));sys.exit(1)


