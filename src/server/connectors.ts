import {SOURCES,COMMITTEES,MINISTRIES,committeeByKuerzel,type Source,type DocumentInput} from '../model';
import {parseFeed,parseCommitteeEvents,parseAgendaTable,officialURL,clean,dipUrl,sitzungstag} from './parsing';
import {scanTopics} from './topics';
export function configuredSources():Source[]{return SOURCES.map(s=>({...s,...(s.kind==='rss'&&s.env&&process.env[s.env]?{feed:process.env[s.env]}:{})}));}
export class PermanentSourceError extends Error {}
// Das Zeitlimit umfasst auch das Lesen des Rumpfes. Bei festen 10 Sekunden bricht eine 26-MB-Antwort
// der Volltextsuche auf einer langsamen Leitung ab, deshalb waechst es mit der erlaubten Groesse -
// gedeckelt, damit ein haengender Server den Lauf nicht blockiert.
export const fetchTimeoutFor=(maxBytes:number)=>Math.min(90_000,Math.max(10_000,Math.round(maxBytes/1_000_000)*2_000));
// Standardgrenze 4 MB. Die Volltextsuche braucht mehr: eine einzelne Seite kann ein
// Haushaltsgesetz im Volltext enthalten.
export const FULLTEXT_LIMIT=32*1024*1024;
export async function fetchOfficial(url:string,headers:Record<string,string>={},maxBytes=4_000_000):Promise<string>{
 if(!officialURL(url))throw new PermanentSourceError('Nur freigegebene amtliche HTTPS-Domains erlaubt');
 const timeout=fetchTimeoutFor(maxBytes);
 for(let attempt=0;attempt<3;attempt++){
 try{
 let next=url;
 for(let hop=0;hop<4;hop++){
 const r=await fetch(next,{redirect:'manual',headers:{'User-Agent':'PolicyMonitor/1.0 (public-source monitoring)',...headers},signal:AbortSignal.timeout(timeout)});
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
// Ob ein amtliches PDF abrufbar ist, und der Zeitstempel des Servers. Am 16.09. fuehrte das DIP die Antworten 21/8016 bis
// 21/8026 schon, dserver.bundestag.de antwortete fuer ihre PDF aber mit 404 - die App bot einen toten Link an. Bei den Antworten
// 21/7968 bis 21/7988 (datiert 9. und 10.09.) nannte der Server 16.09., 07:51 - dieselbe Minute wie das DIP.
// null heisst: keine belastbare Antwort, beim naechsten Lauf erneut fragen.
export async function pdfKopf(url:string):Promise<{stand:'online'|'fehlt';zeit:string|null}|null>{
 if(!officialURL(url))return null;
 try{
  let next=url;
  for(let hop=0;hop<4;hop++){
   const r=await fetch(next,{method:'HEAD',redirect:'manual',headers:{'User-Agent':'PolicyMonitor/1.0 (public-source monitoring)'},signal:AbortSignal.timeout(15_000)});
   if([301,302,303,307,308].includes(r.status)){
    const loc=r.headers.get('location');if(!loc)return null;
    const ziel=new URL(loc,next).href;if(!officialURL(ziel))return null;next=ziel;continue;
   }
   if(r.status===404||r.status===410)return {stand:'fehlt',zeit:null};
   if(!r.ok)return null;
   const t=Date.parse(r.headers.get('last-modified')??'');
   return {stand:'online',zeit:isNaN(t)?null:new Date(t).toISOString()};
  }
  return null;
 }catch{return null;}
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
 // Die Volltextsuche liefert nur zehn Dokumente je Seite. Ein 30-Tage-Fenster nach einer laengeren
 // Pause sind rund 675 Dokumente, also 68 Seiten - zu nah an einer Grenze von 100.
 for(let page=0;page<200;page++){
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
// Eine Nummer allein benennt kein Papier. "21/90" ist im DIP zugleich eine Bundesrats-Verordnung von
// 1990, eine Kleine Anfrage des Bundestages und das Plenarprotokoll der 90. Sitzung, auf das 85
// Positionen verschiedener Vorgaenge verweisen. Zusammengefuehrt werden duerfen deshalb nur Drucksachen,
// und nur mit Herausgeber: Bundestag und Bundesrat fuehren eigene Nummernkreise.
export function papierschluessel(herausgeber:unknown,dokumentart:unknown,nummer:unknown):string|null{
 return dokumentart==='Drucksache'&&(herausgeber==='BT'||herausgeber==='BR')&&typeof nummer==='string'&&nummer.trim()
  ?`${herausgeber}-Drucksache ${clean(nummer)}`:null;
}
// Das DIP pflegt Plenarprotokoll-Positionen nachtraeglich: am 04.09.2026 standen Beratungen vom 12.09.2025, 04.12.2025 und
// 29.01.2026 mit diesem "aktualisiert" in der Liste, obwohl ihre Vorgaenge zuletzt im Januar 2026 bewegt wurden. Die App zeigte
// sie als Bewegung vom September, sortierte sie nach oben und meldete sie als neu. Ueberwiesen wird in der Debatte selbst -
// ihr Datum ist die Bewegung. Bei Drucksachen bleibt es bei "aktualisiert": der Bundesrat ueberweist Vorlagen oft Wochen spaeter.
export const beratungImPlenum=(fundstelle:any)=>fundstelle?.dokumentart==='Plenarprotokoll';
export function mapCommitteePosition(d:any):DocumentInput|null{
 const ueberwiesen=(Array.isArray(d?.ueberweisung)?d.ueberweisung as any[]:[]).flatMap((u:any)=>{const c=committeeByKuerzel(String(u?.ausschuss_kuerzel??''));return c?[{c,lead:u?.federfuehrung===true}]:[];});
 const referrals:{id:string;lead:boolean}[]=ueberwiesen.filter(r=>r.lead||!r.c.leadOnly).map(r=>({id:r.c.id,lead:r.lead}));
 // Mitberatende Querschnittsausschuesse zaehlen nicht, werden aber vermerkt, damit die Dokumentansicht sie nennen kann.
 // Ein pauschaler Hinweis hing am federfuehrenden Ausschuss und traf bei 30 von 53 Vorlagen nicht zu.
 const nurMitberatend=[...new Set(ueberwiesen.filter(r=>!r.lead&&r.c.leadOnly).map(r=>r.c.id))].filter(id=>!referrals.some(r=>r.id===id));
 if(!referrals.length||!d?.id||!d?.titel)return null;
 const f=d.fundstelle??{};
 return {externalId:String(d.id),title:clean(d.titel),url:d.vorgang_id?dipUrl('vorgang',d.vorgang_id,clean(d.titel)):f.id?dipUrl('drucksache',f.id,clean(d.titel)):`https://dip.bundestag.de/suche?f.id=${encodeURIComponent(String(d.id))}`,
 text:'',publishedAt:iso(d.datum),updatedAt:beratungImPlenum(f)?(iso(d.datum)??iso(d.aktualisiert)):iso(d.aktualisiert),documentType:clean(f.drucksachetyp??d.dokumentart??'Vorgangsposition'),step:d.vorgangsposition?clean(d.vorgangsposition):null,
 procedure:d.vorgangstyp?clean(d.vorgangstyp):null,documentNumber:f.dokumentnummer&&f.dokumentart!=='Plenarprotokoll'?clean(f.dokumentnummer):null,paperKey:papierschluessel(f.herausgeber,f.dokumentart,f.dokumentnummer),pdfUrl:typeof f.pdf_url==='string'&&officialURL(f.pdf_url)?f.pdf_url:null,
 committees:[...new Set(referrals.map(r=>r.id))],lead:referrals.find(r=>r.lead)?.id??null,nurMitberatend,ministries:[],topics:scanTopics(clean(d.titel)),
 originator:(Array.isArray(f.urheber)?f.urheber:[]).map((u:unknown)=>clean(u)).join(', ')||null};
}
// Gesammelte Ueberweisungen (§ 80 Abs. 3 und § 92 GO-BT) verweisen auf eine Sammel-Unterrichtung, die viele Vorlagen auflistet.
// Am 13.09. trugen 19 Eintraege deren Nummer 21/7984, und "Amtliches PDF oeffnen" fuehrte bei allen zur selben Liste. Jede
// Vorlage hat aber eine eigene Drucksache - der Jahresbericht 2025 die 21/7050 -, als weitere Position im selben Vorgang.
// Gingen Berichte an beide Haeuser, gilt die Drucksache des Hauses, das ueberwiesen hat.
export const SAMMELUEBERWEISUNG=/^Überweisung gemäß § (?:80|92)\b/;
export function eigeneDrucksache(positionen:any[],herausgeber:unknown):{nummer:string;pdf:string|null;herausgeber:string}|null{
 const kandidaten=(Array.isArray(positionen)?positionen:[]).filter(p=>p?.fundstelle?.dokumentart==='Drucksache'&&typeof p.fundstelle.dokumentnummer==='string'
  &&!SAMMELUEBERWEISUNG.test(String(p?.vorgangsposition??''))).sort((a,b)=>String(a.datum??'').localeCompare(String(b.datum??'')));
 const p=kandidaten.find(x=>x.fundstelle.herausgeber===herausgeber)??kandidaten[0];
 if(!p)return null;
 const f=p.fundstelle;
 return {nummer:clean(f.dokumentnummer),pdf:typeof f.pdf_url==='string'&&officialURL(f.pdf_url)?f.pdf_url:null,herausgeber:String(f.herausgeber??'')};
}
export async function committeeDocuments(since:string):Promise<DocumentInput[]>{
 const docs:DocumentInput[]=[];const roh:any[]=[];
 await dipPages('vorgangsposition',since,page=>{for(const d of page){const m=mapCommitteePosition(d);if(m){docs.push(m);roh.push(d);}}});
 const jeVorgang=new Map<string,any[]|null>();
 for(let k=0;k<docs.length;k++){
  const d=roh[k],m=docs[k];
  if(!SAMMELUEBERWEISUNG.test(m.step??'')||!d?.vorgang_id)continue;
  const id=String(d.vorgang_id);
  if(!jeVorgang.has(id)){
   try{
    const u=new URL('https://search.dip.bundestag.de/api/v1/vorgangsposition');
    u.searchParams.set('f.vorgang',id);u.searchParams.set('format','json');
    const p=JSON.parse(await fetchOfficial(u.href,{Authorization:`ApiKey ${process.env.DIP_API_KEY}`}));
    jeVorgang.set(id,Array.isArray(p.documents)?p.documents:null);
   }catch{jeVorgang.set(id,null);}
  }
  const positionen=jeVorgang.get(id);
  // Scheitert die Abfrage, bleibt die Position, wie sie ist; der naechste Lauf berichtigt sie ohne Aenderungsmeldung.
  if(!positionen)continue;
  const eigene=eigeneDrucksache(positionen,d?.fundstelle?.herausgeber);
  m.documentNumber=eigene?.nummer??null;
  m.pdfUrl=eigene?.pdf??null;
  m.paperKey=eigene?papierschluessel(eigene.herausgeber,'Drucksache',eigene.nummer):null;
 }
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
 return {externalId:String(d.id),title,url:dipUrl('drucksache',d.id,title),
 text:'',publishedAt:iso(d.datum),updatedAt:iso(d.aktualisiert),documentType:clean(d.drucksachetyp??d.dokumentart??'Drucksache'),
 step:null,procedure:null,documentNumber:d.dokumentnummer?clean(d.dokumentnummer):null,paperKey:papierschluessel(d.herausgeber,d.dokumentart,d.dokumentnummer),
 pdfUrl:typeof f.pdf_url==='string'&&officialURL(f.pdf_url)?f.pdf_url:null,
 committees:[],lead:null,ministries:hit.map(m=>m.id),originator:originators.join(', ')||null,topics};
}
export async function fulltextDocuments(since:string):Promise<DocumentInput[]>{
 const docs:DocumentInput[]=[];
 await dipPages('drucksache-text',since,page=>{for(const d of page){const m=mapFulltextDrucksache(d);if(m)docs.push(m);}},FULLTEXT_LIMIT);
 return docs;
}
const FILTERLIST='https://www.bundestag.de/ajax/filterlist/de/ausschuesse/';
// Der amtliche RSS-Feed ist auf 15 Eintraege ueber alle Ausschuesse gedeckelt. Die Tagesordnungsliste hinter derselben
// Seite liefert dieselben amtlichen PDFs mit Ausschussspalte - aber ebenfalls gedeckelt, auf 10 je Abruf, auch mit limit=50.
// "Ohne diese Grenze" stand hier, bis nachgezaehlt wurde: Seite 2 enthielt 10 weitere, davon 3 ausgewaehlter Ausschuesse.
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
 const zeilen=await blaettern(offset=>{const url=`${FILTERLIST}1061622-1061622?offset=${offset}&limit=${TERMINSEITE}&noFilterSet=true`;return fetchOfficial(url).then(html=>parseAgendaTable(html,url));});
 return zeilen.flatMap(row=>{
 const id=matchCommitteeName(row.committee);
 return id?[{externalId:row.url,title:row.title,url:row.url,text:'',publishedAt:sitzungstag(row.title)??row.date,updatedAt:row.date,topics:scanTopics(row.title),documentType:'Tagesordnung',step:'Sitzungstermin',
 procedure:null,documentNumber:null,pdfUrl:row.url.endsWith('.pdf')?row.url:null,committees:[id],lead:id,ministries:[],originator:COMMITTEES.find(c=>c.id===id)?.name??null}]:[];
 });
}
// Anhoerungen und oeffentliche Sitzungen je ausgewaehltem Ausschuss. Eine leere Liste ist ein Fehler:
// bricht das CMS die Struktur, faellt das auf, statt still nichts zu liefern.
// Termin- und Tagesordnungslisten liefern hoechstens 10 Eintraege je Abruf - auch limit=50 ergibt 10 -, neueste zuerst.
// Am 13.09. belegte der Rechtsausschuss 5 der 10 Plaetze mit kuenftigen Anhoerungen; ab elf Terminen im Zeitraum waeren
// die uebrigen still weggefallen. Weitergeblaettert wird, solange eine volle Seite bis zuletzt Termine der letzten 30 Tage fuehrt.
export const TERMINSEITE=10, TERMINSEITEN_MAX=5;
export async function blaettern<T extends {url:string;date:string|null}>(seite:(offset:number)=>Promise<T[]>,grenze=new Date(Date.now()-30*86400000).toISOString().slice(0,10)):Promise<T[]>{
 const je=new Map<string,T>();
 for(let n=0;n<TERMINSEITEN_MAX;n++){
  const rows=await seite(n*TERMINSEITE);
  for(const r of rows)if(!je.has(r.url))je.set(r.url,r);
  const letzte=rows.at(-1)?.date;
  if(rows.length<TERMINSEITE||!letzte||letzte.slice(0,10)<grenze)break;
 }
 return [...je.values()];
}
export async function eventDocuments(warn?:(note:string)=>void):Promise<DocumentInput[]>{
 const withEvents=COMMITTEES.filter(c=>c.events);
 const docs:DocumentInput[]=[];const failed:string[]=[];
 for(const c of withEvents){
 try{
 const rows=await blaettern(offset=>{const url=`${FILTERLIST}${c.events}?offset=${offset}&limit=${TERMINSEITE}&noFilterSet=true`;return fetchOfficial(url).then(html=>parseCommitteeEvents(html,url));});
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
// Die BAFA-Feeds fuehren kein Datum. Ihre Kurzmeldungen tragen es im Dateinamen, im Format des Amtes:
// .../Ausfuhrkontrolle/20260901_eu-dual-use-vo_evaluation_erinnerung.html. Uebernommen wird nur ein
// vollstaendiges, gueltiges Datum. Ohne Datum stuenden Meldungen aus dem Oktober 2025 zehn Tage lang
// als aktuell im Lagebild; Newsletter wie EKA_2026_07 bleiben ehrlich ohne.
export function datumAusAdresse(url:string):string|null{
 const m=/\/(20\d{2})(\d{2})(\d{2})_[^/]*$/.exec(url??'');
 if(!m)return null;
 const [j,mo,t]=[Number(m[1]),Number(m[2]),Number(m[3])];
 const d=new Date(Date.UTC(j,mo-1,t));
 return d.getUTCFullYear()===j&&d.getUTCMonth()===mo-1&&d.getUTCDate()===t?d.toISOString():null;
}
// Der allgemeine BAFA-Feed brachte E-Auto-Foerderung und Energietag in eine Quelle namens
// "Exportkontrolle und Aussenwirtschaft". Auch der Rubrikfeed enthaelt Fremdes ("Foerderkompass" unter
// /Bundesamt/). Uebernommen wird deshalb nur, was unter dem Pfad der Quelle liegt.
export function rssNachbereiten(docs:DocumentInput[],source:Pick<Source,'pfad'>):DocumentInput[]{
 return docs
  .filter(d=>{if(!source.pfad)return true;try{return new URL(d.url).pathname.includes(source.pfad);}catch{return false;}})
  .map(d=>{if(d.publishedAt||d.updatedAt)return d;const datum=datumAusAdresse(d.url);return datum?{...d,publishedAt:datum,updatedAt:datum}:d;});
}
export async function ingest(source:Source,since:string,warn?:(note:string)=>void):Promise<DocumentInput[]>{
 if(source.kind==='committee-dip')return committeeDocuments(since);
 if(source.kind==='fulltext-dip')return fulltextDocuments(since);
 if(source.kind==='committee-agenda')return agendaDocuments();
 if(source.kind==='committee-events')return eventDocuments(warn);
 if(source.kind==='ministry-drafts')return ministryDrafts();
 if(source.kind==='rss'&&source.feed)return rssNachbereiten(parseFeed(await fetchOfficial(source.feed),source.feed),source);
 throw new Error('Manuelle Ergänzung erforderlich');
}

// Gesetze und Verordnungen des BMF ueber die Sitemap: sie ist in der robots.txt ausdruecklich fuer Maschinen
// ausgewiesen und liefert Adresse und Aenderungsdatum.
//
// Den richtigen Titel traegt nur die Inhaltsseite, und die ist aus dem Zeitplan heraus nicht
// erreichbar: sie leitet auf validate.perfdrive.com um, den Bot-Schutz von Radware. Im Browser faellt
// das nicht auf, weil der die Pruefung besteht - ein Abruf mit curl oder aus dem Lauf wird
// abgefangen. Ein Umgehen waere ein Umgehen; deshalb bleibt es beim amtlichen Kuerzel aus der
// Adresse. Diese Pruefung wurde einmal in die falsche Richtung gemacht (getestet worden war die
// Domain des BMWE) - die Umleitung oben ist der Beleg fuer das BMF selbst.
export const BMF_SITEMAP='https://www.bundesfinanzministerium.de/sitemap.xml';
export function bmfLabel(slug:string):string{
 return slug.replace(/^\d{4}-\d{2}-\d{2}-/,'').replace(/^G-/,'').replace(/-/g,' ')
  .replace(/Aenderung/g,'Änderung').replace(/Ueber/g,'Über').replace(/ae/g,'ä').replace(/\s+/g,' ').trim();
}
// Die Sitemap nennt Adresse und Aenderungsdatum; der letzte Pfadteil nennt die Art der Seite - 38 Vorhaben "0-Gesetz.html",
// 10 "0-Verordnung.html". Vorher hiess jedes "Gesetzesvorhaben", galt als "Referentenentwurf" und stand im Schritt
// "Vorbereitung im Ressort": drei Angaben, die die Quelle nicht macht. Die Verordnung ApO hiess so "Gesetzesvorhaben ApO".
export function bmfAngaben(loc:string):{title:string;documentType:string}|null{
 const m=/\/\d{4}-\d{2}-\d{2}-([^/]+)\/([^/]*)$/.exec(loc);
 if(!m)return null;
 const bezeichnung=bmfLabel(m[1]);
 if(!bezeichnung)return null;
 const art=/^0-Verordnung\.html$/.test(m[2])?'Verordnung':/^0-Gesetz\.html$/.test(m[2])?'Gesetz':'Gesetze und Gesetzesvorhaben';
 // Das Typwort nur, wo das Kuerzel es nicht schon traegt: "Fondrisikobegrenzungsgesetz", "2 VO Änderung KassenSichV".
 const traegtArt=/gesetz|verordnung|(^|\s)VO(\s|$)/i.test(bezeichnung)||art==='Gesetze und Gesetzesvorhaben';
 return {title:traegtArt?bezeichnung:`${art} ${bezeichnung}`,documentType:art};
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
  const angaben=bmfAngaben(loc);
  if(!bezeichnung||!angaben)continue;
  out.push({externalId:loc,title:angaben.title,url:loc,text:'',
   publishedAt:iso(datum),updatedAt:iso(lastmod)??iso(datum),topics:scanTopics(bezeichnung),
   documentType:angaben.documentType,step:null,procedure:null,documentNumber:null,pdfUrl:null,
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
