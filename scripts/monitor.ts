import {loadEnvConfig} from '@next/env';
import {writeFileSync} from 'node:fs';
loadEnvConfig(process.cwd());
async function main(){const {runMonitor,dashboard}=await import('../src/server/monitor');const result=await runMonitor();const data=await dashboard();writeFileSync('public/bootstrap.json',JSON.stringify(data));console.log(JSON.stringify({summary:result?.summary,sources:data.sources.map(s=>({id:s.id,status:s.status,count:s.count,error:s.error}))},null,2));}
main().catch(e=>{console.error(e);process.exitCode=1;});
