import {SOURCES,COMMITTEES,MINISTRIES,committeeByKuerzel,type Source,type DocumentInput} from '../model';
import {parseFeed,parseCommitteeEvents,parseAgendaTable,officialURL,clean} from './parsing';
import {scanTopics} from './topics';
export function configuredSources():Source[]{return SOURCES.map(s=>({...s,...(s.kind==='rss'&&s.env&&process.env[s.env]?{feed:process.env[s.env]}:{})}));}
export class PermanentSourceError extends Error {}
// Standardgrenze 4 MB. Die Volltextsuche braucht mehr: eine einzelne Seite kann ein
// Haushaltsgesetz im Volltext enthalten.
export const FULLTEXT_LIMIT=32*1024*1024;
export async function fetchOfficial(url:string,headers:Record<string,string>={},maxBytes=4_000_000):Promise<string>{
 if(!officialURL(url))throw new PermanentSourceError('Nur freigegebene amtliche HTTPS-Domains erlaubt');
 for(let attempt=0;attempt<3;attempt++){
 try{
 let next=url;
 for(let hop=0;hop<4;hop++){
 const r=await fetch(next,{redirect:'manual',headers:{'User-Agent':'PolicyMonitor/1.0 (public-source monitoring)',...headers},signal:AbortSignal.timeout(10000)});
 if([301,302,303,307,308].includes(r.status)){
 const loc=r.headers.get('location'); if(!loc)throw new PermanentSourceError('Leere Weiterleitung');
 const target=new URL(loc,next).href;
 if(!officialURL(target)||new URL(target).origin!==new URL(url).origin&&Object.keys(headers).length)throw new PermanentSourceError('Weiterleitung nicht freigegeben'); next=target;continue;
 }
 if(!r.ok)throw r.status>=400&&r.status<500?new PermanentSourceError(`Quellenabruf HTTP ${r.status}`):new Error(`Quellenabruf HTTP ${r.status}`);
 if(Number(r.headers.get('content-length')??0)>maxBytes)throw new Error(`Quelle überschreitet ${Math.round(maxBytes/1048576)} MB`);
 const reader=r.body?.getReader();if(!reader)throw new Error('Leere Antwort');
 let size=0; const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new Error(`Quelle überschreitet ${Math.round(maxBytes/1048576)} MB`);}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
 }
 throw new Error('Zu viele Weiterleitungen');
 }catch(e){if(attempt===2||e instanceof PermanentSourceError)throw e;await new Promise(r=>setTimeout(r,500*2**attempt));}
 }throw new Error('Abruf fehlgeschlagen');
}
const WAHLPERIODE=Number(process.env.DIP_WAHLPERIODE??21);
// Erfasstes Zeitfenster: ab dem letzten erfolgreichen Abruf mit zwei Tagen Überlappung, höchstens 30 Tage zurück.
export function lookbackStart(checkedAt?:string):string{
 const floor=Date.now()-30*86400000, overlap=checkedAt?Date.parse(checkedAt)-2*86400000:Date.now()-14*86400000;
 return new Date(Math.max(floor,Number.isFinite(overlap)?overlap:Date.now()-14*86400000)).toISOString().replace(/\.\d+Z$/,'Z');
}
async function dipPages(endpoint:string,since:string,onPage:(docs:any[])=>void,maxBytes?:number):Promise<void>{
 if(!process.env.DIP_API_KEY)throw new Error('DIP_API_KEY fehlt');
 let cursor:string|undefined;
 for(let page=0;page<100;page++){
 const u=new URL(`https://search.dip.bundestag.de/api/v1/${endpoint}`);
 u.searchParams.set('f.wahlperiode',String(WAHLPERIODE));u.searchParams.set('f.aktualisiert.start',since);u.searchParams.set('format','json');
 if(cursor)u.searchParams.set('cursor',cursor);
 const p=JSON.parse(await fetchOfficial(u.href,{Authorization:`ApiKey ${process.env.DIP_API_KEY}`},maxBytes));
 if(!Array.isArray(p.documents))throw new Error('Unerwartetes DIP-Format');
 onPage(p.documents);
 if(!p.documents.length||!p.cursor||p.cursor===cursor)return;
 cursor=p.cursor;
 }
 throw new Error(`DIP-Seitenlimit erreicht; das Fenster ab ${since.slice(0,10)} wurde nicht vollständig abgerufen`);
}
const iso=(d:unknown)=>typeof d==='string'&&!isNaN(Date.parse(d))?new Date(d).toISOString():null;
// Überweisungen in die kuratierten Ausschüsse. Alles andere wird verworfen, bevor es in die App kommt.
export function mapCommitteePosition(d:any):DocumentInput|null{
 const referrals:{id:string;lead:boolean}[]=(Array.isArray(d?.ueberweisung)?d.ueberweisung as any[]:[]).flatMap((u:any)=>{const c=committeeByKuerzel(String(u?.ausschuss_kuerzel??''));const lead=u?.federfuehrung===true;return c&&(lead||!c.leadOnly)?[{id:c.id,lead}]:[];});
 if(!referrals.length||!d?.id||!d?.titel)return null;
 const f=d.fundstelle??{};
 return {externalId:String(d.id),title:clean(d.titel),url:d.vorgang_id?`https://dip.bundestag.de/vorgang/${d.vorgang_id}`:`https://dip.bundestag.de/vorgangsposition/${d.id}`,
 text:'',publishedAt:iso(d.datum),updatedAt:iso(d.aktualisiert),documentType:clean(f.drucksachetyp??d.dokumentart??'Vorgangsposition'),step:d.vorgangsposition?clean(d.vorgangsposition):null,
 procedure:d.vorgangstyp?clean(d.vorgangstyp):null,documentNumber:f.dokumentnummer?clean(f.dokumentnummer):null,pdfUrl:typeof f.pdf_url==='string'&&officialURL(f.pdf_url)?f.pdf_url:null,
 committees:[...new Set(referrals.map(r=>r.id))],lead:referrals.find(r=>r.lead)?.id??null,ministries:[],topics:scanTopics(clean(d.titel)),
 originator:(Array.isArray(f.urheber)?f.urheber:[]).map((u:unknown)=>clean(u)).join(', ')||null};
}
export async function committeeDocuments(since:string):Promise<DocumentInput[]>{
 const docs:DocumentInput[]=[];
 await dipPages('vorgangsposition',since,page=>{for(const d of page){const m=mapCommitteePosition(d);if(m)docs.push(m);}});
 return docs;
}
// Volltextsuche ueber alle Drucksachen der Wahlperiode. Behalten wird, was eines der TRUMPF-Themen
// nachweislich erwaehnt oder aus einem der ausgewaehlten Ressorts stammt. Der Volltext macht den
// Unterschied: ein Dual-Use-Bezug steht selten im Titel.
export function mapFulltextDrucksache(d:any):DocumentInput|null{
 if(!d?.id||!d?.titel)return null;
 const f=d.fundstelle??{};
 const originators:string[]=(Array.isArray(f.urheber)?f.urheber:[]).map((u:unknown)=>clean(u));
 const hit=MINISTRIES.filter(m=>originators.some(o=>m.match.some(x=>o.toLowerCase().includes(x))));
 const title=clean(d.titel);
 const topics=scanTopics(title,typeof d.text==='string'?d.text:'');
 if(!hit.length&&!topics.length)return null;
 return {externalId:String(d.id),title,url:`https://dip.bundestag.de/drucksache/${d.id}`,
 text:'',publishedAt:iso(d.datum),updatedAt:iso(d.aktualisiert),documentType:clean(d.drucksachetyp??d.dokumentart??'Drucksache'),
 step:null,procedure:null,documentNumber:d.dokumentnummer?clean(d.dokumentnummer):null,
 pdfUrl:typeof f.pdf_url==='string'&&officialURL(f.pdf_url)?f.pdf_url:null,
 committees:[],lead:null,ministries:hit.map(m=>m.id),originator:originators.join(', ')||null,topics};
}
export async function fulltextDocuments(since:string):Promise<DocumentInput[]>{
 const docs:DocumentInput[]=[];
 await dipPages('drucksache-text',since,page=>{for(const d of page){const m=mapFulltextDrucksache(d);if(m)docs.push(m);}},FULLTEXT_LIMIT);
 return docs;
}
const FILTERLIST='https://www.bundestag.de/ajax/filterlist/de/ausschuesse/';
// Der amtliche RSS-Feed ist auf 15 Eintraege ueber alle Ausschuesse gedeckelt. Die Tagesordnungsliste
// hinter derselben Seite liefert dieselben amtlichen PDFs mit Ausschussspalte und ohne diese Grenze.
export function matchCommitteeName(label:string):string|null{
 // Die Ausschussspalte ist kurz ("Verteidigung"), der amtliche Name lang ("Verteidigungsausschuss").
 // Deshalb gilt ein Wortpaar als Treffer, wenn das kuerzere Wort das laengere anfuehrt oder beide
 // mindestens sechs Zeichen gemeinsamen Wortstamm haben.
 const words=(x:string)=>x.toLowerCase().split(/[^a-zäöüß]+/).filter(w=>w.length>4);
 const stem=(a:string,b:string)=>{const [s,l]=a.length<=b.length?[a,b]:[b,a];if(l.startsWith(s))return true;let i=0;while(i<s.length&&s[i]===l[i])i++;return i>=6;};
 const target=words(label);
 if(!target.length)return null;
 let best:{id:string;hits:number}|null=null;
 for(const c of COMMITTEES){
 if(c.institution!=='Bundestag')continue;
 const name=words(c.name);
 const hits=target.filter(t=>name.some(n=>stem(t,n))).length;
 if(hits&&hits>=target.length/2&&(!best||hits>best.hits))best={id:c.id,hits};
 }
 return best?.id??null;
}
export async function agendaDocuments():Promise<DocumentInput[]>{
 const url=`${FILTERLIST}1061622-1061622?offset=0&limit=50&noFilterSet=true`;
 return parseAgendaTable(await fetchOfficial(url),url).flatMap(row=>{
 const id=matchCommitteeName(row.committee);
 return id?[{externalId:row.url,title:row.title,url:row.url,text:'',publishedAt:row.date,updatedAt:row.date,topics:scanTopics(row.title),documentType:'Tagesordnung',step:'Sitzungstermin',
 procedure:null,documentNumber:null,pdfUrl:row.url.endsWith('.pdf')?row.url:null,committees:[id],lead:id,ministries:[],originator:null}]:[];
 });
}
// Anhoerungen und oeffentliche Sitzungen je ausgewaehltem Ausschuss. Eine leere Liste ist ein Fehler:
// bricht das CMS die Struktur, faellt das auf, statt still nichts zu liefern.
export async function eventDocuments(warn?:(note:string)=>void):Promise<DocumentInput[]>{
 const withEvents=COMMITTEES.filter(c=>c.events);
 const docs:DocumentInput[]=[];const failed:string[]=[];
 for(const c of withEvents){
 const url=`${FILTERLIST}${c.events}?offset=0&limit=10&noFilterSet=true`;
 try{
 const rows=parseCommitteeEvents(await fetchOfficial(url),url);
 if(!rows.length)throw new Error('keine Einträge im erwarteten Format');
 for(const row of rows)docs.push({externalId:row.url,title:row.title,url:row.url,text:'',publishedAt:row.date,updatedAt:row.date,topics:scanTopics(row.title),
 documentType:'Ausschusstermin',step:'Anhörung oder Sitzung',procedure:null,documentNumber:null,pdfUrl:null,
 committees:[c.id],lead:c.id,ministries:[],originator:c.name});
 }catch(e){failed.push(`${c.short}: ${e instanceof Error?e.message:'Abruf fehlgeschlagen'}`);}
 }
 if(failed.length>withEvents.length/2)throw new Error(`Terminlisten überwiegend nicht lesbar (${failed.slice(0,3).join('; ')})`);
 // Ein einzelner Ausschuss, dessen Liste bricht, darf nicht unbemerkt aus der App verschwinden.
 if(failed.length)warn?.(`${failed.length} von ${withEvents.length} Terminlisten nicht lesbar: ${failed.join('; ')}`);
 return docs;
}
export async function ingest(source:Source,since:string,warn?:(note:string)=>void):Promise<DocumentInput[]>{
 if(source.kind==='committee-dip')return committeeDocuments(since);
 if(source.kind==='fulltext-dip')return fulltextDocuments(since);
 if(source.kind==='committee-agenda')return agendaDocuments();
 if(source.kind==='committee-events')return eventDocuments(warn);
 if(source.kind==='ministry-drafts')return ministryDrafts();
 if(source.kind==='rss'&&source.feed)return parseFeed(await fetchOfficial(source.feed),source.feed);
 throw new Error('Manuelle Ergänzung erforderlich');
}

