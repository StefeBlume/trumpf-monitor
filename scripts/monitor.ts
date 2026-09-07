import {loadEnvConfig} from '@next/env';
import {writeFileSync} from 'node:fs';
loadEnvConfig(process.cwd());
// --cron laeuft nur zur 6. Stunde Europe/Berlin und hoechstens einmal je Kalendertag.
// Der Zeitplan darf deshalb gefahrlos mehrfach am Tag ausloesen.
async function main(){
 const cron=process.argv.includes('--cron');
 const {runMonitor,dashboard}=await import('../src/server/monitor');
 const result=await runMonitor({cron});
 const data=await dashboard();
 writeFileSync('public/bootstrap.json',JSON.stringify(data));
 console.log(JSON.stringify({ran:!!result,skipped:cron&&!result,summary:result?.summary,sources:data.sources.map(s=>({id:s.id,status:s.status,count:s.count,error:s.error}))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
