import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recency,datumsteil,suchtext,bewegungswort} from '../src/ui/format';
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

// Next.js liefert sonst seine englische Standardseite in einer durchgehend deutschen App.
test('Die Fehlerseite ist deutsch und führt zurück',()=>{
 const quelle=readFileSync('pages/404.tsx','utf8');
 assert.ok(quelle.includes('Diese Seite gibt es nicht'));
 assert.ok(quelle.includes('Zum Lagebild'),'ein Weg zurück muss da sein');
 // Relativ, damit der Link auch unter einem Unterpfad wie /trumpf-monitor/ stimmt.
 assert.ok(quelle.includes('href="."'),'ein absoluter Pfad würde unter dem Unterpfad ins Leere führen');
 assert.ok(!/This page could not be found/.test(quelle));
 // Eigene Gestaltung, damit die Seite auch ohne das ausgelagerte Stylesheet lesbar bleibt.
 assert.ok(quelle.includes('fontFamily'),'die Seite trägt ihre Gestaltung selbst');
});

// Die leadOnly-Regel betrifft 10 von 16 Ausschüssen und bestimmt, was in 37 von 41 Dokumenten
// sichtbar ist - erklärt wurde sie nirgends. Wer im DIP nachschlägt, findet dort mehr Ausschüsse.
test('Die Regel für Querschnittsausschüsse steht in der Oberfläche',()=>{
 const quelle=readFileSync('pages/index.tsx','utf8');
 assert.ok(quelle.includes('zählt nur federführend'),'die Karten müssen es kennzeichnen');
 assert.ok(quelle.includes('nur, wenn sie federführend sind'),'die Regel muss erklärt werden');
 assert.ok(quelle.includes('zeigt deshalb oft mehr Ausschüsse'),'der Unterschied zum DIP gehört dazu');
 assert.ok(quelle.includes('möglicherweise weitere mitberatende'),'auch im Dokument selbst');
});

// Fünf der sechs bevorstehenden Anhörungen lagen Wochen in der Zukunft; die Karte schrieb
// "zuletzt 14. Okt. 2026", obwohl heute der 12. September war.
test('Angekündigte Termine heißen nicht „zuletzt“',()=>{
 assert.equal(bewegungswort('2026-10-14','2026-09-12'),'nächster Termin');
 assert.equal(bewegungswort('2026-09-11','2026-09-12'),'zuletzt');
 assert.equal(bewegungswort('2026-09-12T08:00:00Z','2026-09-12'),'zuletzt','heute ist noch kein künftiger Termin');
 assert.equal(bewegungswort(undefined,'2026-09-12'),'zuletzt','ohne Datum bleibt es bei der Vergangenheit');
});

// Auf einem 375px-Telefon blieb die Quellenliste zweispaltig: 137px breite Karten, deren
// Ueberschrift 157px brauchte. Der Ueberlauf schob das ganze Dokument auf 401px und damit die
// feste Fussleiste seitlich aus dem Bild.
test('Die Quellenliste wird auf dem Telefon einspaltig',()=>{
 const css=readFileSync('src/ui/style.css','utf8');
 const block=(bedingung:string)=>{
  const start=css.indexOf('@media('+bedingung+'){');
  assert.notEqual(start,-1,'Media Query '+bedingung+' fehlt');
  let tiefe=0,i=css.indexOf('{',start);
  for(let j=i;j<css.length;j++){if(css[j]==='{')tiefe++;else if(css[j]==='}'){tiefe--;if(!tiefe)return css.slice(i,j);}}
  throw new Error('unbalancierte Klammern');
 };
 assert.match(block('max-width:700px'),/\.source-grid\{grid-template-columns:1fr\}/,'einspaltig ab 700px');
 assert.match(css,/\.bottom-nav\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)\}/,'sechs Spalten muessen schrumpfen duerfen');
 const leiste=css.match(/\.bottom-nav\{[^}]*grid-template-columns:([^;}]+)/g)??[];
 assert.ok(leiste.length>0&&leiste.every(r=>/repeat\((5|6),minmax\(0,1fr\)\)/.test(r)),'jede Fussleisten-Regel braucht schrumpfbare Spalten: '+leiste.join(' | '));
});

// "(Umsatzsteuerschlüsselzahlenfestsetzungsverordnung" ist 420px breit und stand in einer 278px
// breiten Karte - drei von 108 Titeln trugen ein Wort, das keine Handybreite fasst.
test('Überlange Amtswörter brechen um',()=>{
 const css=readFileSync('src/ui/style.css','utf8');
 assert.match(css,/h1,h2,h3,p,strong,li,td,th\{overflow-wrap:break-word\}/,'lange Wörter müssen umbrechen dürfen');
 assert.match(css,/\.item-card h3[^{]*\{hyphens:auto\}/,'Dokumenttitel werden nach deutschen Regeln getrennt');
});
