import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {recency,datumsteil,suchtext,kartenDatum,listenOrdnung,datum,nurTag,anzeigeStatus,berlinTag,themenReihenfolge,quellenStand,gremienNamen} from '../src/ui/format';
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
 assert.ok(!quelle.includes('Dokument vom'),'"Dokument vom" las sich als Veröffentlichungstag und ist abgelöst');
 assert.ok(readFileSync('src/ui/format.ts','utf8').includes("zusatz:eigenes?`${istTermin(i)?'Sitzung am':'datiert'} ${eigenes}`:null"),'die eine Wortwahl steht in format.ts');
 // Beide Karten müssen dieselbe Hilfsfunktion nutzen, statt das Datum selbst zusammenzubauen.
 assert.equal((quelle.match(/kartenDaten\(item\)/g)??[]).length>=2,true,'beide Kartenarten nutzen dieselbe Darstellung');
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
 // Über den Basispfad des Builds, nicht relativ: "." führte auf ".../trumpf-monitor/gibt/es/nicht" nach
 // ".../gibt/es/" und damit wieder auf die Fehlerseite. Ein fest verdrahtetes "/" läge neben dem Unterpfad.
 assert.ok(quelle.includes("href={`${process.env.NEXT_PUBLIC_BASE_PATH??''}/`}"),'der Weg zurück muss aus jeder Tiefe zum Lagebild führen');
 assert.ok(!quelle.includes('href="/"'),'kein Pfad, der den Unterpfad übergeht');
 assert.ok(!/This page could not be found/.test(quelle));
 // Eigene Gestaltung, damit die Seite auch ohne das ausgelagerte Stylesheet lesbar bleibt.
 assert.ok(quelle.includes('fontFamily'),'die Seite trägt ihre Gestaltung selbst');
});

// Die leadOnly-Regel betrifft 10 von 16 Ausschüssen und bestimmt, was in 37 von 41 Dokumenten
// sichtbar ist - erklärt wurde sie nirgends. Wer im DIP nachschlägt, findet dort mehr Ausschüsse.
test('Die Regel für Querschnittsausschüsse steht in der Oberfläche',()=>{
 const quelle=readFileSync('pages/index.tsx','utf8');
 assert.ok(quelle.includes('Vorlagen nur federführend'),'die Karten müssen es kennzeichnen');
 assert.ok(quelle.includes('nur, wenn sie federführend sind'),'die Regel muss erklärt werden');
 assert.ok(quelle.includes('zeigt deshalb oft mehr Ausschüsse'),'der Unterschied zum DIP gehört dazu');
 assert.ok(quelle.includes('Laut DIP beraten außerdem mit:'),'auch im Dokument selbst, mit den Namen');
});

// Fünf der sechs bevorstehenden Anhörungen lagen Wochen in der Zukunft; die Karte schrieb
// "zuletzt 14. Okt. 2026", obwohl heute der 12. September war. Danach hieß es "nächster Termin 14. Okt. 2026":
// das späteste Datum. Der nächste der fünf angekündigten Termine des Rechtsausschusses lag am 23. September.
test('Gremienkarten nennen den nächsten Termin, nicht den spätesten',()=>{
 const termin=(tag:string)=>({documentType:'Ausschusstermin',publishedAt:`${tag}T00:00:00.000Z`,updatedAt:null,firstSeen:'2026-09-01T08:00:00.000Z'});
 const vorlage=(stamp:string)=>({documentType:'Gesetzentwurf',publishedAt:null,updatedAt:stamp,firstSeen:'2026-09-01T08:00:00.000Z'});
 const heute='2026-09-13';
 assert.deepEqual(kartenDatum([vorlage('2026-09-11T10:00:00.000Z'),termin('2026-10-14'),termin('2026-09-23'),termin('2026-09-30')],heute),
  {wort:'nächster Termin',stamp:'2026-09-23T00:00:00.000Z'},'der früheste kommende, nicht der späteste');
 assert.deepEqual(kartenDatum([vorlage('2026-09-11T10:00:00.000Z'),vorlage('2026-09-08T10:00:00.000Z'),termin('2026-09-02')],heute),
  {wort:'zuletzt',stamp:'2026-09-11T10:00:00.000Z'},'sonst die jüngste Bewegung');
 assert.equal(kartenDatum([termin('2026-09-13'),vorlage('2026-09-12T10:00:00.000Z')],heute)?.wort,'nächster Termin','ein Termin von heute kommt noch, wie unter „Als Nächstes“');
 assert.equal(kartenDatum([vorlage('2026-09-13T08:00:00.000Z')],heute)?.wort,'zuletzt','eine Änderung von heute ist geschehen');
 assert.equal(kartenDatum([],heute),null,'ohne Einträge nennt die Karte kein Datum');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.equal((seite.match(/stand=kartenDatum\(items,today\(\)\)/g)??[]).length,2,'Ausschuss- und Ressortkarten');
 assert.ok(!seite.includes('.map(recency).sort().at(-1)'),'kein spätestes Datum mehr auf den Karten');
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

// Die Einstellungsseite versprach Zeiten, die nicht zum Zeitplan passten. Der Test liest den Takt aus dem Workflow,
// damit Text und Takt nicht wieder auseinanderlaufen. Gerechnet wird in Berliner Zeit - der Taktgeber prüft sie selbst.
test('Die genannten Laufzeiten folgen aus dem Takt',()=>{
 const takt=readFileSync('.github/workflows/takt.yml','utf8');
 const m=/if \[ "\$stunde" -ge (\d+) \] && \[ "\$stunde" -le (\d+) \]/.exec(takt);
 assert.ok(m,'Takt nicht gefunden');
 const [von,bis]=[Number(m![1]),Number(m![2])];
 const zeit=(h:number)=>`${String(h).padStart(2,'0')}:00`;
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes(`von ${zeit(von)} bis ${zeit(bis+1)} Uhr Berliner Zeit`),'Einstellungen');
 assert.ok(seite.includes(`${zeit(von)}–${zeit(bis+1)} Uhr Berliner Zeit`),'Betriebsstatus');
 assert.ok(!seite.includes('zwischen 06:00 und 22:00'),'die alte Angabe stimmte nie');
 assert.ok(readFileSync('README.md','utf8').includes(`von ${zeit(von)} bis ${zeit(bis+1)} Uhr Berliner Zeit`),'README');
});

// Aussagen, die der Bestand widerlegt hat: 469 von 559 Vorhaben tragen keine Drucksache; 62 von 108
// Dokumenten kommen ohne Gremium über die Volltextsuche herein; drei der Dokumente ohne Gremium
// stammen aus der Ausfuhrkontrolle, nicht aus der Volltextsuche.
test('Die Oberfläche behauptet nichts, was der Bestand widerlegt',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(!seite.includes('Jedes Vorhaben verlinkt'),'die meisten Vorhaben haben kein eigenes Papier');
 assert.ok(!seite.includes('Alles andere wird verworfen'),'die Volltextsuche nimmt Papiere unabhängig vom Gremium auf');
 assert.ok(!seite.includes('stammen aus der Volltextsuche und sind keinem'),'nicht alle Dokumente ohne Gremium kommen aus der Volltextsuche');
 assert.ok(seite.includes('const quellenOhneGremium='),'die Quellen werden aus dem Bestand abgeleitet');
 assert.ok(seite.includes('die Liste der Themenbegriffe'),'die Themenliste ist die zweite inhaltliche Entscheidung');
});

