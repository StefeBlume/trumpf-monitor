import {randomUUID,createHash} from 'node:crypto';
import {diffWords} from 'diff';
import type {Briefing,Dashboard,Item,Event,Source,DocumentInput} from '../model';
import {db} from './db';import {configuredSources,ingest} from './connectors';import {contentHash} from './parsing';import {evaluate} from './evaluation';
export function berlinClock(date=new Date()){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=(t:string)=>parts.find(p=>p.type===t)!.value;return {day:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};}
export async function dashboard():Promise<Dashboard>{const c=await db();const [items,states,briefings,events]=await Promise.all([c.execute('SELECT data FROM items'),c.execute('SELECT id,data FROM source_state'),c.execute('SELECT data FROM briefings ORDER BY rowid DESC LIMIT 60'),c.execute('SELECT data FROM events ORDER BY rowid DESC LIMIT 300')]);const state=new Map(states.rows.map(s=>[s.id,JSON.parse(String(s.data))]));return {items:items.rows.map(r=>JSON.parse(String(r.data))),sources:configuredSources().map(s=>({...s,...state.get(s.id),status:state.get(s.id)?.status??(s.kind==='manual'?'manual':s.kind==='dip'&&!process.env.DIP_API_KEY?'setup':'pending')})),briefings:briefings.rows.map(r=>JSON.parse(String(r.data))),events:events.rows.map(r=>JSON.parse(String(r.data))),serverTime:new Date().toISOString(),aiEnabled:!!(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL),scheduleEnabled:process.env.SCHEDULE_ENABLED==='true'};}
export async function runMonitor(options:{cron?:boolean; sources?:Source[]; fetcher?:(s:Source)=>Promise<DocumentInput[]>}={}):Promise<Briefing|null>{
 const c=await db(),id=randomUUID(),clock=berlinClock();
 if(options.cron&&clock.hour!==6)return null;
 const lock=await c.execute({sql:'INSERT INTO locks(id,owner,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE locks.expires < ?',args:['monitor',id,Date.now()+600000,Date.now()]});
 if(!lock.rowsAffected)throw new Error('Ein Quellenlauf ist bereits aktiv.');
 try{
 if(options.cron&&(await c.execute({sql:'SELECT day FROM cron_days WHERE day=?',args:[clock.day]})).rows.length)return null;
 const all=options.sources??configuredSources();const initial=await dashboard();const existing=new Map(initial.items.map(i=>[i.id,i]));const states=new Map(initial.sources.map(s=>[s.id,s]));
 const updated:Item[]=[];let ok=0,failed=0,manual=0;const errors:string[]=[];
 for(const source of all){
 if(source.kind==='manual'||(source.kind==='dip'&&!process.env.DIP_API_KEY&&!options.fetcher)){manual++;continue;}
 const now=new Date().toISOString();
 try{
 const docs=await(options.fetcher??ingest)(source);if(!docs.length)throw new Error('Leerer Feed: Abdeckung kann nicht bestätigt werden.');
 const baseline=!states.get(source.id)?.count&&!initial.items.some(i=>i.sourceId===source.id);
 const statements:any[]=[];const sourceUpdates:Item[]=[];
 for(const doc of new Map(docs.map(d=>[d.externalId,d])).values()){
 const itemId=createHash('sha256').update(source.id+'|'+doc.externalId).digest('hex').slice(0,24);const old=existing.get(itemId),hash=contentHash(doc);
 const change=old?(hash===old.hash?'unchanged':'changed'):(baseline?'baseline':'new');
 const item:Item={...doc,id:itemId,sourceId:source.id,institution:source.institution,hash,version:old?old.version+(hash!==old.hash?1:0):1,change,firstSeen:old?.firstSeen??now,lastSeen:now,changedAt:change==='unchanged'?old!.changedAt:now,archived:old?.archived??false,evaluation:change==='unchanged'?old!.evaluation:await evaluate(doc)};
 statements.push({sql:'INSERT INTO items(id,source_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',args:[itemId,source.id,JSON.stringify(item)]});
 if(change!=='unchanged'){
 const event:Event={id:randomUUID(),itemId,title:item.title,at:now,change,sourceId:source.id,version:item.version};
 statements.push({sql:'INSERT INTO versions(item_id,version,data) VALUES(?,?,?)',args:[itemId,item.version,JSON.stringify(item)]},{sql:'INSERT INTO events(id,run_id,data) VALUES(?,?,?)',args:[event.id,id,JSON.stringify(event)]});
 sourceUpdates.push(item);
 }
 }
 statements.push({sql:'INSERT INTO source_state(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',args:[source.id,JSON.stringify({status:'ok',checkedAt:now,count:docs.length,error:null})]});
 await c.batch(statements,'write');updated.push(...sourceUpdates);ok++;
 }catch(e){failed++;const error=e instanceof Error?e.message:'Abruf fehlgeschlagen';errors.push(`${source.institution}: ${error}`);await c.execute({sql:'INSERT INTO source_state(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',args:[source.id,JSON.stringify({status:'error',checkedAt:now,count:states.get(source.id)?.count??0,error})]});}
 // Renew owner-specific lease between sources.
 await c.execute({sql:'UPDATE locks SET expires=? WHERE id=? AND owner=?',args:[Date.now()+600000,'monitor',id]});
 }
 const changes=updated.filter(i=>i.change!=='baseline');const baseline=updated.some(i=>i.change==='baseline');const relevant=changes.filter(i=>i.evaluation.category==='relevant').length;
 const summary=ok===0?'Keine belastbare Aussage: Es konnte keine Quelle erfolgreich geprüft werden.':`${baseline?'Ausgangsstand angelegt. Erstimporte sind keine nachgewiesenen Neuigkeiten. ':''}${changes.length} neue oder geänderte Einträge seit dem letzten erfolgreichen Quellenstand; ${relevant} als relevant vorgeschlagen. ${failed||manual?'Abdeckung unvollständig: '+failed+' Quellenfehler, '+manual+' offene Anbindungen.':'Aussage gilt nur für die erfassten Feed-Inhalte.'}`;
 const b:Briefing={id,createdAt:new Date().toISOString(),day:clock.day,baseline,summary,items:updated,coverage:{ok,failed,manual},errors};
 await c.execute({sql:'INSERT INTO briefings(id,day,data) VALUES(?,?,?)',args:[id,clock.day,JSON.stringify(b)]});
 if(options.cron)await c.execute({sql:'INSERT OR IGNORE INTO cron_days(day,completed_at) VALUES(?,?)',args:[clock.day,b.createdAt]});
 return b;
 }finally{await c.execute({sql:'DELETE FROM locks WHERE id=? AND owner=?',args:['monitor',id]});}
}
export async function history(itemId:string){const c=await db();const r=await c.execute({sql:'SELECT data FROM versions WHERE item_id=? ORDER BY version DESC',args:[itemId]});const versions:Item[]=r.rows.map(r=>JSON.parse(String(r.data)));return {versions,diff:versions.length>1?diffWords(versions[1].title+'\n'+versions[1].text+'\n'+(versions[1].procedure??''),versions[0].title+'\n'+versions[0].text+'\n'+(versions[0].procedure??'')):[]};}
export async function archive(itemId:string,archived:boolean){const c=await db();const row=await c.execute({sql:'SELECT data FROM items WHERE id=?',args:[itemId]});if(!row.rows.length)throw new Error('Treffer nicht gefunden');const item=JSON.parse(String(row.rows[0].data));await c.execute({sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify({...item,archived}),itemId]});}
