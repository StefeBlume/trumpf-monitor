import type {Item} from '../model';
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