test('Keine Tabelle ohne Verwendung',()=>{
 assert.ok(!readFileSync('src/server/db.ts','utf8').includes('cron_days'),'cron_days wurde nie gelesen oder geschrieben');
});

// Beide Saetze erschienen auf der Live-Seite und widersprachen dem Bestand: 75 von 108 Dokumenten
// zeigen eine Fundstelle aus dem Volltext, 18 haben keine Drucksachennummer, 12 kein PDF, und die
// Volltextsuche nimmt Papiere nach Thema auf, nicht nach Gremium.
test('Detail- und Einstellungsseite beschreiben die Arbeitsweise zutreffend',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(!seite.includes('Der Inhalt wird nicht ausgewertet'),'die Themensuche liest den Volltext');
 assert.ok(!seite.includes('Gefiltert wird ausschließlich über die Zuständigkeit'),'es gibt zwei Wege in die App');
 assert.ok(!seite.includes('unverändert mit Drucksachennummer und amtlichem PDF'),'nicht jedes Dokument hat beides');
 assert.ok(!seite.includes('keine Priorisierung'),'Thementreffer stehen oben');
});

// NEXT_PUBLIC_HOSTED wurde nirgends gesetzt: ein toter Modus aus der Codex-Fassung. Trotzdem stand im
// ausgelieferten Buendel "Bitte erneut mit ChatGPT anmelden" - lokal erschien das, sobald der Server
// abstuerzte oder kompilierte. Eine ChatGPT-Anmeldung gibt es in dieser App nicht.
test('Keine Reste der Codex-Fassung',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(!/HOSTED/.test(seite),'der HOSTED-Modus war nie aktiv');
 assert.ok(!/chatgpt/i.test(seite),'es gibt keine ChatGPT-Anmeldung');
 assert.ok(!seite.includes('iPhone und Mac müssen denselben Server'),'die iPhone-App ist gelöscht');
 assert.ok(seite.includes('antwortet kein Monitoring-Server'),'die Meldung nennt die tatsächliche Ursache');
});


// Das README behauptete, die Datenbank wachse unbegrenzt und nichts werde entfernt - seit der
// Zehn-Tage-Regel falsch. Ebenso "ungefiltert" fuer BAFA und "nur Titel" fuer einen Feed mit Beschreibungen.
test('Das README beschreibt Aufbewahrung und BAFA-Quelle zutreffend',()=>{
 const readme=readFileSync('README.md','utf8');
 assert.ok(!readme.includes('Die Datenbank wächst unbegrenzt'),'die Aufbewahrung entfernt Dokumente');
 assert.ok(readme.includes('`RETENTION_DAYS`, Standard 10'),'die Frist steht im README');
 assert.ok(!readme.includes('BAFA-Newsfeed | RSS | ungefiltert'),'die Quelle ist auf die Rubrik beschränkt');
 assert.ok(!readme.includes('den BAFA-Feed gibt es ohnehin nur Titel'),'der Feed führt Beschreibungen');
 const monitor=readFileSync('src/server/monitor.ts','utf8');
 assert.match(monitor,/RETENTION_DAYS\?\?10/,'README und Code nennen dieselbe Frist');
 assert.match(monitor,/ORDER BY rowid DESC LIMIT 60/,'README und Code nennen dieselbe Zahl gespeicherter Briefings');
});

