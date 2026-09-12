import {randomUUID,createHash} from 'node:crypto';
import {diffWords} from 'diff';
import {committeeById,type Briefing,type Dashboard,type Item,type Event,type Source,type DocumentInput} from '../model';
import {db} from './db';import {configuredSources,ingest,lookbackStart} from './connectors';import {contentHash} from './parsing';import {lobbyEntries,enrichProjects,type LobbyEntry} from './lobby';
// Stände aus einer früheren Fassung tragen neuere Felder noch nicht. Jeder Leser bekommt deshalb
// vollständige Listen, statt an einem fehlenden Feld zu scheitern - genau daran brach ein Lauf ab.
export function asItem(raw:unknown):Item{
 const i=raw as Partial<Item>;
 return {...(i as Item),
  topics:Array.isArray(i.topics)?i.topics:[],
  committees:Array.isArray(i.committees)?i.committees:[],
  ministries:Array.isArray(i.ministries)?i.ministries:[],
  updatedAt:i.updatedAt??null,publishedAt:i.publishedAt??null,
  archived:i.archived===true};
}
// Briefings tragen ganze Dokumente mit. Zwoelf Briefings mit je zwoelf Eintraegen genuegen fuer den
// Verlauf; die vollstaendige Zahl steht in der Zusammenfassung. Die Fundstellen bleiben draussen,
// weil die Briefingansicht sie nicht zeigt - sie machten ein Drittel des Gewichts aus.
export function schlankesBriefing(b:Briefing):Briefing{
 return {...b,items:(b.items??[]).slice(0,12).map(i=>({...asItem(i),topics:[]}))};
}
export function berlinClock(date=new Date()){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=(t:string)=>parts.find(p=>p.type===t)!.value;return {day:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};}
export async function dashboard():Promise<Dashboard>{const c=await db();const [items,states,briefings,events,lobby]=await Promise.all([c.execute('SELECT data FROM items'),c.execute('SELECT id,data FROM source_state'),c.execute('SELECT data FROM briefings ORDER BY rowid DESC LIMIT 12'),c.execute('SELECT data FROM events ORDER BY rowid DESC LIMIT 300'),c.execute('SELECT data FROM lobby')]);const state=new Map(states.rows.map(s=>[s.id,JSON.parse(String(s.data))]));return {items:items.rows.map(r=>asItem(JSON.parse(String(r.data)))),sources:configuredSources().map(s=>({...s,...state.get(s.id),status:state.get(s.id)?.status??(s.kind==='manual'?'manual':s.env&&!process.env[s.env]&&s.kind!=='rss'?'setup':'pending')})),briefings:briefings.rows.map(r=>schlankesBriefing(JSON.parse(String(r.data)))).sort((a:Briefing,b:Briefing)=>b.createdAt.localeCompare(a.createdAt)),events:events.rows.map(r=>JSON.parse(String(r.data))).sort((a:Event,b:Event)=>b.at.localeCompare(a.at)),lobby:lobby.rows.map(r=>JSON.parse(String(r.data))),serverTime:new Date().toISOString(),scheduleEnabled:process.env.SCHEDULE_ENABLED==='true'};}
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
export async function runMonitor(options:{sources?:Source[]; fetcher?:(s:Source,since:string,warn?:(n:string)=>void)=>Promise<DocumentInput[]>; retentionDays?:number; lobby?:boolean; lobbyFetcher?:()=>Promise<LobbyEntry[]>}={}):Promise<Briefing|null>{
 const c=await db(),id=randomUUID(),clock=berlinClock();
 const lock=await c.execute({sql:'INSERT INTO locks(id,owner,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE locks.expires < ?',args:['monitor',id,Date.now()+600000,Date.now()]});
 if(!lock.rowsAffected)throw new Error('Ein Quellenlauf ist bereits aktiv.');
 try{
 const retention=options.retentionDays??Number(process.env.RETENTION_DAYS??10);
 // Dieselbe Grenze wie bei der Aufbewahrung, aber schon beim Eingang. Ohne sie entsteht ein
 // Kreislauf: Terminlisten liefern bei jedem Lauf dieselben alten Sitzungen, die Aufbewahrung
 // loescht sie, der naechste Lauf meldet sie erneut als "neu". Das Briefing zeigte dadurch
 // dauerhaft dreistellige Zahlen, obwohl sich nichts bewegt hatte.
 const zuAlt=retention>0?new Date(Date.now()-retention*86400000).toISOString():null;
 const veraltet=(d:DocumentInput)=>!!zuAlt&&!!(d.updatedAt??d.publishedAt)&&(d.updatedAt??d.publishedAt)!<zuAlt;
 const all=options.sources??configuredSources();const initial=await dashboard();const existing=new Map(initial.items.map(i=>[i.id,i]));const states=new Map(initial.sources.map(s=>[s.id,s]));
 // Dieselbe Drucksache erreicht die App aus zwei Richtungen. Zusammengefuehrt wird beim Eingang,
 // nicht nachtraeglich durch Loeschen: ein geloeschter Eintrag wird von seiner Quelle beim naechsten
 // Lauf erneut geliefert, gilt als neu, wird wieder geloescht - ein Kreislauf, der das Briefing
 // dauerhaft mit denselben Dokumenten fuellte.
 const jeDrucksache=new Map<string,Item>();
 for(const i of initial.items)if(i.documentNumber&&!i.archived)jeDrucksache.set(i.documentNumber,i);
 const updated:Item[]=[];let ok=0,failed=0,manual=0;const errors:string[]=[];
 for(const source of all){
 // Das Lobbyregister liefert Akteure statt Dokumente und laeuft deshalb an der Dokumentpruefung vorbei.
 if(source.kind==='lobby'){
 const now=new Date().toISOString();
 try{
 let hinweis:string|null=null;
 const n=options.lobby===false?0:await refreshLobby(options.lobbyFetcher,(h:string)=>{hinweis=h;});
 await c.execute({sql:'INSERT INTO source_state(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',args:[source.id,JSON.stringify({status:hinweis?'partial':'ok',checkedAt:now,count:n,error:hinweis})]});
 ok++;if(hinweis)errors.push(`${source.institution}: ${hinweis}`);
 }catch(e){failed++;const error=e instanceof Error?e.message:'Abruf fehlgeschlagen';errors.push(`${source.institution}: ${error}`);
 await c.execute({sql:'INSERT INTO source_state(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',args:[source.id,JSON.stringify({status:'error',checkedAt:states.get(source.id)?.checkedAt??null,count:states.get(source.id)?.count??0,error})]});}
 continue;
 }
 if(source.kind==='manual'||(source.env&&!process.env[source.env]&&source.kind!=='rss'&&!options.fetcher)){manual++;continue;}
 const now=new Date().toISOString();
 try{
 const since=lookbackStart(states.get(source.id)?.status==='ok'?states.get(source.id)?.checkedAt:undefined);
 let warning:string|null=null;
 const docs=await(options.fetcher??ingest)(source,since,(note:string)=>{warning=note;});
 const baseline=!states.get(source.id)?.checkedAt&&!initial.items.some(i=>i.sourceId===source.id);
 const statements:any[]=[];const sourceUpdates:Item[]=[];
 for(const doc of new Map(docs.map(d=>[d.externalId,d])).values()){
 if(veraltet(doc))continue;
 const itemId=createHash('sha256').update(source.id+'|'+doc.externalId).digest('hex').slice(0,24);
 const zwilling=doc.documentNumber?jeDrucksache.get(doc.documentNumber):undefined;
 if(zwilling&&zwilling.id!==itemId){
 // In den fuehrenden Eintrag einarbeiten, statt einen zweiten anzulegen.
 const themen=[...zwilling.topics];
 for(const t of doc.topics)if(!themen.some(x=>x.topic===t.topic))themen.push(t);
 const gremien=[...new Set([...zwilling.committees,...doc.committees])];
 const ressorts=[...new Set([...zwilling.ministries,...doc.ministries])];
 if(themen.length!==zwilling.topics.length||gremien.length!==zwilling.committees.length||ressorts.length!==zwilling.ministries.length){
 Object.assign(zwilling,{topics:themen,committees:gremien,ministries:ressorts,lead:zwilling.lead??doc.lead});
 statements.push({sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify(zwilling),zwilling.id]});
 }
 continue;
 }
 const old=existing.get(itemId),hash=contentHash(doc);
 const change=old?(hash===old.hash?'unchanged':'changed'):(baseline?'baseline':'new');
 const item:Item={...doc,id:itemId,sourceId:source.id,institution:source.institution,hash,version:old?old.version+(hash!==old.hash?1:0):1,change,firstSeen:old?.firstSeen??now,lastSeen:now,changedAt:change==='unchanged'?old!.changedAt:now,archived:old?.archived??false};
 if(item.documentNumber)jeDrucksache.set(item.documentNumber,item);
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
 if(ok)await deduplicate();
 if(retention>0&&ok)await prune(retention);
 // Das Briefing traegt die Dokumente mit; bei einem Erstimport waren das 184 KB fuer einen einzigen
 // Eintrag. Fuer die Anzeige reichen die ersten 60 - die Gesamtzahl steht in der Zusammenfassung.
 const b:Briefing={id,createdAt:new Date().toISOString(),day:clock.day,baseline:updated.some(i=>i.change==='baseline'),summary:briefingSummary(updated,updated.some(i=>i.change==='baseline'),ok,failed,manual),items:updated.slice(0,40),coverage:{ok,failed,manual},errors};
 // Jeder Lauf wird dokumentiert, sonst zeigt das Lagebild die Meldung eines aelteren Laufs neben
 // dem Zeitstempel des juengsten - genau dieser Widerspruch war in der Oberflaeche sichtbar.
 // Damit die Liste nicht zulaeuft, ersetzt ein Lauf ohne Aenderung den vorherigen Leerlauf des Tages.
 if(!updated.length)await c.execute({sql:"DELETE FROM briefings WHERE day=? AND json_array_length(json_extract(data,'$.items'))=0",args:[clock.day]});
 await c.execute({sql:'INSERT INTO briefings(id,day,data) VALUES(?,?,?)',args:[id,clock.day,JSON.stringify(b)]});
 return b;
 }finally{await c.execute({sql:'DELETE FROM locks WHERE id=? AND owner=?',args:['monitor',id]});}
}
export async function history(itemId:string){const c=await db();const r=await c.execute({sql:'SELECT data FROM versions WHERE item_id=? ORDER BY version DESC',args:[itemId]});const versions:Item[]=r.rows.map(r=>asItem(JSON.parse(String(r.data))));const render=(v:Item)=>[v.title,v.documentType,v.step??'',v.procedure??'',v.documentNumber??'',v.text].join('\n');return {versions,diff:versions.length>1?diffWords(render(versions[1]),render(versions[0])):[]};}
export async function archive(itemId:string,archived:boolean){const c=await db();const row=await c.execute({sql:'SELECT data FROM items WHERE id=?',args:[itemId]});if(!row.rows.length)throw new Error('Treffer nicht gefunden');const item=asItem(JSON.parse(String(row.rows[0].data)));await c.execute({sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify({...item,archived}),itemId]});}

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
 ...items.map(i=>({sql:'INSERT OR REPLACE INTO versions(item_id,version,data) VALUES(?,?,?)',args:[i.id,i.version,JSON.stringify({...asItem(i),change:'unchanged' as const})]})),
 ...items.map(i=>({sql:'INSERT OR REPLACE INTO items(id,source_id,data) VALUES(?,?,?)',args:[i.id,i.sourceId,JSON.stringify({...asItem(i),change:'unchanged' as const})]})),
 ...(snapshot.events??[]).map(e=>({sql:'INSERT OR REPLACE INTO events(id,run_id,data) VALUES(?,?,?)',args:[e.id,'snapshot',JSON.stringify(e)]})),
 ...(snapshot.briefings??[]).map(b=>({sql:'INSERT OR REPLACE INTO briefings(id,day,data) VALUES(?,?,?)',args:[b.id,b.day,JSON.stringify(b)]}))
 ],'write');
 return items.length;
}

