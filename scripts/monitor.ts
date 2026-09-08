import {loadEnvConfig} from '@next/env';
import {existsSync,readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
loadEnvConfig(process.cwd());
const SNAPSHOT='public/bootstrap.json';
async function main(){
 mkdirSync('data',{recursive:true});
 const {runMonitor,dashboard,seedFromSnapshot}=await import('../src/server/monitor');
 // Ohne Datenbank aus dem veroeffentlichten Stand aufbauen, sonst gilt jedes bekannte Dokument als neu.
 const seeded=existsSync(SNAPSHOT)?await seedFromSnapshot(JSON.parse(readFileSync(SNAPSHOT,'utf8'))):0;
 const result=await runMonitor();
 const data=await dashboard();
 writeFileSync(SNAPSHOT,JSON.stringify(data));
 const changed=(result?.items??[]).length;
 // Der Zeitplan committet nur, wenn sich inhaltlich etwas getan hat.
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`changed=${changed>0}\n`);
 console.log(JSON.stringify({seeded,changed,summary:result?.summary,sources:data.sources.map(s=>({id:s.id,status:s.status,count:s.count,error:s.error}))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
