// Creates a QR login challenge but does not log in, send messages or call a paid model.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Store } from '../dist/store.js';
import { AI } from '../dist/ai.js';
import { Bridge } from '../dist/bridge.js';
import { Weixin } from '../dist/weixin.js';
const store=new Store(mkdtempSync(join(tmpdir(),'bridge-network-')),randomBytes(32));
try {const wx=new Weixin(store,new Bridge(new AI(store)));const qr=await wx.startQR();console.log(JSON.stringify({weixinQrEndpointReachable:!!qr?.image,realWechatLogin:false,realWechatReply:false}));}
catch {console.log(JSON.stringify({weixinQrEndpointReachable:false,realWechatLogin:false,realWechatReply:false,note:'Live QR endpoint failed; check region/network/service availability.'}));process.exitCode=1;}
finally {store.close();}