// Entfernt, was aelter als die Aufbewahrungsfrist ist. Massstab ist das Datum des Dokuments selbst
// (Bewegung laut Quelle, sonst Veroeffentlichung, sonst Erstkontakt) - nicht der letzte Abruf, sonst
// blieben monatealte Papiere liegen, nur weil die App sie gestern wiedergesehen hat.
// Kuenftige Termine haben ein Datum in der Zukunft und werden dadurch nie entfernt.
// Archiviertes bleibt, weil es bewusst aufgehoben wurde.
export async function prune(days:number):Promise<number>{
 const c=await db();
 // Briefings sammeln sich sonst unbegrenzt an. Ausgeliefert werden ohnehin nur die letzten 30.
 await c.execute('DELETE FROM briefings WHERE rowid NOT IN (SELECT rowid FROM briefings ORDER BY rowid DESC LIMIT 60)');
 const cutoff=new Date(Date.now()-days*86400000).toISOString();
 const stale=await c.execute({sql:`SELECT id FROM items WHERE json_extract(data,'$.archived')=0
  AND COALESCE(json_extract(data,'$.updatedAt'),json_extract(data,'$.publishedAt'),json_extract(data,'$.firstSeen'))<?`,args:[cutoff]});
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

// Das Lobbyregister beschreibt Akteure, nicht Dokumente. Es laeuft deshalb neben der Dokumentpruefung
// und wird bei jedem erfolgreichen Lauf vollstaendig ersetzt; der Registerstand ist die Wahrheit.
export async function refreshLobby(fetcher:(warn?:(n:string)=>void)=>Promise<LobbyEntry[]>=lobbyEntries,warn?:(n:string)=>void):Promise<number>{
 const entries=await fetcher(warn);
 if(!entries.length)throw new Error('Lobbyregister lieferte keine Einträge');
 const c=await db();
 // Bereits geholte Vorhaben uebernehmen, statt sie bei jedem Lauf neu zu laden.
 const bekannt=new Map((await c.execute('SELECT data FROM lobby')).rows.map(r=>{const e=JSON.parse(String(r.data)) as LobbyEntry;return [e.registerNumber,e];}));
 const mitVorhaben=await enrichProjects(entries,bekannt);
 await c.batch([{sql:'DELETE FROM lobby',args:[]},
 ...mitVorhaben.map(e=>({sql:'INSERT INTO lobby(register_number,data) VALUES(?,?)',args:[e.registerNumber,JSON.stringify(e)]}))],'write');
 return mitVorhaben.length;
}

// Dieselbe Drucksache erreicht die App aus zwei Richtungen: als Ausschussueberweisung (mit Gremien,
// aber nur der Titel durchsucht) und aus der Volltextsuche (mit Themen, aber ohne Gremien). Eine
// Zusammenfuehrung nur innerhalb eines Laufs reicht nicht - die Quellen haben unterschiedliche
// Zeitfenster, und Altbestand aus frueheren Laeufen bliebe liegen. Deshalb ein Durchgang ueber den
// ganzen Bestand: der Eintrag mit den meisten Gremien behaelt die Fuehrung und erbt Themen und
// Ressorts der anderen, die samt Versionen und Ereignissen verschwinden.
export async function deduplicate():Promise<number>{
 const c=await db();
 const alle:Item[]=(await c.execute('SELECT data FROM items')).rows.map(r=>asItem(JSON.parse(String(r.data))));
 const gruppen=new Map<string,Item[]>();
 for(const i of alle){if(!i.documentNumber||i.archived)continue;const g=gruppen.get(i.documentNumber)??[];g.push(i);gruppen.set(i.documentNumber,g);}
 const statements:{sql:string;args:string[]}[]=[];let entfernt=0;
 for(const gruppe of gruppen.values()){
  if(gruppe.length<2)continue;
  const [behalten,...weg]=[...gruppe].sort((a,b)=>b.committees.length-a.committees.length||b.topics.length-a.topics.length||a.firstSeen.localeCompare(b.firstSeen));
  const themen=[...behalten.topics];
  const ressorts=new Set(behalten.ministries);
  const gremien=new Set(behalten.committees);
  for(const d of weg){
   for(const t of d.topics)if(!themen.some(x=>x.topic===t.topic))themen.push(t);
   for(const m of d.ministries)ressorts.add(m);
   for(const k of d.committees)gremien.add(k);
   statements.push({sql:'DELETE FROM versions WHERE item_id=?',args:[d.id]},
    {sql:"DELETE FROM events WHERE json_extract(data,'$.itemId')=?",args:[d.id]},
    {sql:'DELETE FROM items WHERE id=?',args:[d.id]});
   entfernt++;
  }
  const vereint={...behalten,topics:themen,ministries:[...ressorts],committees:[...gremien]};
  statements.push({sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify(vereint),behalten.id]});
 }
 if(statements.length)await c.batch(statements,'write');
 return entfernt;
}
