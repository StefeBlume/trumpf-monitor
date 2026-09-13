import {COMMITTEES,MINISTRIES,type Item} from '../model';
import {topicById} from '../server/topics';
import type {LobbyProject} from '../server/lobby';
// Nach welchem Datum geordnet und aufbewahrt wird: der Zeitpunkt der letzten Bewegung laut Quelle.
// Das eigene changedAt taugt dafuer nicht - beim Lauf bekommen alle Treffer denselben Zeitstempel,
// die Reihenfolge waere praktisch zufaellig. Ohne Quellendatum zaehlt der Erstkontakt, nicht "jetzt",
// sonst stehen datumslose Meldungen dauerhaft oben.
export const recency=(i:Pick<Item,'updatedAt'|'publishedAt'|'firstSeen'>)=>i.updatedAt??i.publishedAt??i.firstSeen;
// Beide Kartenarten zeigten die Daten frueher in verschiedener Reihenfolge und mit verschiedenen
// Woertern: die Trefferkarte "10. Sept. · Dokument vom 17. Okt. 2025", die Dokumentkarte
// "17. Okt. 2025 · bewegt 10. Sept.". Dasselbe Papier sah dadurch je nach Ansicht anders aus.
// Fuehrend ist deshalb ueberall das Datum, nach dem auch sortiert und aufbewahrt wird; das eigene
// Datum des Papiers folgt nur, wenn es davon abweicht.
export function datumsteil(i:Pick<Item,'updatedAt'|'publishedAt'|'firstSeen'>,format:(s:string|null)=>string){
 const gefuehrt=format(recency(i));
 const eigenes=i.publishedAt&&berlinTag(recency(i))!==berlinTag(i.publishedAt)?format(i.publishedAt):null;
 return {gefuehrt,eigenes};
}

// Gremien fuer die Suche: Kurzname und amtlicher Name. Mit den Kurznamen allein ("Auswaertiges", "Haushalt") fand
// "Auswaertiger Ausschuss" live keines seiner 9 Dokumente und "Haushaltsausschuss" eines von 5.
export function gremienNamen(i:Pick<Item,'committees'|'ministries'>):string[]{
 return [...i.committees.flatMap(id=>{const c=COMMITTEES.find(x=>x.id===id);return c?[c.short,c.name]:[];}),
  ...i.ministries.flatMap(id=>{const m=MINISTRIES.find(x=>x.id===id);return m?[m.short,m.name]:[];})];
}

// Der Suchtext eines Dokuments. Frueher wurden die Felder roh verkettet: ein fehlendes
// documentNumber landete als Zeichenkette "null" darin, und die Suche nach "null" lieferte genau die
// Dokumente ohne Nummer. Die Themen fehlten ganz - "Halbleiter" fand einen Treffer, obwohl die
// Themenleiste zehn zaehlte. Gesucht wird jetzt auch in Thema, Fundstelle und Urheber.
export function suchtext(i:Item,gremien:string[]):string{
 const themen=(i.topics??[]).flatMap(m=>[topicById(m.topic)?.label,...m.terms,m.snippet]);
 return [i.title,i.documentNumber,i.documentType,i.step,i.procedure,i.originator,...gremien,...themen]
  .filter((x):x is string=>typeof x==='string'&&x.length>0).join(' ').toLowerCase();
}

// Unter einem Themenfilter steht das gewaehlte Thema vorn. Die Themenkarte belegt ihren Fund mit dem Zitat des
// ersten Themas; ohne diese Ordnung zeigten live 69 von 143 gefilterten Karten einen Satz zu einem anderen Thema,
// unter "Export & Dual-Use" zehnmal einen zum Wirtschaftsstandort. Sonst bleibt die Reihenfolge, wie sie ist.
export function themenReihenfolge<T extends {topic:string}>(ms:T[],thema?:string|null):T[]{
 return thema?[...ms].sort((a,b)=>Number(b.topic===thema)-Number(a.topic===thema)):ms;
}

// Bei Terminen ist publishedAt der Sitzungstag, nicht der Tag einer Veroeffentlichung.
export const istTermin=(i:Pick<Item,'documentType'>)=>i.documentType==='Ausschusstermin'||i.documentType==='Tagesordnung';
// Ein Termin von heute kommt noch - wie unter "Als Naechstes" und auf der Gremienkarte.
export const kommenderTermin=(i:Pick<Item,'documentType'|'publishedAt'>,heute:string)=>istTermin(i)&&!!i.publishedAt&&berlinTag(i.publishedAt)>=heute;
// Reihenfolge der Dokumentlisten: nach letzter Bewegung, neueste zuerst. Angekuendigte Termine stehen davor, der naechste
// oben. Vorher standen sie als "neueste" umgekehrt ueber allem: beim Rechtsausschuss fuenf Anhoerungen vom 14. Oktober
// abwaerts, der naechste Termin am 23. September erst an fuenfter Stelle - unter der Ueberschrift "Bewegungen der letzten 10 Tage".
export function listenOrdnung(heute:string){
 return (a:Pick<Item,'documentType'|'publishedAt'|'updatedAt'|'firstSeen'>,b:Pick<Item,'documentType'|'publishedAt'|'updatedAt'|'firstSeen'>)=>{
  const ka=kommenderTermin(a,heute),kb=kommenderTermin(b,heute);
  if(ka!==kb)return ka?-1:1;
  return ka?a.publishedAt!.localeCompare(b.publishedAt!):recency(b).localeCompare(recency(a));
 };
}
// Welches Datum eine Gremienkarte nennt. Ausschuesse kuendigen Anhoerungen Wochen im Voraus an. Erst stand davor
// "zuletzt", dann zwar "naechster Termin", aber mit dem spaetesten Datum: Beim Rechtsausschuss mit fuenf
// angekuendigten Terminen hiess es "naechster Termin 14. Okt. 2026", der naechste war der 23. September.
// Kommt etwas, nennt die Karte das frueheste davon, sonst die juengste Bewegung. Ein Termin von heute kommt noch,
// wie unter "Als Naechstes"; eine Aenderung von heute ist geschehen. Verglichen wird der Berliner Kalendertag.
export function kartenDatum(items:Pick<Item,'updatedAt'|'publishedAt'|'firstSeen'|'documentType'>[],heute:string):{wort:'zuletzt'|'nächster Termin';stamp:string}|null{
 if(!items.length)return null;
 const kommend=items.map(i=>istTermin(i)&&i.publishedAt
   ?(berlinTag(i.publishedAt)>=heute?i.publishedAt:null)
   :(berlinTag(recency(i))>heute?recency(i):null)).filter((s):s is string=>!!s).sort();
 return kommend.length?{wort:'nächster Termin',stamp:kommend[0]}:{wort:'zuletzt',stamp:items.map(recency).sort().at(-1)!};
}

