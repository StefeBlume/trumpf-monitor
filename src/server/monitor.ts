import {randomUUID,createHash} from 'node:crypto';
import {diffWords} from 'diff';
import {committeeById,type Briefing,type Dashboard,type Item,type Event,type Source,type DocumentInput} from '../model';
import {db} from './db';import {configuredSources,ingest,lookbackStart} from './connectors';import {contentHash} from './parsing';
export function berlinClock(date=new Date()){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=(t:string)=>parts.find(p=>p.type===t)!.value;return {day:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};}
export async function dashboard():Promise<Dashboard>{const c=await db();const [items,states,briefings,events]=await Promise.all([c.execute('SELECT data FROM items'),c.execute('SELECT id,data FROM source_state'),c.execute('SELECT data FROM briefings ORDER BY rowid DESC LIMIT 60'),c.execute('SELECT data FROM events ORDER BY rowid DESC LIMIT 300')]);const state=new Map(states.rows.map(s=>[s.id,JSON.parse(String(s.data))]));return {items:items.rows.map(r=>JSON.parse(String(r.data))),sources:configuredSources().map(s=>({...s,...state.get(s.id),status:state.get(s.id)?.status??(s.kind==='manual'?'manual':s.env&&!process.env[s.env]&&s.kind!=='rss'?'setup':'pending')})),briefings:briefings.rows.map(r=>JSON.parse(String(r.data))),events:events.rows.map(r=>JSON.parse(String(r.data))),serverTime:new Date().toISOString(),scheduleEnabled:process.env.SCHEDULE_ENABLED==='true'};}
export function briefingSummary(updated:Item[],baseline:boolean,ok:number,failed:number,manual:number):string{
 if(!ok)return 'Keine belastbare Aussage: Es konnte keine Quelle erfolgreich geprüft werden.';
 const changes=updated.filter(i=>i.change!=='baseline');
 const committees=new Set(changes.flatMap(i=>i.committees));
 const coverage=failed||manual?`Abdeckung unvollständig: ${failed} Quellenfehler, ${manual} offene Anbindungen.`:'Die Aussage gilt nur für die erfassten amtlichen Quellen.';
 const head=baseline?`Ausgangsstand mit ${updated.filter(i=>i.change==='baseline').length} Dokumenten angelegt. Erstimporte sind keine nachgewiesenen Neuigkeiten. `:'';
 if(!changes.length)return `${head}${baseline?'Darüber hinaus keine':'Keine'} neuen oder geänderten Dokumente in den ausgewählten Ausschüssen und Ressorts seit dem letzten erfolgreichen Quellenstand. ${coverage}`;
 const named=[...committees].map(id=>committeeById(id)?.short).filter(Boolean).slice(0,4).join(', ');
 return `${head}${changes.length} neue oder geänderte Dokumente${committees.size?` in ${committees.size} ausgewählten Ausschüssen (${named}${committees.size>4?' u. a.':''})`:''}. ${coverage}`;
}
export async function runMonitor(options:{sources?:Source[]; fetcher?:(s:Source,since:string,warn?:(n:string)=>void)=>Promise<DocumentInput[]>; retentionDays?:number}={}):Promise<Briefing|null>{
 const c=await db(),id=randomUUID(),clock=berlinClock();
 const lock=await c.execute({sql:'INSERT INTO locks(id,owner,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE locks.expires < ?',args:['monitor',id,Date.now()+600000,Date.now()]});
 if(!lock.rowsAffected)throw new Error('Ein Quellenlauf ist bereits aktiv.');
 try{
 const all=options.sources??configuredSources();const initial=await dashboard();const existing=new Map(initial.items.map(i=>[i.id,i]));const states=new Map(initial.sources.map(s=>[s.id,s]));
 const updated:Item[]=[];let ok=0,failed=0,manual=0;const errors:string[]=[];
 for(const source of all){
 if(source.kind==='manual'||(source.env&&!process.env[source.env]&&source.kind!=='rss'&&!options.fetcher)){manual++;continue;}
 const now=new Date().toISOString();
 try{
 const since=lookbackStart(states.get(source.id)?.status==='ok'?states.get(source.id)?.checkedAt:undefined);
 let warning:string|null=null;
 const docs=await(options.fetcher??ingest)(source,since,(note:string)=>{warning=note;});
 const baseline=!states.get(source.id)?.checkedAt&&!initial.items.some(i=>i.sourceId===source.id);
 const statements:any[]=[];const sourceUpdates:Item[]=[];
 for(const doc of new Map(docs.map(d=>[d.externalId,d])).values()){
 const itemId=createHash('sha256').update(source.id+'|'+doc.externalId).digest('hex').slice(0,24);const old=existing.get(itemId),hash=contentHash(doc);
 const change=old?(hash===old.hash?'unchanged':'changed'):(baseline?'baseline':'new');
 const item:Item={...doc,id:itemId,sourceId:source.id,institution:source.institution,hash,version:old?old.version+(hash!==old.hash?1:0):1,change,firstSeen:old?.firstSeen??now,lastSeen:now,changedAt:change==='unchanged'?old!.changedAt:now,archived:old?.archived??false};
 statements.push({sql:'INSERT INTO items(id,source_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',args:[itemId,source.id,JSON.stringify(item)]});
 if(change!=='unchanged'){
 const event:Event={id:randomUUID(),itemId,title:item.title,at:now,change,sourceId:source.id,version:item.version};
 statements.push({sql:'INSERT INTO versions(item_id,version,data) VALUES(?,?,?)',args:[itemId,item.version,JSON.stringify(item)]},{sql:'INSERT INTO events(id,run_id,data) VALUES(?,?,?)',args:[event.id,id,JSON.stringify(event)]});
 sourceUpdates.push(item);
 }
 }
 // Ein leeres Ergebnis ist hier eine gültige Aussage: im Fenster wurde nichts Passendes überwiesen oder veröffentlicht.
 statements.push({sql:'INSERT INTO source_state(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',args:[source.id,JSON.stringify({status:warning?'partial':'ok',checkedAt:now,count:docs.length,error:warning,since})]});
 await c.batch(statements,'write');updated.push(...sourceUpdates);ok++;if(warning)errors.push(`${source.institution}: ${warning}`);
 }catch(e){failed++;const error=e instanceof Error?e.message:'Abruf fehlgeschlagen';errors.push(`${source.institution}: ${error}`);await c.execute({sql:'INSERT INTO source_state(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',args:[source.id,JSON.stringify({status:'error',checkedAt:states.get(source.id)?.checkedAt??null,count:states.get(source.id)?.count??0,error})]});}
 // Renew owner-specific lease between sources.
 await c.execute({sql:'UPDATE locks SET expires=? WHERE id=? AND owner=?',args:[Date.now()+600000,'monitor',id]});
 }
 const retention=options.retentionDays??Number(process.env.RETENTION_DAYS??180);
 if(retention>0&&ok)await prune(retention);
 const b:Briefing={id,createdAt:new Date().toISOString(),day:clock.day,baseline:updated.some(i=>i.change==='baseline'),summary:briefingSummary(updated,updated.some(i=>i.change==='baseline'),ok,failed,manual),items:updated,coverage:{ok,failed,manual},errors};
 // Bei stuendlichen Laeufen wuerde jeder Lauf ein Briefing schreiben und die Liste zumuellen.
 // Gespeichert wird deshalb nur, was etwas gebracht hat - plus ein Tageseintrag, damit auch
 // ruhige Tage dokumentiert bleiben.
 const first=!(await c.execute({sql:'SELECT id FROM briefings WHERE day=? LIMIT 1',args:[clock.day]})).rows.length;
 if(updated.length||first)await c.execute({sql:'INSERT INTO briefings(id,day,data) VALUES(?,?,?)',args:[id,clock.day,JSON.stringify(b)]});
 return b;
 }finally{await c.execute({sql:'DELETE FROM locks WHERE id=? AND owner=?',args:['monitor',id]});}
}
export async function history(itemId:string){const c=await db();const r=await c.execute({sql:'SELECT data FROM versions WHERE item_id=? ORDER BY version DESC',args:[itemId]});const versions:Item[]=r.rows.map(r=>JSON.parse(String(r.data)));const render=(v:Item)=>[v.title,v.documentType,v.step??'',v.procedure??'',v.documentNumber??'',v.text].join('\n');return {versions,diff:versions.length>1?diffWords(render(versions[1]),render(versions[0])):[]};}
export async function archive(itemId:string,archived:boolean){const c=await db();const row=await c.execute({sql:'SELECT data FROM items WHERE id=?',args:[itemId]});if(!row.rows.length)throw new Error('Treffer nicht gefunden');const item=JSON.parse(String(row.rows[0].data));await c.execute({sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify({...item,archived}),itemId]});}