// "Veröffentlicht: 14. Okt. 2026" stand bei einer Anhörung, die erst stattfindet; bei Tagesordnungen hätte
// "Dokument vom" den Sitzungstag bezeichnet.
test('Termine heißen Termine, nicht Veröffentlichungen',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 const format=readFileSync('src/ui/format.ts','utf8');
 assert.ok(format.includes("if(istTermin(i))return [['Termin',datum(i.publishedAt)],"),'die Dokumentansicht unterscheidet');
 assert.ok(seite.includes(',...datumsZeilen(selected)].map('));
 assert.ok(format.includes("if(istTermin(i))return nurEigenes?'Sitzung am':"),'beide Kartenformen unterscheiden');
 assert.ok(seite.includes('const isUpcoming=(i:Item)=>kommenderTermin(i,today());'),'"Als Nächstes", Gremienkarte und Listen nutzen dieselbe Bestimmung');
});

// Mit einem Parameter in der Adresse entfernt Next.js nach dem Start den Schraegstrich. Der Stand wurde
// relativ zur Adresszeile geladen: "/trumpf-monitor/?x=1" fragte "/bootstrap.json" ab, erhielt 404, und die
// App zeigte kein einziges Dokument - so kommen Links an, die ueber soziale Netzwerke geteilt werden.
test('Der Stand wird über den Basispfad geladen, nicht relativ zur Adresse',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(!/new URL\('bootstrap\.json',window\.location/.test(seite),'kein Abruf relativ zur Adresszeile');
 assert.ok(seite.includes("fetch(`${process.env.NEXT_PUBLIC_BASE_PATH??''}/bootstrap.json`"),'der Pfad kommt aus dem Build');
 const config=readFileSync('next.config.mjs','utf8');
 assert.match(config,/basePath:base/,'Build und Abruf nutzen denselben Basispfad');
 assert.match(config,/process\.env\.NEXT_PUBLIC_BASE_PATH/,'aus derselben Variable');
});

// "Letzte Bewegung laut Quelle: 23.09.2026, 02:00" stand bei einer Anhörung, die erst am 23. stattfindet:
// eine erfundene Uhrzeit aus Mitternacht UTC, und als "Bewegung" nur der Termin selbst.
test('Reine Tagesangaben erscheinen ohne erfundene Uhrzeit und ohne Tagesverschiebung',()=>{
 assert.equal(nurTag('2026-09-23T00:00:00.000Z'),true);
 assert.equal(nurTag('2026-09-07T06:43:12.000Z'),false);
 assert.equal(datum('2026-09-23T00:00:00.000Z',true),'23.09.2026','keine Uhrzeit, die keine Quelle nennt');
 assert.equal(datum('2026-09-07T06:43:12.000Z',true),'07.09.2026, 08:43','echte Zeitpunkte in Berliner Zeit');
 assert.equal(datum('2026-09-23T00:00:00.000Z'),'23. Sept. 2026');
 assert.equal(datum('2026-09-22T23:30:00.000Z'),'23. Sept. 2026','ein Zeitpunkt kurz vor Mitternacht UTC ist in Berlin schon der nächste Tag');
 assert.equal(datum(null),'Kein Datum in der Quelle');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(readFileSync('src/ui/format.ts','utf8').includes('const eigene=!!i.updatedAt&&i.updatedAt!==i.publishedAt;'),'ein Termin ohne eigenes Änderungsdatum behauptet keine Bewegung');
 assert.ok(seite.includes("timeZone:nurTag(i.publishedAt!)?'UTC':'Europe/Berlin'"),'"Als Nächstes" verschiebt keinen Tag');
 assert.ok(!/new Intl\.DateTimeFormat\('de-DE',full\?/.test(seite),'kein zweiter Formatierer neben datum()');
});

// Drei Aussagen des Lagebilds und der Quellenansicht stimmten nicht mit der App überein.
test('Fußnote, Quellenhinweis und Datumsfilter sagen, was die App tut',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 // Die Themensuche nimmt Drucksachen ohne Gremium auf; "ausschließlich für die ausgewählten Gremien" stimmte nicht.
 assert.ok(!seite.includes('ausschließlich für die ausgewählten Gremien'),'die Fußnote nennt nicht nur Gremien');
 assert.ok(seite.includes('die Themensuche in den Drucksachen'),'sie nennt beide Wege in die App');
 // Keine Quelle ist "offen"; der Hinweis erklärte einen Zustand, den es nicht gab.
 assert.ok(seite.includes("{data.sources.some(s=>s.status==='manual')&&<div className=\"notice\">"),'der Offen-Hinweis erscheint nur, wenn es offene Quellen gibt');
 // Die Liste führt die letzte Bewegung; der Filter prüfte das Dokumentdatum und blendete aktuelle Bewegungen alter Papiere aus.
 assert.ok(seite.includes('(!after||berlinTag(recency(i))>=after)'),'gefiltert wird nach demselben Datum, nach dem sortiert wird, als Berliner Tag');
 assert.ok(seite.includes('<label>Letzte Bewegung ab<input type="date"'),'und die Beschriftung sagt es');
 assert.ok(!seite.includes('Veröffentlicht ab'));
});

