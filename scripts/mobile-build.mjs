import {mkdtempSync,cpSync,symlinkSync,writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';import {execFileSync} from 'node:child_process';import {tmpdir} from 'node:os';
const root=process.cwd();const stage=mkdtempSync(join(tmpdir(),'policy-mobile-'));
for(const f of ['src','public','next.config.mjs','tsconfig.json','package.json'])cpSync(join(root,f),join(stage,f),{recursive:true});
mkdirSync(join(stage,'pages'));for(const f of ['index.tsx','_app.tsx','_document.tsx'])cpSync(join(root,'pages',f),join(stage,'pages',f));
symlinkSync(join(root,'node_modules'),join(stage,'node_modules'),'dir');
// Connection is included only in the private, locally installed iOS bundle. Never in web deployment.
if(existsSync(join(root,'.env.local'))){const env=readFileSync(join(root,'.env.local'),'utf8');const token=env.match(/^APP_TOKEN=(.+)$/m)?.[1];const url=env.match(/^MOBILE_SERVER_URL=(.+)$/m)?.[1];if(token&&url)writeFileSync(join(stage,'public/connection.json'),JSON.stringify({url,token}));}
execFileSync(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:stage,env:{...process.env,MOBILE_EXPORT:'1'},stdio:'inherit'});
cpSync(join(stage,'out'),join(root,'out'),{recursive:true});
console.log('iOS-Web-Bundle erstellt: out/');
