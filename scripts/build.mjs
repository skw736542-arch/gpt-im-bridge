import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist/public', {recursive:true});
cpSync('public', 'dist/public', {recursive:true});
console.log('Server and management UI built.');