// "Sortiert nach Themenbreite und Zahl der Vorhaben" - der Code sortiert nach eigenem Eintrag, dann nach
// Vorhaben zu deinen Themen, dann nach Themenbreite. Beim BDEW stehen 200 gemeldete Vorhaben auf der Karte,
// sortiert wird nach 41.
test('Die Akteure-Ansicht beschreibt ihre Sortierung so, wie sie sortiert',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes('Eigener Eintrag zuerst, dann nach Vorhaben zu deinen Themen und nach Themenbreite'));
 const sortierung=/\.sort\(\(a,b\)=>Number\(b\.own\)-Number\(a\.own\)\|\|trefferVorhaben\(b\)-trefferVorhaben\(a\)\|\|b\.topics\.length-a\.topics\.length/;
 assert.match(seite,sortierung,'Beschreibung und Sortierung gehören zusammen');
 assert.ok(!seite.includes("'Vorhaben gemeldet':'Vorhaben gemeldet'"),'kein Zweig mit zwei gleichen Ergebnissen');
 assert.ok(!seite.includes('Ausgewählte Ausschüsse und Ressorts'),'der Export nennt auch die Themensuche');
});

// Das README nannte "Standard 180" für die Aufbewahrung (der Code nutzt 10), "69 Tests in vier Dateien",
// "werden nie entfernt" für Termine und die Zusammenführung über die blosse Drucksachennummer.
test('Das README nennt die Werte und Regeln, die der Code verwendet',()=>{
 const readme=readFileSync('README.md','utf8');
 const monitor=readFileSync('src/server/monitor.ts','utf8');
 const code=Number(/RETENTION_DAYS\?\?(\d+)/.exec(monitor)![1]);
 const tabelle=Number(/\| `RETENTION_DAYS` \| nein \| Standard (\d+)/.exec(readme)![1]);
 assert.equal(tabelle,code,'Aufbewahrungsfrist in Tabelle und Code');
 assert.ok(!readme.includes('werden nie entfernt'),'Termine laufen zehn Tage nach ihrem Datum ab');
 assert.ok(!readme.includes('Einträge mit gleicher Drucksachennummer werden zusammengelegt'),'zusammengeführt wird das Papier, nicht die Nummer');
 assert.ok(!/\d+ Tests in \S+ Dateien/.test(readme),'keine Testzahl, die mit dem nächsten Test veraltet');
 for(const f of readdirSync('tests').filter(f=>f.endsWith('.test.ts')))assert.ok(readme.includes('`tests/'+f+'`'),`das README beschreibt tests/${f}`);
 assert.ok(!readme.includes('Sortiert wird nach Themenbreite, dann nach Zahl der Vorhaben'),'Akteure werden anders sortiert');
 assert.ok(!readme.includes('Sortiert wird nach Fundstellen im Titel'),'die Listen ordnen nach der letzten Bewegung');
 assert.ok(!readme.includes('`EUV` treffen nur in Großschreibung'),'EUV verlangt einen Halbleiterbezug im Satz');
 assert.ok(readme.includes('`ERFASSUNGSSTAND`')&&monitor.includes('export const ERFASSUNGSSTAND'),'der Erfassungsstand ist dokumentiert und existiert');
});

// Unter dem Filter "Lasertechnik & Photonik" stand auf der Karte von TRUMPF "5 Vorhaben gemeldet, keines davon
// zu deinen Themen" - alle fünf berühren deine Themen, nur nicht Laser. 52 Karten über neun Filter hinweg.
test('Unter Themenfilter sagt die Akteure-Karte, welches Thema fehlt',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes('keines zum Thema {topicById(topic)?.label}'),'mit Filter wird das Thema genannt');
 assert.ok(seite.includes('zu anderen deiner Themen'),'und die Vorhaben zu anderen Themen');
 assert.ok(seite.includes("topic?<>, keines zum Thema"),'die allgemeine Aussage gilt nur ohne Filter');
});

