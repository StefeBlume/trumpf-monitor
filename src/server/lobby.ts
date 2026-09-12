import {TOPICS} from './topics';
import {fetchOfficial} from './connectors';
import {clean} from './parsing';
import {scanTopics} from './topics';
import {officialURL} from './parsing';
// Das Lobbyregister des Bundestags fuehrt, wer sich beruflich fuer welche Interessen einsetzt.
// Je Thema eine eigene Abfrage; die Begriffe sind enger als im Volltextraster, weil das Register
// mit Interessenfeldern arbeitet und breite Begriffe wie "Industriepolitik" tausende Eintraege
// tragen. Angezeigt wird spaeter nur, wer mehrere Themen beruehrt - eine Abzaehlung, keine Wertung.
export const LOBBY_QUERIES:Record<string,string>={
 dualuse:'Exportkontrolle OR "Dual-Use" OR Ausfuhrgenehmigung OR Rüstungsexportkontrolle',
 halbleiter:'Halbleiter OR Mikroelektronik OR Chipindustrie',
 laser:'Lasertechnik OR Photonik OR "Optische Technologien"',
 maschinen:'Werkzeugmaschinen OR Maschinenbau OR "Additive Fertigung"',
 ki:'"Künstliche Intelligenz" AND (Industrie OR Produktion OR Fertigung)',
 hightech:'Hochtechnologie OR Schlüsseltechnologie OR Forschungsförderung',
 standort:'Industriestrompreis OR Strompreiskompensation OR "Wettbewerbsfähigkeit der Industrie"',
 lieferkette:'"Seltene Erden" OR "Kritische Rohstoffe" OR Rohstoffversorgung',
 familie:'Familienunternehmen OR Unternehmensnachfolge OR Erbschaftsteuer'
};
// Der eigene Eintrag von TRUMPF wird immer mitgefuehrt, auch wenn er nur ein Thema traefe.
export const OWN_REGISTER_NUMBER='R000697';
// Ein Vorhaben, an dem ein Interessenvertreter laut eigener Angabe arbeitet. Die Drucksache verweist
// auf das Papier im Bundestag und macht den Bezug zur Dokumentliste der App herstellbar.
export interface LobbyProject {
 number:string; title:string; description:string; topics:string[];
 printingNumber:string|null; documentUrl:string|null; projectUrl:string|null;
}
export interface LobbyEntry {
 registerNumber:string; name:string; kind:string; url:string;
 topics:string[]; fields:string[];
 projects:number; statements:number;
 staffFte:number|null; spendFrom:number|null; spendTo:number|null; fiscalYear:string|null;
 updatedAt:string|null; own:boolean;
 // Erst nach dem Detailabruf gefuellt. detailFor haelt fest, fuer welchen Registerstand das geschah.
 projectList?:LobbyProject[]; detailFor?:string|null;
}
export function mapProject(p:any):LobbyProject|null{
 const nummer=typeof p?.regulatoryProjectNumber==='string'?p.regulatoryProjectNumber:null;
 const titel=clean(p?.title);
 if(!nummer||!titel)return null;
 const beschreibung=clean(p?.description);
 const pm=(Array.isArray(p?.printedMatters)?p.printedMatters:[])[0]??{};
 const doc=typeof pm.documentUrl==='string'&&officialURL(pm.documentUrl)?pm.documentUrl:null;
 const vorgang=typeof pm.projectUrl==='string'&&officialURL(pm.projectUrl)?pm.projectUrl:null;
 return {number:nummer,title:titel,description:beschreibung===titel?'':beschreibung,
  topics:scanTopics(titel,beschreibung).map(m=>m.topic),
  printingNumber:pm.printingNumber?clean(pm.printingNumber):null,documentUrl:doc,projectUrl:vorgang};
}
const num=(x:unknown):number|null=>typeof x==='number'&&Number.isFinite(x)?x:null;
export function mapLobbyResult(r:any,topic:string):LobbyEntry|null{
 const nr=typeof r?.registerNumber==='string'?r.registerNumber:null;
 const name=clean(r?.lobbyistIdentity?.name);
 const url=r?.registerEntryDetails?.detailsPageUrl;
 if(!nr||!name||typeof url!=='string')return null;
 const ai=r.activitiesAndInterests??{}, fin=r.financialExpenses??{}, emp=r.employeesInvolvedInLobbying??{};
 const euro=fin.financialExpensesEuro??{};
 return {registerNumber:nr,name,kind:clean(ai.activity?.de)||'Nicht angegeben',url,
 topics:[topic],
 fields:(Array.isArray(ai.fieldsOfInterest)?ai.fieldsOfInterest:[]).map((f:any)=>clean(f?.de)).filter(Boolean).slice(0,10),
 projects:num(r.regulatoryProjects?.regulatoryProjectsCount)??0,
 statements:num(r.statements?.statementsCount)??0,
 staffFte:num(emp.employeeFTE),
 spendFrom:num(euro.from),spendTo:num(euro.to),
 fiscalYear:typeof emp.relatedFiscalYearEnd==='string'?emp.relatedFiscalYearEnd.slice(0,4):null,
 updatedAt:typeof r.registerEntryDetails?.validFromDate==='string'?r.registerEntryDetails.validFromDate:null,
 own:nr===OWN_REGISTER_NUMBER};
}
// Zusammenfuehren: derselbe Eintrag kann bei mehreren Themen auftauchen.
export function mergeEntries(found:LobbyEntry[]):LobbyEntry[]{
 const byNr=new Map<string,LobbyEntry>();
 for(const e of found){
  const vorhanden=byNr.get(e.registerNumber);
  if(vorhanden){for(const t of e.topics)if(!vorhanden.topics.includes(t))vorhanden.topics.push(t);}
  else byNr.set(e.registerNumber,{...e,topics:[...e.topics]});
 }
 return [...byNr.values()];
}
// Wer nur ein Thema streift, ist fuer eine Uebersicht zu beliebig. Der eigene Eintrag bleibt immer.
export const MIN_TOPICS=2;
export function relevantEntries(entries:LobbyEntry[],minTopics=MIN_TOPICS):LobbyEntry[]{
 return entries.filter(e=>e.own||e.topics.length>=minTopics)
  .sort((a,b)=>Number(b.own)-Number(a.own)||b.topics.length-a.topics.length||b.projects-a.projects||a.name.localeCompare(b.name,'de'));
}
export async function lobbyEntries():Promise<LobbyEntry[]>{
 const found:LobbyEntry[]=[]; const failed:string[]=[];
 for(const t of TOPICS){
  const q=LOBBY_QUERIES[t.id]; if(!q)continue;
  try{
   const url=`https://www.lobbyregister.bundestag.de/sucheJson?q=${encodeURIComponent(q)}`;
   const d=JSON.parse(await fetchOfficial(url,{},16*1024*1024));
   if(!Array.isArray(d.results))throw new Error('Unerwartetes Format');
   for(const r of d.results){const m=mapLobbyResult(r,t.id);if(m)found.push(m);}
  }catch(e){failed.push(`${t.label}: ${e instanceof Error?e.message:'Abruf fehlgeschlagen'}`);}
 }
 if(failed.length>TOPICS.length/2)throw new Error(`Lobbyregister überwiegend nicht erreichbar (${failed.slice(0,2).join('; ')})`);
 return relevantEntries(mergeEntries(found));
}

