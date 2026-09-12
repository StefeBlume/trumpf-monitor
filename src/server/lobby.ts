import {TOPICS} from './topics';
import {fetchOfficial} from './connectors';
import {clean} from './parsing';
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
export interface LobbyEntry {
 registerNumber:string; name:string; kind:string; url:string;
 topics:string[]; fields:string[];
 projects:number; statements:number;
 staffFte:number|null; spendFrom:number|null; spendTo:number|null; fiscalYear:string|null;
 updatedAt:string|null; own:boolean;
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