// Die Oberfläche importierte withTopics aus src/server/lobby.ts. Damit landeten Connectors, der HTML-Parser
// cheerio und ein Krypto-Ersatz im Browser: 655 KB von 1,0 MB JavaScript, auf dem Handy über Mobilfunk.
test('Die Oberfläche lädt keinen Server-Code',()=>{
 const erlaubt=/^\.\.\/(?:src\/)?server\/topics$/;
 for(const datei of ['pages/index.tsx','src/ui/format.ts']){
  const quelle=readFileSync(datei,'utf8');
  for(const m of quelle.matchAll(/^import\s+(type\s+)?\{[^}]*\}\s+from\s+'([^']+)';/gm)){
   const [,nurTyp,pfad]=m;
   if(/server\//.test(pfad)&&!nurTyp)assert.match(pfad,erlaubt,`${datei} lädt ${pfad} zur Laufzeit`);
  }
 }
 // topics.ts selbst darf nichts vom Server nachladen.
 assert.ok(!/^import\s+(?!type)/m.test(readFileSync('src/server/topics.ts','utf8')),'topics.ts bleibt ohne Laufzeit-Importe');
});

// Auf ".../trumpf-monitor/gibt/es/nicht" führte "Zum Lagebild" nach ".../gibt/es/" - wieder auf die Fehlerseite.
// Und die Dokumentansicht nannte Themen als Grund des Erscheinens, auch bei Ausschusspositionen, und schrieb
// bei Plenarprotokollen "Nicht in der Quelle angegeben", obwohl die Quelle eine Sitzungsnummer nennt.
test('Fehlerseite und Dokumentansicht behaupten nichts Falsches',()=>{
 const fehler=readFileSync('pages/404.tsx','utf8');
 assert.ok(!fehler.includes('href="."'),'kein relativer Link aus einer beliebig tiefen Fehleradresse');
 assert.ok(fehler.includes("href={`${process.env.NEXT_PUBLIC_BASE_PATH??''}/`}"),'der Link führt über den Basispfad zum Lagebild');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(!seite.includes('Warum dieses Dokument erscheint'),'Ausschusspositionen erscheinen wegen der Überweisung');
 assert.ok(seite.includes("selected.documentType==='Plenarprotokoll'?'Keine – die Fundstelle ist ein Plenarprotokoll'"));
});

// Alle 129 Dokumente trugen live "Unverändert", auch eines, das 11 Stunden zuvor hereingekommen war, und der Filter
// "Neu" blieb leer: der Status galt nur bis zum nächsten 30-Minuten-Lauf.
test('Neu und Geändert gelten 24 Stunden nach der letzten echten Änderung',()=>{
 const jetzt=Date.parse('2026-09-13T08:00:00.000Z');
 const vor=(h:number)=>new Date(jetzt-h*3600000).toISOString();
 assert.equal(anzeigeStatus({change:'new',changedAt:vor(11)},jetzt),'new','elf Stunden alt ist neu');
 assert.equal(anzeigeStatus({change:'changed',changedAt:vor(23)},jetzt),'changed');
 assert.equal(anzeigeStatus({change:'new',changedAt:vor(25)},jetzt),'unchanged','nach einem Tag nicht mehr');
 assert.equal(anzeigeStatus({change:'baseline',changedAt:vor(2)},jetzt),'baseline');
 assert.equal(anzeigeStatus({change:'unchanged',changedAt:vor(1)},jetzt),'unchanged');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(!seite.includes('i.change===status'),'der Filter nutzt die Anzeige');
 assert.ok(!seite.includes('labels[item.change]')&&!seite.includes('labels[selected.change]'),'Karte und Dokumentansicht nutzen die Anzeige');
});

// "Als Nächstes" zählte in der Überschrift alle kommenden Termine, zeigte aber fest die ersten sechs - ohne
// Hinweis und ohne Weg zu den übrigen. Beim siebten Termin hätte "7" dagestanden und eine Anhörung gefehlt.
test('Als Nächstes zeigt jeden gezählten Termin oder einen Weg dorthin',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(!seite.includes('{upcoming.slice(0,6).map('),'keine feste Kürzung ohne Knopf');
 assert.ok(seite.includes('(alleTermine?upcoming:upcoming.slice(0,6)).map('),'gekürzt nur, solange nicht alle gewünscht sind');
 assert.ok(seite.includes('{upcoming.length>6&&<button'),'ab dem siebten Termin erscheint der Knopf');
 assert.ok(seite.includes('`Alle ${upcoming.length} Termine zeigen`'),'der Knopf nennt dieselbe Zahl wie die Überschrift');
});

// "Recht · federführend" stand auf Anhörungen, "Federführend" im Gremienbereich einer Tagesordnung. Federführung
// ist die Verantwortung für eine überwiesene Vorlage; eine Sitzung veranstaltet der Ausschuss. Live trugen alle
// 7 Anhörungen und 4 Tagesordnungen die Angabe.
test('Termine behaupten keine Federführung',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes("{lead.short}{istTermin(item)?'':' · federführend'}"),'die Karte');
 assert.ok(seite.includes("{istTermin(selected)?'Veranstaltet die Sitzung':'Federführend'}"),'der Gremienbereich');
 assert.ok(seite.includes("${istTermin(i)?'Ausschuss':'Federführend'}"),'der Export');
 assert.ok(!seite.includes('{lead.short} · federführend</span>'),'keine unbedingte Federführung auf Karten');
});