// Gesetzesvorhaben des BMF ueber die Sitemap. Die Inhaltsseiten des Ministeriums liegen hinter
// einem Bot-Schutz und werden bewusst nicht abgerufen - die Sitemap ist in der robots.txt
// ausdruecklich fuer Maschinen ausgewiesen und liefert Adresse und Aenderungsdatum.
// Der Titel bleibt deshalb unbekannt; als Bezeichnung dient das amtliche Kuerzel aus der Adresse.
export const BMF_SITEMAP='https://www.bundesfinanzministerium.de/sitemap.xml';
export function bmfLabel(slug:string):string{
 return slug.replace(/^\d{4}-\d{2}-\d{2}-/,'').replace(/^G-/,'').replace(/-/g,' ')
  .replace(/Aenderung/g,'Änderung').replace(/Ueber/g,'Über').replace(/ae/g,'ä').replace(/\s+/g,' ').trim();
}
export function parseMinistryDrafts(xml:string):DocumentInput[]{
 const out:DocumentInput[]=[];
 const paare=[...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]*)<\/lastmod>)?/g)];
 for(const [,loc,lastmod] of paare){
  if(!loc.includes('Gesetze_Gesetzesvorhaben')||!officialURL(loc))continue;
  const m=/\/(\d{4}-\d{2}-\d{2})-([^/]+)\//.exec(loc);
  if(!m)continue;
  const [,datum,slug]=m;
  const bezeichnung=bmfLabel(slug);
  if(!bezeichnung)continue;
  out.push({externalId:loc,title:`Gesetzesvorhaben ${bezeichnung}`,url:loc,text:'',
   publishedAt:iso(datum),updatedAt:iso(lastmod)??iso(datum),topics:scanTopics(bezeichnung),
   documentType:'Referentenentwurf',step:'Vorbereitung im Ressort',procedure:null,documentNumber:null,pdfUrl:null,
   committees:[],lead:null,ministries:['bmf'],originator:'Bundesministerium der Finanzen'});
 }
 // Alle Eintraege teilen sich eine Adresse pro Vorhaben; Dubletten aus mehreren Unterseiten entfernen.
 const je=new Map(out.map(d=>[d.externalId,d]));
 return [...je.values()];
}
export async function ministryDrafts():Promise<DocumentInput[]>{
 const xml=await fetchOfficial(BMF_SITEMAP,{},8*1024*1024);
 const drafts=parseMinistryDrafts(xml);
 if(!drafts.length)throw new Error('Sitemap enthält keine Gesetzesvorhaben im erwarteten Format');
 return drafts;
}
