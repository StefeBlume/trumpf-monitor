import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {merklisteLesen,merken,vergessen,istGemerkt,auffrischen,imBestand,MERK_SCHLUESSEL,type Merkeintrag} from '../src/ui/gespeichert';
import type {Item} from '../src/model';
const item=(over:Partial<Item>={}):Item=>({externalId:'1',title:'Antwort auf die Kleine Anfrage',url:'https://dip.bundestag.de/drucksache/x/1',
 text:'',publishedAt:'2026-09-10T00:00:00.000Z',updatedAt:'2026-09-16T05:51:00.000Z',documentType:'Antwort',step:null,procedure:null,
 documentNumber:'21/7988',paperKey:'BT-Drucksache 21/7988',pdfUrl:null,committees:[],lead:null,ministries:[],originator:null,
 topics:[{topic:'ki',terms:['künstliche intelligenz'],count:2,inTitle:false,snippet:'… Künstliche Intelligenz in der Fertigung …'}],
 id:'a',sourceId:'dip-drucksachen',institution:'Bundestag',hash:'h1',version:1,change:'new',firstSeen:'2026-09-16T09:08:00.000Z',
 lastSeen:'2026-09-16T09:08:00.000Z',changedAt:'2026-09-16T09:08:00.000Z',archived:false,...over});

test('Die Merkliste übersteht kaputte oder fremde Speicherinhalte',()=>{
 assert.deepEqual(merklisteLesen(null),[]);
 assert.deepEqual(merklisteLesen('kein json'),[]);
 assert.deepEqual(merklisteLesen('{"item":1}'),[],'kein Array');
 const gut:Merkeintrag={item:item(),gespeichertAm:'2026-09-16T10:00:00.000Z'};
 const liste=merklisteLesen(JSON.stringify([gut,null,{gespeichertAm:'x'},{item:{id:'b'},gespeichertAm:'x'},'text']));
 assert.deepEqual(liste,[gut],'nur vollständige Einträge bleiben');
});

test('Speichern legt oben ab, ersetzt statt zu verdoppeln, und Entfernen entfernt',()=>{
 let l:Merkeintrag[]=[];
 l=merken(l,item({id:'a'}),'2026-09-16T10:00:00.000Z');
 l=merken(l,item({id:'b',title:'B'}),'2026-09-16T11:00:00.000Z');
 assert.deepEqual(l.map(e=>e.item.id),['b','a'],'zuletzt gespeichert zuerst');
 l=merken(l,item({id:'a',title:'neu'}),'2026-09-16T12:00:00.000Z');
 assert.deepEqual(l.map(e=>e.item.id),['a','b'],'erneutes Speichern verdoppelt nicht');
 assert.equal(l[0].gespeichertAm,'2026-09-16T12:00:00.000Z');
 assert.ok(istGemerkt(l,'b'));
 l=vergessen(l,'b');
 assert.ok(!istGemerkt(l,'b'));
 assert.deepEqual(l.map(e=>e.item.id),['a']);
});

// Die App löscht nach zehn Tagen. Gespeichertes muss das überstehen - mit Fundstellen, nicht nur als Kennung.
test('Gespeichert bleibt das ganze Dokument, auch nach der Frist',()=>{
 const l=merken([],item());
 assert.equal(l[0].item.topics[0].snippet,'… Künstliche Intelligenz in der Fertigung …','die Fundstelle ist mitgespeichert');
 assert.equal(auffrischen(l,[]),l,'ohne Bestand bleibt der gespeicherte Stand unverändert');
 assert.equal(imBestand(l[0],[]),undefined);
});

test('Solange ein Dokument im Bestand ist, hält die Liste dessen neuesten Stand',()=>{
 const l=merken([],item(),'2026-09-16T10:00:00.000Z');
 assert.equal(auffrischen(l,[item()]),l,'nichts geändert, dieselbe Liste - kein unnötiges Schreiben');
 const aktuell=item({version:2,change:'changed',step:'Antwort',pdf:{stand:'online',zeit:'2026-09-16T05:51:00.000Z',geprueft:'2026-09-16T09:10:00.000Z',url:'x'}});
 const n=auffrischen(l,[aktuell]);
 assert.notEqual(n,l);
 assert.equal(n[0].item.version,2);
 assert.equal(n[0].gespeichertAm,'2026-09-16T10:00:00.000Z','der Zeitpunkt des Speicherns bleibt');
});

// Eine Drucksache aus zwei Quellen wird zusammengeführt; der gespeicherte Eintrag kann die entfernte Kennung tragen.
test('Ein zusammengeführtes Papier wird über die Drucksache wiedergefunden',()=>{
 const l=[{item:item({id:'weg'}),gespeichertAm:'2026-09-16T11:00:00.000Z'},{item:item({id:'fuehrend'}),gespeichertAm:'2026-09-16T10:00:00.000Z'}];
 const fuehrend=item({id:'fuehrend',committees:['we'],lead:'we'});
 assert.equal(imBestand(l[0],[fuehrend])?.id,'fuehrend');
 const n=auffrischen(l,[fuehrend]);
 assert.deepEqual(n.map(e=>e.item.id),['fuehrend'],'kein doppelter Eintrag');
 assert.deepEqual(n[0].item.committees,['we']);
});

test('Die Oberfläche ersetzt die Briefings durch „Gespeichert“',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes("['saved','Gespeichert',Bookmark]"),'Navigation');
 assert.ok(!seite.includes("'briefings'"),'kein Briefing-Fenster mehr');
 assert.ok(!seite.includes('Briefing lesen'),'kein Verweis darauf');
 assert.ok(seite.includes("view==='saved'?"),'eigene Ansicht');
 assert.ok(seite.includes('onClick={()=>merkenUmschalten(selected)}'),'Speichern in der Dokumentansicht');
 assert.ok(seite.includes('{gemerkt(selected.id)?<><BookmarkCheck size={17}/>Gespeichert</>:<><Bookmark size={17}/>Speichern</>}'),'der Knopf zeigt den Zustand');
 assert.ok(seite.includes('localStorage.setItem(MERK_SCHLUESSEL,JSON.stringify(l))'),'die Liste wird gesichert');
 assert.ok(seite.includes('merklisteLesen(localStorage.getItem(MERK_SCHLUESSEL))'),'und beim Start gelesen');
 assert.equal(MERK_SCHLUESSEL,'policy-gespeichert');
 assert.ok(seite.includes('async function exportGespeichert()'),'die Liste lässt sich weitergeben');
 assert.ok(seite.includes('Nicht mehr im aktuellen Bestand'),'ein gelöschtes Dokument sagt, dass es der gespeicherte Stand ist');
});