// "zählt nur federführend" stand auf der Karte des Rechtsausschusses, deren 7 Einträge zu 5 aus Anhörungen bestanden;
// und bei einer Anhörung erklärte die Dokumentansicht, das DIP nenne "zu diesem Vorgang" weitere Ausschüsse.
test('Die Federführungsregel gilt für Vorlagen, nicht für Sitzungen',()=>{
 const quelle=readFileSync('pages/index.tsx','utf8');
 assert.ok(quelle.includes('Bei Vorlagen zählen {COMMITTEES.filter(c=>c.leadOnly).length} dieser Gremien nur'),'die Regel nennt ihren Geltungsbereich');
 assert.ok(quelle.includes('Ihre eigenen Sitzungen und Anhörungen erscheinen immer.'),'und die Ausnahme');
 assert.ok(!quelle.includes('zählt nur federführend'),'kein Abzeichen ohne Geltungsbereich');
 assert.ok(quelle.includes('{nurMitberatend(selected).length>0&&'),'der DIP-Hinweis nennt, was tatsächlich weggelassen wurde');
 assert.ok(!quelle.includes('möglicherweise weitere mitberatende'),'kein pauschaler Hinweis');
});

// Karten zeigen den Status der letzten 24 Stunden - wie die Dokumentansicht.
test('Karte und Dokumentansicht zeigen denselben Status',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes('const stand=anzeigeStatus(item);'),'die Karte');
 assert.ok(seite.includes("{'item-stripe '+stand}")&&seite.includes('{labels[stand]}'),'Streifen und Etikett folgen ihm');
 assert.ok(seite.includes("const detailStatus=selected?anzeigeStatus(selected):'unchanged';")&&seite.includes('{labels[detailStatus]}'),'die Dokumentansicht');
});

test('Tage werden nach Berliner Kalender verglichen',()=>{
 assert.equal(berlinTag('2026-09-04T22:30:00.000Z'),'2026-09-05','00:30 Uhr in Berlin ist in UTC noch der Vortag');
 assert.equal(berlinTag('2026-09-05T00:00:00.000Z'),'2026-09-05','reine Tage bleiben, wie die Quelle sie nennt');
 assert.equal(berlinTag('2026-10-14'),'2026-10-14');
 const nacht={updatedAt:'2026-09-04T22:30:00.000Z',publishedAt:'2026-09-05T00:00:00.000Z',firstSeen:'2026-09-05T08:00:00.000Z'};
 assert.equal(datumsteil(nacht,s=>datum(s)).eigenes,null,'kein doppeltes Datum auf der Karte');
 assert.equal(kartenDatum([{documentType:'Gesetzentwurf',publishedAt:null,updatedAt:'2026-09-12T22:30:00.000Z',firstSeen:'2026-09-01T00:00:00.000Z'}],'2026-09-12')?.wort,'nächster Termin','in Berlin schon der 13.');
 assert.ok(readFileSync('pages/index.tsx','utf8').includes('(!after||berlinTag(recency(i))>=after)'),'der Filter nach letzter Bewegung');
});

// Unter einem Themenfilter belegte die Themenkarte ihren Fund mit dem Zitat des ersten gespeicherten Themas.
// Live zeigten 69 von 143 gefilterten Karten einen Satz zu einem anderen Thema, unter "Halbleiter & EUV" 6 von 7.
test('Unter einem Themenfilter belegt die Karte das gewählte Thema',()=>{
 const ms=[{topic:'standort',snippet:'Energiepreise'},{topic:'dualuse',snippet:'Ausfuhrliste'},{topic:'laser',snippet:'Laser'}];
 assert.equal(themenReihenfolge(ms,'dualuse')[0].snippet,'Ausfuhrliste','das Zitat gehört zum Filter');
 assert.deepEqual(themenReihenfolge(ms,'dualuse').map(m=>m.topic),['dualuse','standort','laser'],'die übrigen behalten ihre Reihenfolge');
 assert.deepEqual(themenReihenfolge(ms,'').map(m=>m.topic),['standort','dualuse','laser'],'ohne Filter unverändert');
 assert.deepEqual(themenReihenfolge(ms,'ki').map(m=>m.topic),['standort','dualuse','laser'],'ein fremdes Thema ändert nichts');
 assert.deepEqual(ms.map(m=>m.topic),['standort','dualuse','laser'],'der Bestand selbst wird nicht umsortiert');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes('const m=themenReihenfolge(topicsOf(item),thema);'),'die Karte');
 assert.equal((seite.match(/<TopicCard /g)??[]).length,(seite.match(/<TopicCard [^\n]*thema=\{topic\}/g)??[]).length,'jeder Aufruf reicht den Filter durch');
 assert.ok(seite.includes('themenReihenfolge(topicsOf(selected),topic).map('),'die Dokumentansicht ordnet gleich');
});

test('Der Quellenfilter bietet nur Dokumentquellen an, Typen stehen in deutscher Ordnung',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes("data.sources.filter(s=>s.kind!=='lobby').map(s=><option"),'das Lobbyregister liefert keine Dokumente');
 assert.ok(seite.includes(".sort((a,b)=>a.localeCompare(b,'de'))"),'„Änderungsantrag“ steht nicht hinter „Verordnung“');
 assert.deepEqual(['Verordnung','Änderungsantrag','Antrag'].sort((a,b)=>a.localeCompare(b,'de')),['Änderungsantrag','Antrag','Verordnung']);
});

