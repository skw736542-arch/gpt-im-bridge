import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const lock=JSON.parse(readFileSync('package-lock.json','utf8')),inventory=[];
mkdirSync('third-party/npm',{recursive:true});
for(const [path,entry] of Object.entries(lock.packages)){if(!path)continue;const file=join(path,'package.json');let pkg={};if(existsSync(file))pkg=JSON.parse(readFileSync(file,'utf8'));const licenses=[];
 if(existsSync(file))for(const name of readdirSync(path)){if(!/^(licen[cs]e|copying|notice)(\.|$|-)/i.test(name))continue;try{const content=readFileSync(join(path,name),'utf8');if(content.length>1000000)continue;const out=(pkg.name??path.replaceAll('/','_')).replaceAll('/','_')+'-'+entry.version+'-'+name;writeFileSync(join('third-party/npm',out),content);licenses.push('npm/'+out);}catch{}}
 inventory.push({name:pkg.name??path.replace(/^.*node_modules\//,''),version:entry.version,license:pkg.license??entry.license??'UNDECLARED',development:!!entry.dev,installed:existsSync(file),repository:typeof pkg.repository==='string'?pkg.repository:pkg.repository?.url,notices:licenses});}
writeFileSync('third-party/dependencies.json',JSON.stringify({source:'package-lock.json and installed package license files; external services and weights are separate',packages:inventory},null,2)+'\n');console.log(JSON.stringify({packages:inventory.length,undeclared:inventory.filter(x=>x.license==='UNDECLARED').map(x=>x.name),noticeFiles:inventory.reduce((n,x)=>n+x.notices.length,0)}));
