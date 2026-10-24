"""Actual local decoder tests with synthetic fixtures; no model quota used."""
import base64,io,json,subprocess,sys,zipfile
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
def decode(raw,kind,name=''):
    p=subprocess.run([sys.executable,str(ROOT/'scripts/media-engine.py')],input=json.dumps({'data':base64.b64encode(raw).decode(),'kind':kind,'name':name}),text=True,encoding='utf-8',capture_output=True,timeout=65)
    return json.loads(p.stdout)
out=io.BytesIO();Image.new('RGB',(64,64),'blue').save(out,format='PNG');assert len(decode(out.getvalue(),'image')['images'])==1
out=io.BytesIO();Image.new('RGB',(32,32),'red').save(out,format='GIF',save_all=True,append_images=[Image.new('RGB',(32,32),'green'),Image.new('RGB',(32,32),'blue')],duration=200,loop=0);assert len(decode(out.getvalue(),'image')['images'])==3
assert 'sample text' in decode(b'sample text','file','note.txt')['text']
assert decode(b'cannot execute','file','bad.exe')['error']=='FILE_TYPE'
out=io.BytesIO()
with zipfile.ZipFile(out,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>sample docx</w:t></w:r></w:p></w:document>')
assert 'sample docx' in decode(out.getvalue(),'file','note.docx')['text']
from openpyxl import Workbook
out=io.BytesIO();book=Workbook();book.active.append(['item',12]);book.save(out);assert 'item' in decode(out.getvalue(),'file','sheet.xlsx')['text']
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject,NameObject,DecodedStreamObject
writer=PdfWriter();page=writer.add_blank_page(width=300,height=300);font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')});page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})});stream=DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 30 200 Td (sample pdf) Tj ET');page[NameObject('/Contents')]=writer._add_object(stream);out=io.BytesIO();writer.write(out);assert 'sample pdf' in decode(out.getvalue(),'file','note.pdf')['text']
writer.encrypt('test');out=io.BytesIO();writer.write(out);assert decode(out.getvalue(),'file','locked.pdf')['error']=='PDF_ENCRYPTED'
import av
out=io.BytesIO()
with av.open(out,'w',format='mp4') as c:
    s=c.add_stream('libx264',rate=5);s.width=64;s.height=64;s.pix_fmt='yuv420p'
    a=c.add_stream('aac',rate=16000);a.layout='mono'
    for i in range(25):
        for packet in s.encode(av.VideoFrame.from_image(Image.new('RGB',(64,64),(i*8,40,80)))):c.mux(packet)
    for packet in s.encode():c.mux(packet)
    import numpy as np
    from fractions import Fraction
    for i in range(5):
        frame=av.AudioFrame.from_ndarray(np.zeros((1,16000),dtype=np.float32),format='fltp',layout='mono');frame.sample_rate=16000;frame.time_base=Fraction(1,16000);frame.pts=i*16000
        for packet in a.encode(frame):c.mux(packet)
    for packet in a.encode():c.mux(packet)
result=decode(out.getvalue(),'video','clip.mp4');assert len(result['images'])==6,result
assert base64.b64decode(result['audio']).startswith(b'RIFF')
print('10 real decoder checks passed: PNG, GIF, text, unsupported file, DOCX, XLSX, PDF, encrypted PDF, MP4 frames and extracted audio.')