// Ein Abruf mit Warnung speichert "partial". Die Quellenkarte kannte den Wert nicht und schrieb "Offen" - das die Seite
// als "wird noch nicht automatisch überwacht" erklärt. Nach einem Fehler nannte sie Zeitpunkt und Anzahl des letzten
// erfolgreichen Abrufs unbeschriftet bzw. "beim letzten Abruf".
test('Quellenkarten benennen Teilabrufe und Fehler richtig',()=>{
 assert.deepEqual(quellenStand({status:'partial'}),{label:'Teilweise abgerufen',klasse:'warning',vorsatz:'',abruf:'beim letzten Abruf'});
 assert.deepEqual(quellenStand({status:'error'}),{label:'Abruf fehlgeschlagen',klasse:'failure',vorsatz:'Zuletzt erfolgreich: ',abruf:'beim letzten erfolgreichen Abruf'});
 assert.equal(quellenStand({status:'ok'}).label,'Abruf erfolgreich');
 assert.equal(quellenStand({status:'manual'}).label,'Offen','nur nicht angebundene Quellen heißen offen');
 for(const status of ['ok','partial','error','pending','setup'])assert.notEqual(quellenStand({status}).label,'Offen',status);
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes("<span className={'badge '+quellenStand(s).klasse}>{quellenStand(s).label}</span>"),'das Abzeichen');
 assert.ok(seite.includes('${quellenStand(s).vorsatz}${date(s.checkedAt,true)}'),'der Zeitpunkt');
 assert.ok(seite.includes('${s.count} ${quellenStand(s).abruf}'),'die Anzahl');
 assert.match(readFileSync('src/ui/style.css','utf8'),/\.badge\.warning\{/,'das Warnabzeichen hat eine Gestaltung');
});

// Der Suchtext kannte nur Kurznamen. Live fand "Auswärtiger Ausschuss" keines seiner 9 Dokumente,
// "Wirtschaftsausschuss des Bundesrates" keines von 4, "Haushaltsausschuss" eines von 5.
test('Die Suche findet Gremien auch unter ihrem amtlichen Namen',()=>{
 const namen=gremienNamen({committees:['aa','br-wi','ha'],ministries:['bmf']});
 const t=suchtext(item({committees:['aa','br-wi','ha'],ministries:['bmf']}),namen);
 for(const q of ['auswärtiger ausschuss','wirtschaftsausschuss des bundesrates','haushaltsausschuss','bundesministerium der finanzen','auswärtiges','haushalt','bmf'])
  assert.ok(t.includes(q),q);
 assert.deepEqual(gremienNamen({committees:['gibt-es-nicht'],ministries:[]}),[],'Unbekanntes bleibt draußen');
 assert.ok(readFileSync('pages/index.tsx','utf8').includes('suchtext(i,gremienNamen(i))'),'die Dokumentliste sucht damit');
});


// Der Export schrieb nur "Datum:" mit dem Veröffentlichungstag, abweichend von der Karte. Er nutzt jetzt dieselben
// Datumszeilen wie die Dokumentansicht.
test('Der Export nennt dieselben Daten wie die Dokumentansicht',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 const start=seite.indexOf('async function exportGespeichert');
 const exp=seite.slice(start,seite.indexOf('\n',seite.indexOf('const eintrag=',start)));
 assert.ok(!exp.includes('`Datum: ${date(i.publishedAt)}`'),'kein unbeschriftetes Datum');
 assert.ok(exp.includes('...datumsZeilen(i).map(([k,v])=>`${k}: ${v}`)'),'dieselben Zeilen wie die Ansicht');
 // "Ausgangsstand · Unterrichtung · Unterrichtung": Karte und Ansicht lassen einen gleichnamigen Schritt weg, der Export auch.
 assert.ok(exp.includes("${i.step&&i.step!==i.documentType?' · '+i.step:''}"),'kein doppelter Verfahrensschritt');
 assert.ok(seite.includes(',...datumsZeilen(selected)].map('),'die Ansicht nutzt dieselbe Regel');
});

// Die Listen ordneten angekündigte Termine als "neueste" umgekehrt über alles: beim Rechtsausschuss fünf Anhörungen vom
// 14. Oktober abwärts, der nächste Termin am 23. September erst an fünfter Stelle, unter "Bewegungen der letzten 10 Tage".
test('Listen zeigen angekündigte Termine zuerst, den nächsten oben',()=>{
 const t=(id:string,tag:string)=>({id,documentType:'Ausschusstermin',publishedAt:`${tag}T00:00:00.000Z`,updatedAt:null,firstSeen:'2026-09-01T08:00:00.000Z'});
 const v=(id:string,stamp:string)=>({id,documentType:'Gesetzentwurf',publishedAt:'2026-08-01T00:00:00.000Z',updatedAt:stamp,firstSeen:'2026-09-01T08:00:00.000Z'});
 const liste=[v('alt','2026-09-09T10:00:00.000Z'),t('okt14','2026-10-14'),v('neu','2026-09-11T10:00:00.000Z'),t('sep23','2026-09-23'),t('gestern','2026-09-12'),t('heute','2026-09-13'),t('okt5','2026-10-05')];
 assert.deepEqual([...liste].sort(listenOrdnung('2026-09-13')).map(x=>x.id),['heute','sep23','okt5','okt14','gestern','neu','alt']);
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.equal((seite.match(/\.sort\(listenOrdnung\(today\(\)\)\)/g)??[]).length,3,'Thementreffer, alle Dokumente, Gremienliste');
 assert.ok(!seite.includes('.sort((a,b)=>recency(b).localeCompare(recency(a)))'));
 assert.equal((seite.match(/'Angekündigte Termine zuerst, dann nach letzter Bewegung':'Nach letzter Bewegung'/g)??[]).length,2,'die Überschriften sagen es');
});

