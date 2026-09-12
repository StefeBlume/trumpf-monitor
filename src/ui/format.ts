import type {Item} from '../model';
import {topicById} from '../server/topics';
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
