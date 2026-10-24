import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { configSchema, defaults, type Config } from './config.js';

export class Store {
  db: DatabaseSync;
  private queues = new Map<string, Promise<unknown>>();
  constructor(dir: string, private key: Buffer) {
    mkdirSync(dir,{recursive:true,mode:0o700});
    this.db = new DatabaseSync(join(dir,'bridge.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, time INTEGER, scope TEXT, code TEXT, message TEXT);
      CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, time INTEGER);
      CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, value TEXT, time INTEGER);`);
    try { chmodSync(join(dir,'bridge.sqlite'),0o600); } catch { /* Windows ACL inherited from data directory */ }
  }
  seal(value: unknown, id: string) {
    const iv=randomBytes(12); const c=createCipheriv('aes-256-gcm',this.key,iv);
    c.setAAD(Buffer.from(id));
    const body=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);
    return Buffer.concat([iv,c.getAuthTag(),body]).toString('base64');
  }
  unseal<T>(value:string,id:string):T {
    const b=Buffer.from(value,'base64'); const c=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));
    c.setAAD(Buffer.from(id)); c.setAuthTag(b.subarray(12,28));
    return JSON.parse(Buffer.concat([c.update(b.subarray(28)),c.final()]).toString('utf8')) as T;
  }
  get<T>(key:string,fallback:T):T {const row=this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as {value:string}|undefined; return row ? JSON.parse(row.value) as T : fallback;}
  set(key:string,value:unknown) {this.db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key,JSON.stringify(value));}
  secret<T>(key:string):T|undefined {const row=this.db.prepare('SELECT value FROM secrets WHERE key=?').get(key) as {value:string}|undefined; return row ? this.unseal<T>(row.value,key) : undefined;}
  putSecret(key:string,value:unknown) {this.db.prepare('INSERT OR REPLACE INTO secrets VALUES (?,?)').run(key,this.seal(value,key));}
  deleteSecret(key:string) {this.db.prepare('DELETE FROM secrets WHERE key=?').run(key);}
  secretNames():string[] {return (this.db.prepare('SELECT key FROM secrets').all() as {key:string}[]).map(x=>x.key);}
  async locked<T>(key:string,fn:()=>Promise<T>):Promise<T> {
    const previous=this.queues.get(key) ?? Promise.resolve();
    const next=previous.catch(()=>{}).then(fn); this.queues.set(key,next);
    try { return await next; } finally {if(this.queues.get(key)===next)this.queues.delete(key);}
  }
  config():Config {return configSchema.parse(this.get('config',defaults()));}
  saveConfig(config:Config) {this.set('config',configSchema.parse(config));}
  log(scope:string,code:string,message:string) {
    // Callers pass fixed public messages, never provider bodies, tokens, prompts or stack traces.
    this.db.prepare('INSERT INTO events(time,scope,code,message) VALUES(?,?,?,?)').run(Date.now(),scope,code,message);
    this.db.exec('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 300)');
  }
  events() {return this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 100').all();}
  hasSeen(id:string) {return !!this.db.prepare('SELECT id FROM seen WHERE id=?').get(id);}
  markSeen(id:string) {this.db.prepare('INSERT OR IGNORE INTO seen VALUES(?,?)').run(id,Date.now());this.db.prepare('DELETE FROM seen WHERE time < ?').run(Date.now()-7*86400000);}
  history<T>(id:string):T[] {this.db.prepare('DELETE FROM history WHERE time < ?').run(Date.now()-86400000);const row=this.db.prepare('SELECT value FROM history WHERE id=?').get(id) as {value:string}|undefined;return row ? this.unseal<T[]>(row.value,id) : [];}
  saveHistory(id:string,value:unknown[]) {this.db.prepare('INSERT OR REPLACE INTO history VALUES(?,?,?)').run(id,this.seal(value,id),Date.now());}
  clearHistory() {this.db.exec('DELETE FROM history');}
  close() {this.db.close();}
}