// Der Lauf für 4d13daa (angelegt 09:49) begann erst nach dem für 96312ef und lieferte um 09:53 die ältere Oberfläche
// wieder aus. Beide meldeten Erfolg; live stand der alte Export, obwohl main den neuen enthielt.
test('Jeder Lauf baut den neuesten Code, mit den eigenen Daten',()=>{
 const yml=readFileSync('.github/workflows/monitor.yml','utf8');
 const pos=(name:string)=>{const i=yml.indexOf(`- name: ${name}\n`);assert.ok(i>=0,`Schritt fehlt: ${name}`);return i;};
 assert.ok(pos('Quellen abrufen')<pos('Neuesten Code holen'),'erst abrufen');
 assert.ok(pos('Neuen Stand sichern')<pos('Neuesten Code holen'),'dann sichern');
 assert.ok(pos('Neuesten Code holen')<pos('Seite bauen'),'dann den neuesten Code bauen');
 const schritt=yml.slice(pos('Neuesten Code holen'),pos('Seite bauen'));
 const reihe=['cp public/bootstrap.json "$RUNNER_TEMP/bootstrap-bau.json"','git fetch --quiet origin main','git reset --quiet --hard origin/main','cp "$RUNNER_TEMP/bootstrap-bau.json" public/bootstrap.json'];
 let zuletzt=-1;for(const z of reihe){const i=schritt.indexOf(z);assert.ok(i>zuletzt,`in dieser Reihenfolge: ${z}`);zuletzt=i;}
 assert.match(schritt,/if \[ "\$\(git hash-object package-lock\.json\)" != "\$pakete" \]; then npm ci; fi/,'geänderte Pakete werden installiert');
 assert.ok(!/^\s+if:/m.test(schritt),'der Schritt läuft immer, nicht nur bei neuen Daten');
 assert.ok(readFileSync('README.md','utf8').includes('**Immer der neueste Code.**'),'README');
});

// Sechs Akteure mit genau einer Stelle standen live als "1 Vollzeitstellen" da, darunter Schaeffler und Drees & Sommer.
test('Eine Vollzeitstelle steht in der Einzahl',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes("Vollzeitstelle{e.staffFte===1?'':'n'}"),'Einzahl bei genau 1');
 assert.ok(!seite.includes("toLocaleString('de-DE')} Vollzeitstellen"),'keine feste Mehrzahl');
});

// Vier Akteure-Karten zeigten live "und 1 weitere" - darunter der eigene TRUMPF-Eintrag ganz oben. "Vorhaben" ist sächlich.
// Dieselbe Art Fehler stand in drei Sätzen, die bei genau einem Dokument oder Akteur falsch geworden wären.
test('Zahlen vor Wörtern stimmen auch bei genau 1',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes("und {gesamt-4} weitere{gesamt-4===1?'s':''}"),'und 1 weiteres');
 assert.ok(seite.includes("Dokumenten ${relevant.length===1?'nennt':'nennen'} ein TRUMPF-Thema."),'1 von 128 Dokumenten nennt');
 assert.ok(seite.includes("{ohneGremium.length===1?'ist keinem dieser Gremien zugewiesen; es stammt aus':'sind keinem dieser Gremien zugewiesen; sie stammen aus'}"),'1 von 74 Dokumenten ist');
 assert.ok(seite.includes("{ohneGremium.length===1?'Es erscheint':'Sie erscheinen'}"));
 assert.ok(seite.includes("${s.count===1?'Akteur':'Akteure'} im Register"),'1 Akteur');
});

// "Die App bewertet nicht" - die Startseite hieß aber "Was TRUMPF betrifft.", direkt über "ohne Bewertung". Die Akteure-Seite
// deutete "Wo viele gleichzeitig arbeiten, bewegt sich etwas" und nannte "Wettbewerber", die das Register nicht ausweist.
test('Die Oberfläche beschreibt Funde, statt sie zu deuten',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 for(const wertend of ['Was TRUMPF betrifft','bewegt sich etwas','Wettbewerber'])assert.ok(!seite.includes(wertend),wertend);
 assert.ok(seite.includes('<h1>Wo TRUMPF-Themen vorkommen.</h1>'));
 assert.ok(seite.includes('registrierte Interessenvertreter nach eigener Angabe arbeiten'));
});
