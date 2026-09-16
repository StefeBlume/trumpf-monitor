// Eine App auf dem Home-Bildschirm bleibt oft stundenlang im Speicher und laeuft mit dem Code, mit dem sie geoeffnet
// wurde. Am 16.09. oeffnete sie Dokumente auf dem Handy deshalb weiter unten, obwohl die Korrektur seit Stunden live war -
// im iOS-Safari des Simulators oeffnete dieselbe Seite oben. Die Seite vergleicht darum ihre eigene Fassung mit der
// veroeffentlichten und laedt nach, wenn eine neuere bereitsteht.
export function neueFassung(eigene:string,veroeffentlicht:unknown):string|null{
 const b=veroeffentlicht&&typeof veroeffentlicht==='object'?(veroeffentlicht as {build?:unknown}).build:undefined;
 return !!eigene&&typeof b==='string'&&/^[0-9a-f]{7,40}$/.test(b)&&b!==eigene?b:null;
}
// Der Stand der Quellen wird alle 10 Minuten neu veroeffentlicht. Wer die App nach einer Pause wieder oeffnet, soll ihn sehen,
// ohne erst "Stand neu laden" zu tippen.
export const DATEN_ALTER_MS=5*60_000;
