import type {Item} from '../model';
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
 const eigenes=i.publishedAt&&recency(i).slice(0,10)!==i.publishedAt.slice(0,10)?format(i.publishedAt):null;
 return {gefuehrt,eigenes};
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

// Ausschuesse kuendigen Anhoerungen im Voraus an. Auf der Karte des Rechtsausschusses stand deshalb
// "zuletzt 14. Okt. 2026", waehrend heute der 12. September war - das liest sich wie ein Datumsfehler,
// obwohl der Termin stimmt. Verglichen wird nach Berliner Kalendertag, nicht nach Uhrzeit: eine
// Anhoerung, die heute um zehn Uhr beginnt, ist bis zum Abend noch der naechste Termin.
export const bewegungswort=(stamp:string|null|undefined,heute:string):'zuletzt'|'nächster Termin'=>
 (stamp??'').slice(0,10)>heute?'nächster Termin':'zuletzt';

// Viele Quellen fuehren nur einen Tag: Terminlisten, Tagesordnungen, die Dateinamen des BAFA. Gespeichert
// als Mitternacht UTC, zeigte die Dokumentansicht "23.09.2026, 02:00" - eine Uhrzeit, die keine Quelle
// genannt hat, und westlich von Greenwich den Vortag. Reine Tage werden deshalb ohne Uhrzeit und in UTC
// gelesen; echte Zeitpunkte, etwa die Aenderungszeit im DIP, in Berliner Zeit.
export const nurTag=(s:string)=>/T00:00:00(?:\.000)?Z$/.test(s);
export function datum(s:string|null|undefined,mitZeit=false):string{
 if(!s)return 'Kein Datum in der Quelle';
 const tag=nurTag(s);
 const f:Intl.DateTimeFormatOptions=mitZeit&&!tag
  ?{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}
  :mitZeit?{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}
  :{day:'2-digit',month:'short',year:'numeric',timeZone:tag?'UTC':'Europe/Berlin'};
 return new Intl.DateTimeFormat('de-DE',f).format(new Date(s));
}

// Liegt hier und nicht in src/server/lobby.ts: die Oberflaeche importierte die Funktion von dort und zog damit
// Connectors, den HTML-Parser cheerio und einen Krypto-Ersatz in den Browser - 655 KB von 1,0 MB JavaScript.
export const withTopics=(ps:LobbyProject[])=>ps.filter(p=>p.topics.length);
