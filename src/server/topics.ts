// Themenraster für TRUMPF SE + Co. KG, Ditzingen: Familienunternehmen seit 1923, rund 18.000
// Beschäftigte, Werkzeugmaschinen und Lasertechnik, Leistungselektronik (Hüttinger), additive
// Fertigung, Elektrowerkzeuge. Weltweit einziger Lieferant der Laserverstärker für die
// EUV-Lithografie und damit an der Halbleiterfertigung beteiligt. Kundenbranchen: Automobil,
// Blechbearbeitung, Halbleiter, Elektronik, Luft- und Raumfahrt, Medizintechnik, Photovoltaik.
//
// Ein Treffer ist eine Fundstelle, keine Bewertung: die App zeigt den gefundenen Begriff und
// seinen Satzzusammenhang und überlässt die Einschätzung der Leserin.
export interface Topic {id:string; label:string; why:string; terms:string[]; strict?:string[]; context?:{terms:string[]; with:string[]};}
// context: Begriffe, die fuer sich genommen zu breit sind. Sie zaehlen nur, wenn im selben Dokument
// auch ein Begriff aus "with" vorkommt. "Kuenstliche Intelligenz" trifft sonst KI-generierte Musik,
// "Buerokratieabbau" das Vereinssteuerrecht. Beide Fundstellen werden als Beleg angezeigt.
export const TOPICS:Topic[] = [
 {id:'dualuse',label:'Export & Dual-Use',why:'Ausfuhrrecht und Güterlisten entscheiden, was TRUMPF wohin liefern darf.',
  terms:['dual-use','dual use','ausfuhrkontrolle','exportkontrolle','ausfuhrgenehmigung','außenwirtschaftsgesetz','außenwirtschaftsverordnung','güterliste','rüstungsexport','embargo','sanktionsregime','investitionsprüfung','technologietransfer','wassenaar'],
  strict:['AWG','AWV','BAFA']},
 {id:'halbleiter',label:'Halbleiter & EUV',why:'TRUMPF liefert die Laserverstärker für die EUV-Lithografie.',
  terms:['halbleiter','mikroelektronik','chipfertigung','chipindustrie','chips act','mikrochip','lithografie','lithographie','semiconductor','waferfertigung','leistungshalbleiter'],
  strict:['EUV']},
 {id:'laser',label:'Lasertechnik & Photonik',why:'Kerngeschäft: Strahlquellen, Laserschneiden, Laserschweißen.',
  // "laser" taucht in 200 Drucksachen genau einmal auf - der Begriff ist eindeutig genug, um alle
  // Zusammensetzungen von Laserschutz bis Laserstrahlquelle zu fassen, ohne Rauschen zu erzeugen.
  terms:['laser','photonik','optische technologien','ultrakurzpuls','strahlquelle']},
 {id:'maschinen',label:'Werkzeugmaschinen & Fertigung',why:'Zweites Kerngeschäft: Blechbearbeitung, Stanzen, Biegen, Automatisierung.',
  terms:['werkzeugmaschine','maschinenbau','maschinensicherheit','blechbearbeitung','fertigungstechnik','maschinenverordnung','maschinenrichtlinie','produktsicherheit','additive fertigung','3d-druck','industrie 4.0','smart factory','ce-kennzeichnung','betriebssicherheitsverordnung']},
 {id:'ki',label:'Industrielle KI',why:'KI in Fertigung und Maschinensteuerung: KI-Verordnung, Hochrisiko-Einstufung von Maschinen, Fertigungssoftware.',
  terms:['ki-verordnung','ki-gesetz','hochrisiko-ki','ai act','industrielle ki','ki in der produktion','ki-gestützte fertigung','predictive maintenance'],
  context:{terms:['künstliche intelligenz','maschinelles lernen','artificial intelligence','ki-system','ki-modell','ki-anwendung','algorithmische entscheidung'],
   with:['produktion','fertigung','industrie','maschine','werkzeugmaschine','automatisierung','anlagenbau','qualitätssicherung','smart factory','industrie 4.0','produktionsprozess','betriebliche']}},
 {id:'hightech',label:'Hochtechnologie & Förderung',why:'Forschungsförderung und Schlüsseltechnologien betreffen TRUMPFs Entwicklungsbudget.',
  terms:['hochtechnologie','spitzentechnologie','schlüsseltechnologie','forschungsförderung','forschungszulage','technologieförderung','hightech agenda','deep tech','technologiesouveränität','technologische souveränität','transferförderung','photonik-forschung']},
 {id:'standort',label:'Wirtschaftsstandort Deutschland',why:'Energiepreise, Bürokratie und Fachkräfte bestimmen die Kosten am Standort Ditzingen.',
  terms:['wirtschaftsstandort','industriestrompreis','industriestrom','netzentgelt','strompreiskompensation','wettbewerbsfähigkeit der industrie','industriepolitik','standortbedingungen','deindustrialisierung','fachkräfteeinwanderung'],
  context:{terms:['energiepreis','bürokratieabbau','bürokratieentlastung','fachkräftemangel'],
   with:['industrie','produktion','fertigung','mittelstand','unternehmen','maschinenbau','wirtschaft']}},
 {id:'lieferkette',label:'Lieferketten & Rohstoffe',why:'Seltene Erden und Vorprodukte hängen an Handels- und Lieferkettenrecht.',
  terms:['lieferkette','seltene erden','kritische rohstoffe','rohstoffversorgung','versorgungssicherheit','lieferkettensorgfaltspflichten','critical raw materials','handelsabkommen','zollsatz','einfuhrzoll','reach-verordnung','stoffbeschränkung','chemikalienrecht'],
  strict:['PFAS','REACH']},
 {id:'familie',label:'Familienunternehmen & Mittelstand',why:'TRUMPF ist ein Familienunternehmen; Erbschaft- und Unternehmensteuer wirken unmittelbar.',
  terms:['familienunternehmen','unternehmensnachfolge','erbschaftsteuer','betriebsvermögen','mittelständische unternehmen','thesaurierung','substanzbesteuerung']}
];
export interface TopicMatch {topic:string; terms:string[]; count:number; inTitle:boolean; snippet:string;}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Wortgrenzen aus \b greifen bei Umlauten nicht zuverlaessig, deshalb eigene Grenzen aus
// Nicht-Wortzeichen. Abkuerzungen wie AWG oder EUV werden nur gross geschrieben gesucht,
// sonst treffen sie Silben in beliebigen Woertern.
const BOUND_L='(^|[^\\p{L}\\p{N}])', BOUND_R='($|[^\\p{L}\\p{N}])';
// Deutsche Beugung steckt bei Mehrwortbegriffen mitten drin ("seltene Erden" -> "seltenen Erden"),
// deshalb bekommt jedes Wort eine kurze Endung und nur das letzte eine lange. Zwischen den Woertern
// steht \s+, damit auch der Zeilenumbruch aus einem PDF-Volltext nicht trennt.
const loose=(t:string)=>{
 const parts=t.split(/\s+/).map(escape);
 const body=parts.map((w,i)=>w+(i===parts.length-1?'\\p{L}{0,20}':'\\p{L}{0,3}')).join('\\s+');
 return new RegExp(BOUND_L+body+BOUND_R,'giu');
};
const strict=(t:string)=>new RegExp(BOUND_L+escape(t)+BOUND_R,'gu');
interface Compiled {topic:string; term:string; re:RegExp; needsContext?:boolean;}
const COMPILED:Compiled[]=TOPICS.flatMap(t=>[
 ...t.terms.map(term=>({topic:t.id,term,re:loose(term)})),
 ...(t.strict??[]).map(term=>({topic:t.id,term,re:strict(term)})),
 ...(t.context?.terms??[]).map(term=>({topic:t.id,term,re:loose(term),needsContext:true}))
]);
const CONTEXT=new Map(TOPICS.filter(t=>t.context).map(t=>[t.id,t.context!.with.map(loose)]));
export const topicById=(id:string)=>TOPICS.find(t=>t.id===id);
function snippetAt(text:string,at:number,len:number):string{
 const from=Math.max(0,at-75), to=Math.min(text.length,at+len+75);
 return (from>0?'… ':'')+text.slice(from,to).replace(/\s+/g,' ').trim()+(to<text.length?' …':'');
}
// Zaehlt je Thema die Fundstellen und merkt sich, ob der Begriff schon im Titel steht. Beides sind
// Tatsachen, keine Bewertung: ein einmal gestreiftes Stichwort bleibt unterscheidbar von einem
// Dokument, das sich ueber Seiten mit dem Thema befasst.
export function scanTopics(title:string,body=''):TopicMatch[]{
 const full=`${title}\n${body}`;
 if(!full.trim())return [];
 const byTopic=new Map<string,{terms:Set<string>;count:number;inTitle:boolean;snippet:string;ausText:boolean}>();
 const kontextOk=new Map<string,boolean>();
 const hatKontext=(topic:string)=>{
  if(!CONTEXT.has(topic))return true;
  if(!kontextOk.has(topic))kontextOk.set(topic,CONTEXT.get(topic)!.some(re=>{re.lastIndex=0;return re.test(full);}));
  return kontextOk.get(topic)!;
 };
 for(const c of COMPILED){
  if(c.needsContext&&!hatKontext(c.topic))continue;
  c.re.lastIndex=0;
  let m:RegExpExecArray|null, first=-1, firstLen=0, imText=-1, imTextLen=0, n=0;
  while((m=c.re.exec(full))){
   n++;
   const at=m.index+m[1].length, len=m[0].length-m[1].length-(m[2]?m[2].length:0);
   if(first<0){first=at;firstLen=len;}
   // Der Titel steht in der App ohnehin darueber. Als Beleg taugt die erste Fundstelle im Fliesstext
   // mehr, weil sie den Zusammenhang zeigt statt die Ueberschrift zu wiederholen.
   if(imText<0&&at>=title.length){imText=at;imTextLen=len;}
   if(m.index===c.re.lastIndex)c.re.lastIndex++;
  }
  if(!n)continue;
  const eintrag=byTopic.get(c.topic)??{terms:new Set<string>(),count:0,inTitle:false,snippet:'',ausText:false};
  eintrag.terms.add(c.term); eintrag.count+=n;
  if(first<title.length)eintrag.inTitle=true;
  if(imText>=0&&!eintrag.ausText){eintrag.snippet=snippetAt(full,imText,imTextLen);eintrag.ausText=true;}
  else if(!eintrag.snippet)eintrag.snippet=snippetAt(full,first,firstLen);
  byTopic.set(c.topic,eintrag);
 }
 return [...byTopic].map(([topic,v])=>({topic,terms:[...v.terms],count:v.count,inTitle:v.inTitle,snippet:v.snippet}))
  .sort((a,b)=>Number(b.inTitle)-Number(a.inTitle)||b.count-a.count);
}
// Reihenfolge der Thementreffer: zuerst was im Titel steht, dann was mehrere Themen beruehrt,
// dann was haeufiger vorkommt. Alles drei sind abzaehlbare Eigenschaften des Textes.
export function topicRank(matches:TopicMatch[]):number{
 if(!matches.length)return 0;
 const titel=matches.filter(m=>m.inTitle).length;
 const fund=matches.reduce((n,m)=>n+m.count,0);
 return titel*1000+matches.length*100+Math.min(fund,99);
}
