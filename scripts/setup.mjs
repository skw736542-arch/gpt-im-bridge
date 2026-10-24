import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
if (existsSync('.env')) { console.log('.env already exists; left unchanged.'); process.exit(0); }
const password = randomBytes(24).toString('base64url');
writeFileSync('.env', `HOST=127.0.0.1\nPORT=8787\nPUBLIC_ORIGIN=http://127.0.0.1:8787\nADMIN_PASSWORD=${password}\nENCRYPTION_KEY=${randomBytes(32).toString('base64')}\nDATA_DIR=./data\nCOOKIE_SECURE=false\nNODE_USE_ENV_PROXY=1\nNO_PROXY=localhost,127.0.0.1,::1\n`, {mode:0o600,flag:'wx'});
console.log('Created .env with random secrets. Read ADMIN_PASSWORD locally to sign in. Do not share this file.');
