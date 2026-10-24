"""Record installed media environment metadata and retain upstream notices."""
import importlib.metadata as metadata
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'third-party' / 'python'
root.mkdir(parents=True, exist_ok=True)
items = []
for dist in metadata.distributions():
    name = dist.metadata['Name']
    if name.lower() in ('pip', 'setuptools'):
        continue
    notices = []
    for file in dist.files or []:
        if not re.match(r'^(license|licence|copying|notice)(\.|$|-)', Path(str(file)).name, re.I):
            continue
        try:
            text = dist.locate_file(file).read_text(encoding='utf-8')
            if len(text) > 1000000:
                continue
            target = name + '-' + dist.version + '-' + str(file).replace('/', '_').replace('\\', '_')
            (root / target).write_text(text, encoding='utf-8')
            notices.append(target)
        except (OSError, UnicodeError):
            pass
    items.append({'name': name, 'version': dist.version, 'license': dist.metadata.get('License-Expression') or dist.metadata.get('License') or 'UNDECLARED', 'notices': notices})
(root / 'dependencies.json').write_text(json.dumps({'scope': 'Installed base speech/media environment; excludes optional Qwen/CUDA and weights', 'packages': sorted(items, key=lambda x:x['name'].lower())}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'packages':len(items),'noticeFiles':sum(len(i['notices']) for i in items)}))
