import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recency,datumsteil,suchtext} from '../src/ui/format';
import type {Item} from '../src/model';
const item=(over:Partial<Item>={}):Item=>({externalId:'1',title:'Gesetz zur Änderung des Außenwirtschaftsgesetzes',
 url:'https://www.bundestag.de/x',text:'',publishedAt:null,updatedAt:null,documentType:'Gesetzentwurf',
 step:null,procedure:null,documentNumber:null,pdfUrl:null,committees:[],lead:null,ministries:[],
 originator:null,topics:[],id:'i',sourceId:'s',institution:'I',hash:'h',version:1,change:'new',
 firstSeen:'2026-09-01T00:00:00.000Z',lastSeen:'2026-09-01T00:00:00.000Z',changedAt:'2026-09-01T00:00:00.000Z',
 archived:false,...over});

const roh=(u:string|null,p:string|null,f='2026-09-01T00:00:00.000Z')=>({updatedAt:u,publishedAt:p,firstSeen:f});
const kurz=(s:string|null)=>s?s.slice(0,10):'kein Datum';

// Live zeigte dasselbe Papier je nach Ansicht ein anderes Datum zuerst: in den Thementreffern
// "10. Sept. 2026 · Dokument vom 17. Okt. 2025", in der Dokumentliste "17. Okt. 2025 · bewegt
// 10. Sept. 2026". Fuehrend muss ueberall das Datum sein, nach dem sortiert und aufbewahrt wird.
test('Beide Kartenarten führen dasselbe Datum',()=>{
 const alt=roh('2026-09-10T08:00:00.000Z','2025-10-17T00:00:00.000Z');
 const d=datumsteil(alt,kurz);
 assert.equal(d.gefuehrt,'2026-09-10','führend ist die Bewegung, nach der auch sortiert wird');
 assert.equal(d.eigenes,'2025-10-17','das eigene Datum des Papiers folgt als Zusatz');
 assert.equal(d.gefuehrt,kurz(recency(alt)),'führendes Datum und Sortierschlüssel sind dasselbe');
});

test('Stimmen beide Daten überein, wird nichts doppelt gezeigt',()=>{
 const gleich=roh('2026-09-10T14:00:00.000Z','2026-09-10T00:00:00.000Z');
 assert.equal(datumsteil(gleich,kurz).eigenes,null,'gleicher Tag, kein Zusatz');
 assert.equal(datumsteil(roh(null,'2026-09-10T00:00:00.000Z'),kurz).eigenes,null);
});

test('Ohne Quellendatum bleibt die Anzeige nutzbar',()=>{
 const ohne=roh(null,null,'2026-08-20T09:00:00.000Z');
 assert.equal(datumsteil(ohne,kurz).gefuehrt,'2026-08-20','der Erstkontakt trägt die Anzeige');
 assert.equal(datumsteil(ohne,kurz).eigenes,null);
});

// Die Oberflaeche darf nicht zwei Woerter fuer dieselbe Beziehung fuehren.
test('Die Oberfläche benennt das Zusatzdatum nur auf eine Weise',()=>{
 const quelle=readFileSync('pages/index.tsx','utf8');
 assert.equal((quelle.match(/>bewegt /g)??[]).length,0,'"bewegt" war die zweite Wortwahl und ist abgelöst');
 assert.ok(quelle.includes('Dokument vom'),'die verbliebene Wortwahl muss vorhanden sein');
 // Beide Karten müssen dieselbe Hilfsfunktion nutzen, statt das Datum selbst zusammenzubauen.
 assert.equal((quelle.match(/datumsteil\(item\)/g)??[]).length>=2,true,'beide Kartenarten nutzen dieselbe Darstellung');
});

// Die Zehn-Tage-Grenze gilt der Bewegung, nicht dem Datum des Papiers. Der alte Untertitel
// "nur die letzten 10 Tage" stand neben Dokumenten von 2025 und las sich schlicht falsch.
test('Der Untertitel verspricht nur, was die Aufbewahrung hält',()=>{
 const quelle=readFileSync('pages/index.tsx','utf8');
 assert.equal((quelle.match(/nur die letzten 10 Tage/g)??[]).length,0);
 assert.ok(quelle.includes('Bewegungen der letzten 10 Tage'));
});

// Die Suche verkettete die Felder roh: ein fehlendes documentNumber landete als "null" im Suchtext,
// und die Suche nach "null" lieferte genau die Dokumente ohne Nummer. Die Themen fehlten ganz.
test('Der Suchtext enthält keine Platzhalter für fehlende Felder',()=>{
 const leer=item({documentNumber:null,step:null,procedure:null,originator:null,topics:[]});
 const t=suchtext(leer,[]);
 assert.ok(!t.includes('null'),`"null" steht im Suchtext: ${t}`);
 assert.ok(!t.includes('undefined'));
 assert.ok(t.includes('gesetz zur änderung'),'der Titel muss enthalten sein');
});

test('Die Suche findet ein Dokument über sein Thema',()=>{
 // "Halbleiter" fand live einen Treffer, obwohl die Themenleiste zehn zählte.
 const mit=item({title:'Bericht ohne Schlagwort im Titel',topics:[
  {topic:'halbleiter',terms:['mikroelektronik'],count:9,inTitle:false,snippet:'… Ausbau der Mikroelektronik in Dresden …'}]});
 const t=suchtext(mit,['Wirtschaft und Energie']);
 assert.ok(t.includes('halbleiter & euv'),'das Thema selbst ist suchbar');
 assert.ok(t.includes('mikroelektronik'),'der gefundene Begriff ist suchbar');
 assert.ok(t.includes('dresden'),'auch die Fundstelle ist suchbar');
 assert.ok(t.includes('wirtschaft und energie'),'und das Gremium');
});

test('Der Suchtext deckt die übrigen angezeigten Felder ab',()=>{
 const voll=item({documentNumber:'21/7992',step:'Beschlussempfehlung',procedure:'Gesetzgebung',originator:'Bundesregierung'});
 const t=suchtext(voll,[]);
 for(const s of ['21/7992','beschlussempfehlung','gesetzgebung','bundesregierung'])
  assert.ok(t.includes(s),`${s} fehlt im Suchtext`);
});