// Einzelabruf der Vorhaben. Das Register liefert sie nur in der Detailsuche, und die ist gross:
// eine themenweite Abfrage sind 26 bis 43 MB. Deshalb je Eintrag einzeln und nur, wenn sich der
// Registerstand seit dem letzten Abruf geaendert hat.
export async function fetchProjects(registerNumber:string):Promise<LobbyProject[]>{
 const url=`https://www.lobbyregister.bundestag.de/sucheDetailJson?q=${encodeURIComponent(registerNumber)}`;
 const d=JSON.parse(await fetchOfficial(url,{},24*1024*1024));
 const treffer=(Array.isArray(d.results)?d.results:[]).find((r:any)=>r?.registerNumber===registerNumber);
 const roh=(treffer?.regulatoryProjects?.regulatoryProjects)??[];
 return (Array.isArray(roh)?roh:[]).map(mapProject).filter((p:LobbyProject|null):p is LobbyProject=>!!p);
}
// Nur Vorhaben mit Themenbezug sind fuer die Uebersicht interessant; alles andere blaeht sie auf.
export const withTopics=(ps:LobbyProject[])=>ps.filter(p=>p.topics.length);
export const MAX_DETAIL_FETCHES=25;
// Ergaenzt die Vorhaben. Bereits bekannte Eintraege werden uebernommen, geaenderte neu geholt,
// und je Lauf hoechstens MAX_DETAIL_FETCHES, damit ein Lauf nicht aus dem Zeitrahmen faellt.
export async function enrichProjects(entries:LobbyEntry[],bekannt:Map<string,LobbyEntry>,
 holen:(nr:string)=>Promise<LobbyProject[]>=fetchProjects,grenze=MAX_DETAIL_FETCHES):Promise<LobbyEntry[]>{
 let geholt=0;
 const out:LobbyEntry[]=[];
 for(const e of entries){
  const alt=bekannt.get(e.registerNumber);
  const aktuell=alt&&alt.detailFor===e.updatedAt&&Array.isArray(alt.projectList);
  if(aktuell){out.push({...e,projectList:alt!.projectList,detailFor:alt!.detailFor});continue;}
  if(e.projects===0){out.push({...e,projectList:[],detailFor:e.updatedAt});continue;}
  if(geholt>=grenze){out.push({...e,projectList:alt?.projectList??[],detailFor:alt?.detailFor??null});continue;}
  try{const ps=await holen(e.registerNumber);geholt++;out.push({...e,projectList:ps,detailFor:e.updatedAt});}
  catch{out.push({...e,projectList:alt?.projectList??[],detailFor:alt?.detailFor??null});}
 }
 return out;
}