// Die Datenbank ist ableitbarer Zwischenstand und wird nicht versioniert. Fehlt sie - etwa weil der
// Zwischenspeicher des Zeitplans verfallen ist -, wird sie aus dem veroeffentlichten Stand aufgebaut,
// damit bereits bekannte Dokumente nicht erneut als neu gemeldet werden.
export async function seedFromSnapshot(snapshot:{items?:Item[];events?:Event[];briefings?:Briefing[]}):Promise<number>{
 const c=await db();
 const items=snapshot.items??[];
 if(!items.length)return 0;
 if((await c.execute('SELECT id FROM items LIMIT 1')).rows.length)return 0;
 await c.batch([
 // Auch je einen Versionsstand anlegen: sonst faellt nach dem Wiederaufbau der erste Vergleich aus,
 // weil die naechste Aenderung nichts hat, wogegen sie sich vergleichen liesse.
 ...items.map(i=>({sql:'INSERT OR REPLACE INTO versions(item_id,version,data) VALUES(?,?,?)',args:[i.id,i.version,JSON.stringify({...i,change:'unchanged' as const})]})),
 ...items.map(i=>({sql:'INSERT OR REPLACE INTO items(id,source_id,data) VALUES(?,?,?)',args:[i.id,i.sourceId,JSON.stringify({...i,change:'unchanged' as const})]})),
 ...(snapshot.events??[]).map(e=>({sql:'INSERT OR REPLACE INTO events(id,run_id,data) VALUES(?,?,?)',args:[e.id,'snapshot',JSON.stringify(e)]})),
 ...(snapshot.briefings??[]).map(b=>({sql:'INSERT OR REPLACE INTO briefings(id,day,data) VALUES(?,?,?)',args:[b.id,b.day,JSON.stringify(b)]}))
 ],'write');
 return items.length;
}

// Ohne Aufbewahrungsgrenze waechst der veroeffentlichte Stand unbegrenzt und die Seite wird auf dem
// Handy langsam. Archiviertes bleibt, weil es bewusst aufgehoben wurde.
export async function prune(days:number):Promise<number>{
 const c=await db();
 const cutoff=new Date(Date.now()-days*86400000).toISOString();
 const stale=await c.execute({sql:"SELECT id FROM items WHERE json_extract(data,'$.archived')=0 AND json_extract(data,'$.lastSeen')<?",args:[cutoff]});
 const ids=stale.rows.map(r=>String(r.id));
 if(!ids.length)return 0;
 const list=ids.map(()=>'?').join(',');
 await c.batch([
 {sql:`DELETE FROM versions WHERE item_id IN (${list})`,args:ids},
 {sql:`DELETE FROM events WHERE json_extract(data,'$.itemId') IN (${list})`,args:ids},
 {sql:`DELETE FROM items WHERE id IN (${list})`,args:ids}
 ],'write');
 return ids.length;
}
