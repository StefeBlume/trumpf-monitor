import {SOURCES,COMMITTEES,MINISTRIES,committeeByKuerzel,type Source,type DocumentInput} from '../model';
import {parseFeed,officialURL,clean} from './parsing';
export function configuredSources():Source[]{return SOURCES.map(s=>({...s,...(s.kind==='rss'&&s.env&&process.env[s.env]?{feed:process.env[s.env]}:{})}));}
export async function fetchOfficial(url:string,headers:Record<string,string>={}):Promise<string>{
 if(!officialURL(url))throw new Error('Nur freigegebene amtliche HTTPS-Domains erlaubt');
 for(let attempt=0;attempt<3;attempt++){
 try{
 let next=url;
 for(let hop=0;hop<4;hop++){
 const r=await fetch(next,{redirect:'manual',headers:{'User-Agent':'PolicyMonitor/1.0 (public-source monitoring)',...headers},signal:AbortSignal.timeout(10000)});
 if([301,302,303,307,308].includes(r.status)){
 const loc=r.headers.get('location'); if(!loc)throw new Error('Leere Weiterleitung');
 const target=new URL(loc,next).href;
 if(!officialURL(target)||new URL(target).origin!==new URL(url).origin&&Object.keys(headers).length)throw new Error('Weiterleitung nicht freigegeben'); next=target;continue;
 }
 if(!r.ok)throw new Error(`Quellenabruf HTTP ${r.status}`);
 if(Number(r.headers.get('content-length')??0)>4000000)throw new Error('Quelle überschreitet 4 MB');
 const reader=r.body?.getReader();if(!reader)throw new Error('Leere Antwort');
 let size=0; const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4000000){await reader.cancel();throw new Error('Quelle überschreitet 4 MB');}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
 }
 throw new Error('Zu viele Weiterleitungen');
 }catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,500*2**attempt));}
 }throw new Error('Abruf fehlgeschlagen');
}
const WAHLPERIODE=Number(process.env.DIP_WAHLPERIODE??21);
// Erfasstes Zeitfenster: ab dem letzten erfolgreichen Abruf mit zwei Tagen Überlappung, höchstens 30 Tage zurück.
export function lookbackStart(checkedAt?:string):string{
 const floor=Date.now()-30*86400000, overlap=checkedAt?Date.parse(checkedAt)-2*86400000:Date.now()-14*86400000;
 return new Date(Math.max(floor,Number.isFinite(overlap)?overlap:Date.now()-14*86400000)).toISOString().replace(/\.\d+Z$/,'Z');
}
async function dipPages(endpoint:string,since:string,onPage:(docs:any[])=>void):Promise<void>{
 if(!process.env.DIP_API_KEY)throw new Error('DIP_API_KEY fehlt');
 let cursor:string|undefined;
 for(let page=0;page<40;page++){
 const u=new URL(`https://search.dip.bundestag.de/api/v1/${endpoint}`);
 u.searchParams.set('f.wahlperiode',String(WAHLPERIODE));u.searchParams.set('f.aktualisiert.start',since);u.searchParams.set('format','json');
 if(cursor)u.searchParams.set('cursor',cursor);
 const p=JSON.parse(await fetchOfficial(u.href,{Authorization:`ApiKey ${process.env.DIP_API_KEY}`}));
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
 text:'',publishedAt:iso(d.datum),documentType:clean(f.drucksachetyp??d.dokumentart??'Vorgangsposition'),step:d.vorgangsposition?clean(d.vorgangsposition):null,
 procedure:d.vorgangstyp?clean(d.vorgangstyp):null,documentNumber:f.dokumentnummer?clean(f.dokumentnummer):null,pdfUrl:typeof f.pdf_url==='string'&&officialURL(f.pdf_url)?f.pdf_url:null,
 committees:[...new Set(referrals.map(r=>r.id))],lead:referrals.find(r=>r.lead)?.id??null,ministries:[],
 originator:(Array.isArray(f.urheber)?f.urheber:[]).map((u:unknown)=>clean(u)).join(', ')||null};
}
export async function committeeDocuments(since:string):Promise<DocumentInput[]>{
 const docs:DocumentInput[]=[];
 await dipPages('vorgangsposition',since,page=>{for(const d of page){const m=mapCommitteePosition(d);if(m)docs.push(m);}});
 return docs;
}
// Drucksachen, deren amtliches Urheberfeld eines der kuratierten Ressorts nennt.
export function mapMinistryDrucksache(d:any):DocumentInput|null{
 const f=d?.fundstelle??{};
 const originators:string[]=(Array.isArray(f.urheber)?f.urheber:[]).map((u:unknown)=>clean(u));
 const hit=MINISTRIES.filter(m=>originators.some(o=>m.match.some(x=>o.toLowerCase().includes(x))));
 if(!hit.length||!d?.id||!d?.titel)return null;
 return {externalId:String(d.id),title:clean(d.titel),url:`https://dip.bundestag.de/drucksache/${d.id}`,
 text:'',publishedAt:iso(d.datum),documentType:clean(d.drucksachetyp??d.dokumentart??'Drucksache'),step:null,procedure:null,
 documentNumber:d.dokumentnummer?clean(d.dokumentnummer):null,pdfUrl:typeof f.pdf_url==='string'&&officialURL(f.pdf_url)?f.pdf_url:null,
 committees:[],lead:null,ministries:hit.map(m=>m.id),originator:originators.join(', ')||null};
}
export async function ministryDocuments(since:string):Promise<DocumentInput[]>{
 const docs:DocumentInput[]=[];
 await dipPages('drucksache',since,page=>{for(const d of page){const m=mapMinistryDrucksache(d);if(m)docs.push(m);}});
 return docs;
}
// Der amtliche RSS-Feed stellt den Ausschussnamen dem Titel voran: "Wirtschaft und Energie: 12. Sitzung ...".
export function matchAgendaCommittee(title:string):string|null{
 const prefix=title.split(':')[0].toLowerCase();
 if(prefix===title.toLowerCase())return null;
 const words=(s:string)=>s.toLowerCase().split(/[^a-zäöüß]+/).filter(w=>w.length>4);
 let best:{id:string;hits:number}|null=null;
 for(const c of COMMITTEES){
 if(c.institution!=='Bundestag')continue;
 const terms=words(c.name);const hits=terms.filter(t=>prefix.includes(t)).length;
 if(hits&&hits>=terms.length/2&&(!best||hits>best.hits))best={id:c.id,hits};
 }
 return best?.id??null;
}
export async function agendaDocuments(feed:string):Promise<DocumentInput[]>{
 return parseFeed(await fetchOfficial(feed),feed).flatMap(d=>{
 const id=matchAgendaCommittee(d.title);
 return id?[{...d,documentType:'Tagesordnung',step:'Sitzungstermin',committees:[id],lead:id,pdfUrl:d.url.endsWith('.pdf')?d.url:null}]:[];
 });
}
export async function ingest(source:Source,since:string):Promise<DocumentInput[]>{
 if(source.kind==='committee-dip')return committeeDocuments(since);
 if(source.kind==='ministry-dip')return ministryDocuments(since);
 if(source.kind==='committee-agenda'&&source.feed)return agendaDocuments(source.feed);
 if(source.kind==='rss'&&source.feed)return parseFeed(await fetchOfficial(source.feed),source.feed);
 throw new Error('Manuelle Ergänzung erforderlich');
}
