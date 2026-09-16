import type {Item} from '../model';
// Gespeicherte Dokumente ersetzen die Briefings. Der Bestand wird nach zehn Tagen geleert, die Merkliste nicht: sie haelt
// deshalb das ganze Dokument samt Fundstellen, nicht nur dessen Kennung. Sie liegt im Speicher des Browsers - die Seite
// auf GitHub Pages hat keinen Server, der sie ueber Geraete hinweg fuehren koennte.
export interface Merkeintrag {item:Item; gespeichertAm:string}
export const MERK_SCHLUESSEL='policy-gespeichert';
export function merklisteLesen(roh:string|null|undefined):Merkeintrag[]{
 try{
  const d:unknown=JSON.parse(roh??'[]');
  return Array.isArray(d)?d.filter((e):e is Merkeintrag=>!!e&&typeof e==='object'&&typeof e.gespeichertAm==='string'
   &&!!e.item&&typeof e.item.id==='string'&&typeof e.item.title==='string'&&typeof e.item.url==='string'):[];
 }catch{return [];}
}
export const istGemerkt=(liste:Merkeintrag[],id:string)=>liste.some(e=>e.item.id===id);
export const merken=(liste:Merkeintrag[],item:Item,jetzt=new Date().toISOString()):Merkeintrag[]=>
 [{item,gespeichertAm:jetzt},...liste.filter(e=>e.item.id!==item.id)];
export const vergessen=(liste:Merkeintrag[],id:string)=>liste.filter(e=>e.item.id!==id);
// Solange ein Dokument im Bestand ist, gilt dessen aktueller Stand; die Liste haelt ihn fest, bevor die Frist ihn loescht.
// Eine zusammengefuehrte Drucksache lebt unter der Kennung ihres fuehrenden Eintrags weiter - gefunden ueber das Papier.
export function imBestand(e:Merkeintrag,items:Item[]):Item|undefined{
 return items.find(i=>i.id===e.item.id)??(e.item.paperKey?items.find(i=>i.paperKey===e.item.paperKey):undefined);
}
export function auffrischen(liste:Merkeintrag[],items:Item[]):Merkeintrag[]{
 let anders=false;
 const neu=liste.map(e=>{const aktuell=imBestand(e,items);if(!aktuell||JSON.stringify(aktuell)===JSON.stringify(e.item))return e;anders=true;return {...e,item:aktuell};});
 // Zwei gemerkte Eintraege desselben Papiers werden einer.
 const eindeutig=neu.filter((e,k)=>neu.findIndex(x=>x.item.id===e.item.id)===k);
 return anders||eindeutig.length!==liste.length?eindeutig:liste;
}