// Viele Quellen fuehren nur einen Tag: Terminlisten, Tagesordnungen, die Dateinamen des BAFA. Gespeichert
// als Mitternacht UTC, zeigte die Dokumentansicht "23.09.2026, 02:00" - eine Uhrzeit, die keine Quelle
// genannt hat, und westlich von Greenwich den Vortag. Reine Tage werden deshalb ohne Uhrzeit und in UTC
// gelesen; echte Zeitpunkte, etwa die Aenderungszeit im DIP, in Berliner Zeit.
export const nurTag=(s:string)=>/T00:00:00(?:\.000)?Z$/.test(s);
// Der Kalendertag, den die Anzeige nennt. Verglichen wurde vorher der UTC-Tag: Eine DIP-Aenderung um 00:30 Uhr
// am 5. September steht in UTC noch am 4. Die Karte zeigte dann "05. Sept. 2026 · Dokument vom 05. Sept. 2026",
// und der Filter "Letzte Bewegung ab 5.9." liess sie weg, obwohl sie den 5. trug.
export function berlinTag(s:string):string{
 return nurTag(s)||isNaN(Date.parse(s))?s.slice(0,10):new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date(s));
}
export function datum(s:string|null|undefined,mitZeit=false):string{
 if(!s)return 'Kein Datum in der Quelle';
 const tag=nurTag(s);
 const f:Intl.DateTimeFormatOptions=mitZeit&&!tag
  ?{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}
  :mitZeit?{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}
  :{day:'2-digit',month:'short',year:'numeric',timeZone:tag?'UTC':'Europe/Berlin'};
 return new Intl.DateTimeFormat('de-DE',f).format(new Date(s));
}

// Wie eine Quellenkarte ihren Stand benennt. Ein Abruf mit Warnung ("2 von 10 Terminlisten nicht erreichbar")
// speichert "partial"; die Karte kannte den Wert nicht und schrieb "Offen" - das die Quellenseite als "wird noch
// nicht automatisch ueberwacht" erklaert. Nach einem Fehler tragen Zeitpunkt und Anzahl den letzten erfolgreichen
// Abruf; die Karte nannte sie trotzdem "beim letzten Abruf".
export function quellenStand(s:{status?:string}):{label:string;klasse:'success'|'warning'|'failure'|'neutral';vorsatz:string;abruf:string}{
 const label=s.status==='ok'?'Abruf erfolgreich':s.status==='partial'?'Teilweise abgerufen':s.status==='error'?'Abruf fehlgeschlagen'
  :s.status==='pending'?'Bereit für Erstabruf':s.status==='setup'?'Schlüssel fehlt':'Offen';
 const klasse=s.status==='ok'?'success':s.status==='partial'?'warning':s.status==='error'?'failure':'neutral';
 const fehler=s.status==='error';
 return {label,klasse,vorsatz:fehler?'Zuletzt erfolgreich: ':'',abruf:fehler?'beim letzten erfolgreichen Abruf':'beim letzten Abruf'};
}

// Liegt hier und nicht in src/server/lobby.ts: die Oberflaeche importierte die Funktion von dort und zog damit
// Connectors, den HTML-Parser cheerio und einen Krypto-Ersatz in den Browser - 655 KB von 1,0 MB JavaScript.
export const withTopics=(ps:LobbyProject[])=>ps.filter(p=>p.topics.length);

// "Neu" und "Geändert" galten nur bis zum nächsten Lauf. Bei Abrufen alle 30 Minuten trug danach jede Karte
// "Unverändert" - live alle 129 Dokumente, auch eines, das erst 11 Stunden zuvor hereingekommen war -, und der
// Statusfilter "Neu" blieb leer. Ein Dokument ausserhalb des Rückblickfensters behielt "Neu" dagegen dauerhaft.
// Angezeigt wird deshalb die letzte echte Änderung, 24 Stunden lang.
export const STATUS_STUNDEN=24;
export function anzeigeStatus(i:Pick<Item,'change'|'changedAt'>,jetzt=Date.now()):Item['change']{
 return i.change!=='unchanged'&&jetzt-Date.parse(i.changedAt)<STATUS_STUNDEN*3600000?i.change:'unchanged';
}
