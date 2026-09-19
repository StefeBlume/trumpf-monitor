import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {runMonitor,dashboard,pdfPruefen,veroeffentlichterStand,type PdfPruefer} from '../src/server/monitor';
import {resetDBForTests} from '../src/server/db';
import {pdfKopf} from '../src/server/connectors';
import {neueFassung,DATEN_ALTER_MS} from '../src/ui/fassung';
import {datumsWort,kartenDaten,datumsZeilen,spaeterErschienen,pdfAngabe,abrufLuecke,dauer,datum,TAKT} from '../src/ui/format';
import type {DocumentInput,Item,Source,Dashboard} from '../src/model';

// Aus dem echten Fall vom 16.09.: Antwort 21/7988, datiert 10.09., im DIP und als PDF ab 16.09., 07:51, in der App ab 11:08.
const antwort=(over:Partial<Item>={}):Item=>({externalId:'338999',title:'auf die Kleine Anfrage - Drucksache 21/7607 -',url:'https://dip.bundestag.de/drucksache/x/1',
 text:'',publishedAt:'2026-09-10T00:00:00.000Z',updatedAt:'2026-09-16T05:51:00.000Z',documentType:'Antwort',step:null,procedure:null,
 documentNumber:'21/7988',pdfUrl:'https://dserver.bundestag.de/btd/21/079/2107988.pdf',committees:[],lead:null,ministries:[],originator:null,topics:[],
 id:'a',sourceId:'dip-drucksachen',institution:'Bundestag',hash:'h',version:1,change:'new',firstSeen:'2026-09-16T09:08:00.000Z',
 lastSeen:'2026-09-16T09:08:00.000Z',changedAt:'2026-09-16T09:08:00.000Z',archived:false,...over});
const kurz=(s:string|null)=>datum(s);

test('Die Karte nennt, was welches Datum ist',()=>{
 const k=kartenDaten(antwort(),kurz);
 assert.equal(`${k.wort} ${k.gefuehrt}`,'im DIP 16. Sept. 2026','das führende Datum hat einen Namen');
 assert.equal(k.zusatz,'datiert 10. Sept. 2026','das Datum des Papiers heißt nicht "veröffentlicht"');
 // Weitere Quellen, jeweils mit ihren echten Feldern.
 const termin={documentType:'Ausschusstermin',sourceId:'bt-events',publishedAt:'2026-09-23T00:00:00.000Z',updatedAt:'2026-09-23T00:00:00.000Z',firstSeen:'2026-09-10T08:00:00.000Z'};
 assert.equal(datumsWort(termin),'Sitzung am');
 assert.equal(kartenDaten(termin,kurz).zusatz,null,'kein zweites Datum');
 const to={documentType:'Tagesordnung',sourceId:'bt-agenda',publishedAt:'2026-09-23T00:00:00.000Z',updatedAt:'2026-09-09T00:00:00.000Z',firstSeen:'2026-09-10T08:00:00.000Z'};
 assert.equal(datumsWort(to),'Tagesordnung vom');
 assert.equal(kartenDaten(to,kurz).zusatz,'Sitzung am 23. Sept. 2026');
 assert.equal(datumsWort({documentType:'Plenarprotokoll',sourceId:'dip-committees',publishedAt:'2026-09-10T00:00:00.000Z',updatedAt:'2026-09-10T00:00:00.000Z',firstSeen:'x'}),'Beratung am');
 assert.equal(datumsWort({documentType:'Gesetz',sourceId:'bmf-vorhaben',publishedAt:'2026-08-10T00:00:00.000Z',updatedAt:'2026-09-15T00:00:00.000Z',firstSeen:'x'}),'aktualisiert');
 assert.equal(datumsWort({documentType:'Behördenmeldung',sourceId:'bafa-aussenwirtschaft',publishedAt:'2026-09-14T00:00:00.000Z',updatedAt:'2026-09-14T00:00:00.000Z',firstSeen:'x'}),'veröffentlicht');
 assert.equal(datumsWort({documentType:'Behördenmeldung',sourceId:'bafa-aussenwirtschaft',publishedAt:null,updatedAt:null,firstSeen:'x'}),'erfasst');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(!seite.includes('Dokument vom')&&!seite.includes("'Veröffentlicht'"),'die alten, missverständlichen Wörter sind weg');
 assert.equal((seite.match(/const k=kartenDaten\(item\);/g)??[]).length,2,'beide Kartenarten');
 assert.equal((seite.match(/<span>\{k\.wort\} \{k\.gefuehrt\}<\/span>\{k\.zusatz&&/g)??[]).length,2);
});

test('Die Dokumentansicht trennt Datum, PDF, DIP und App',()=>{
 const zeilen=Object.fromEntries(datumsZeilen(antwort({pdf:{stand:'online',zeit:'2026-09-16T05:51:00.000Z',geprueft:'2026-09-16T09:10:00.000Z',url:'https://dserver.bundestag.de/btd/21/079/2107988.pdf'}})));
 assert.deepEqual(zeilen,{
  'Datum der Drucksache':'10. Sept. 2026',
  'Amtliches PDF':'Online, Zeitstempel des Servers 16.09.2026, 07:51 Uhr',
  'Zeitstempel im DIP':'16.09.2026, 07:51 Uhr',
  'In der App seit':'16.09.2026, 11:08 Uhr'});
 assert.ok(!datumsZeilen(antwort()).some(([k])=>/Veröffentlicht/.test(k)),'nichts heißt mehr "Veröffentlicht"');
 // Termine: kein erfundenes Änderungsdatum, wenn die Liste nur den Sitzungstag nennt.
 const termin=antwort({documentType:'Ausschusstermin',sourceId:'bt-events',documentNumber:null,pdfUrl:null,publishedAt:'2026-09-23T00:00:00.000Z',updatedAt:'2026-09-23T00:00:00.000Z'});
 assert.deepEqual(datumsZeilen(termin),[['Termin','23. Sept. 2026']]);
 const to=antwort({documentType:'Tagesordnung',sourceId:'bt-agenda',documentNumber:null,pdfUrl:null,publishedAt:'2026-09-23T00:00:00.000Z',updatedAt:'2026-09-09T00:00:00.000Z'});
 assert.deepEqual(datumsZeilen(to),[['Termin','23. Sept. 2026'],['Datum in der Tagesordnungsliste','09.09.2026']],'reine Tage ohne Uhrzeit');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes(',...datumsZeilen(selected)].map('),'die Ansicht nutzt die Zeilen');
 assert.ok(seite.includes('...datumsZeilen(i).map(([k,v])=>`${k}: ${v}`)'),'der Export dieselben');
});

test('Eine spät erschienene Drucksache erklärt sich selbst',()=>{
 const text=spaeterErschienen(antwort({pdf:{stand:'online',zeit:'2026-09-16T05:51:00.000Z',geprueft:'x',url:'https://dserver.bundestag.de/btd/21/079/2107988.pdf'}}))!;
 assert.ok(text.includes('Datiert ist die Drucksache auf den 10.09.2026.'),text);
 assert.ok(text.includes('nicht der Tag seiner Veröffentlichung'),text);
 assert.ok(text.includes('den Zeitstempel 16.09.2026, 07:51 Uhr, das amtliche PDF den Zeitstempel 16.09.2026, 07:51 Uhr'),text);
 assert.ok(text.includes('in der App steht er seit 16.09.2026, 11:08 Uhr'),text);
 assert.ok(!spaeterErschienen(antwort())!.includes('das amtliche PDF'),'ohne Befund keine Behauptung über das PDF');
 assert.equal(spaeterErschienen(antwort({updatedAt:'2026-09-10T14:00:00.000Z'})),null,'am selben Tag im DIP: nichts zu erklären');
 assert.equal(spaeterErschienen(antwort({sourceId:'bmf-vorhaben'})),null,'nur für das DIP');
 assert.equal(spaeterErschienen(antwort({documentType:'Tagesordnung'})),null,'nicht für Termine');
 assert.ok(readFileSync('pages/index.tsx','utf8').includes('<strong>Warum erst jetzt?</strong> {verspaetet}'));
});

test('Ein PDF, das noch fehlt, wird nicht als Link angeboten',()=>{
 const url='https://dserver.bundestag.de/btd/21/080/2108025.pdf';
 assert.equal(pdfAngabe({pdfUrl:null}),null);
 assert.deepEqual(pdfAngabe({pdfUrl:url}),{text:'Noch nicht geprüft',abrufbar:true});
 assert.deepEqual(pdfAngabe({pdfUrl:url,pdf:{stand:'fehlt',zeit:null,geprueft:'2026-09-16T09:10:00.000Z',url}}),{text:'Noch nicht abrufbar (geprüft 16.09.2026, 11:10 Uhr)',abrufbar:false});
 assert.deepEqual(pdfAngabe({pdfUrl:url,pdf:{stand:'fehlt',zeit:null,geprueft:'x',url:'https://dserver.bundestag.de/alt.pdf'}}),{text:'Noch nicht geprüft',abrufbar:true},'ein Befund zu einem anderen Link gilt nicht');
 assert.equal(pdfAngabe({pdfUrl:url,pdf:{stand:'online',zeit:null,geprueft:'x',url}})?.text,'Online, der Server nennt keinen Zeitstempel');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes("pdfZustand?.abrufbar===false?<span className=\"button secondary gesperrt\" aria-disabled=\"true\"><FileDown size={17}/>PDF noch nicht online</span>"));
});

// Reisst der Takt, soll man es sehen - nach Berliner Uhr, damit die Sommerzeit keine Rolle spielt.
test('Eine Abruflücke wird angezeigt, nachts nicht',()=>{
 const um=(s:string)=>Date.parse(s);
 assert.equal(abrufLuecke('2026-09-16T07:08:00.000Z',um('2026-09-16T09:07:00.000Z')),119,'11:07 Uhr im Sommer');
 assert.equal(abrufLuecke('2026-09-16T08:30:00.000Z',um('2026-09-16T09:07:00.000Z')),null,'37 Minuten sind im Rahmen');
 assert.equal(abrufLuecke('2026-09-16T19:00:00.000Z',um('2026-09-16T20:59:00.000Z')),119,'22:59 Uhr zählt noch');
 assert.equal(abrufLuecke('2026-09-16T19:00:00.000Z',um('2026-09-16T21:01:00.000Z')),null,'23:01 Uhr nicht mehr');
 assert.equal(abrufLuecke('2026-09-15T20:57:00.000Z',um('2026-09-16T04:30:00.000Z')),null,'06:30 Uhr, die erste Stunde läuft noch');
 assert.equal(abrufLuecke('2026-09-15T20:57:00.000Z',um('2026-09-16T05:30:00.000Z')),513,'07:30 Uhr');
 assert.equal(abrufLuecke('2026-12-15T20:00:00.000Z',um('2026-12-15T21:30:00.000Z')),90,'im Winter ist 21:30 UTC erst 22:30 Uhr');
 assert.equal(abrufLuecke(undefined),null);
 assert.equal(abrufLuecke('kaputt'),null);
 assert.equal(dauer(119),'119 Minuten');
 assert.equal(dauer(513),'8 Stunden');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes('const luecke=STATIC?abrufLuecke(lastCheck):null;'));
 assert.ok(seite.includes('<strong>Der letzte Abruf liegt {dauer(luecke)} zurück.</strong>'));
 assert.ok(!seite.includes('GitHub führt geplante Läufe aber nicht zuverlässig aus'),'der Hinweis beschreibt den Taktgeber');
});

// GitHub fuehrte vom 16. bis 18.09. von rund 102 geplanten Laeufen am Tag 2 bis 5 aus. Direkt angestossene Laeufe starten sofort.
test('Ein Taktgeber stößt den Abruf alle 10 Minuten an und reicht sich selbst weiter',()=>{
 const takt=readFileSync('.github/workflows/takt.yml','utf8');
 assert.match(takt,/^\s+environment: takt$/m,'die Wartezeit kommt aus der Umgebung "takt", ohne Rechenzeit');
 assert.match(takt,/^\s+actions: write$/m,'darf Läufe anstoßen');
 assert.ok(takt.includes('gh workflow run monitor.yml --ref main'),'stößt den Abruf an');
 assert.ok(takt.includes('gh workflow run takt.yml --ref main'),'und den nächsten Takt');
 assert.ok(takt.includes(`stunde=$(TZ=Europe/Berlin date +%-H)`)&&takt.includes('if [ "$stunde" -ge 6 ] && [ "$stunde" -le 22 ]'),'nach Berliner Uhr, 06:00 bis 22:59');
 const weiter=takt.slice(takt.indexOf('- name: Nächsten Takt anstoßen'));
 assert.ok(weiter.includes('if: always()'),'die Kette reißt nicht, wenn der Abruf nicht angestoßen werden konnte');
 assert.ok(weiter.includes('select(.databaseId != ${GITHUB_RUN_ID}'),'wartet schon ein Takt, entsteht keine zweite Kette');
 assert.match(takt,/concurrency:\n  group: takt\n  cancel-in-progress: false/);
 const monitor=readFileSync('.github/workflows/monitor.yml','utf8');
 const pruef=monitor.indexOf('- name: Taktgeber sicherstellen'),abruf=monitor.indexOf('- name: Quellen abrufen');
 assert.ok(pruef>0&&pruef<abruf,'jeder Abruf belebt eine gerissene Kette');
 assert.match(monitor,/^\s+actions: write$/m);
 assert.deepEqual(TAKT,{von:6,bis:22,minuten:10},'die Oberfläche kennt denselben Takt');
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes('Alle 10 Minuten · 06:00–23:00 Uhr Berliner Zeit, über den Taktgeber'),'Betriebsstatus');
 assert.ok(seite.includes('alle 10 Minuten ab und veröffentlicht den neuen Stand hier, von 06:00 bis 23:00 Uhr Berliner Zeit'),'Einstellungen');
 assert.ok(!seite.includes('30 Minuten')&&!seite.includes('06:07'),'keine alte Angabe');
 const readme=readFileSync('README.md','utf8');
 assert.ok(readme.includes('**Taktgeber.**')&&readme.includes('von 06:00 bis 23:00 Uhr Berliner Zeit'),'README');
});

const quelle:Source={id:'dip-drucksachen',name:'V',institution:'Bundestag',url:'https://dip.bundestag.de/',kind:'fulltext-dip',note:'Fixture'};
const eingang=(over:Partial<DocumentInput>={}):DocumentInput=>({externalId:'338999',title:'auf die Kleine Anfrage',url:'https://dip.bundestag.de/drucksache/x/1',text:'',
 publishedAt:'2026-09-10T00:00:00.000Z',updatedAt:new Date(Date.now()-3600000).toISOString(),documentType:'Antwort',step:null,procedure:null,documentNumber:'21/7988',
 paperKey:'BT-Drucksache 21/7988',pdfUrl:'https://dserver.bundestag.de/btd/21/079/2107988.pdf',committees:[],lead:null,ministries:['bmwe'],originator:null,
 topics:[{topic:'ki',terms:['ki'],count:1,inTitle:false,snippet:'…'}],...over});

// Das DIP fuehrte die Antworten 21/8016 bis 21/8026, bevor ihr PDF abrufbar war.
test('Jedes PDF wird geprüft, bis es abrufbar ist; der erste Zeitstempel bleibt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-pdf-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const fragen:string[]=[];let antwortVomServer:{stand:'online'|'fehlt';zeit:string|null}|null={stand:'fehlt',zeit:null};
 const pruefer:PdfPruefer=async url=>{fragen.push(url);return antwortVomServer;};
 try{
  await runMonitor({sources:[quelle],fetcher:async()=>[eingang()],pdfPruefer:pruefer});
  let i=(await dashboard()).items[0];
  assert.equal(i.pdf?.stand,'fehlt');
  assert.equal(fragen.length,1);
  // Nicht erreichbar: kein Befund, der alte bleibt, und beim naechsten Lauf wird wieder gefragt.
  antwortVomServer=null;
  await runMonitor({sources:[quelle],fetcher:async()=>[eingang()],pdfPruefer:pruefer});
  i=(await dashboard()).items[0];
  assert.equal(i.pdf?.stand,'fehlt','eine ausbleibende Antwort ändert nichts');
  assert.equal(fragen.length,2);
  antwortVomServer={stand:'online',zeit:'2026-09-16T05:51:00.000Z'};
  const lauf=await runMonitor({sources:[quelle],fetcher:async()=>[eingang()],pdfPruefer:pruefer});
  i=(await dashboard()).items[0];
  assert.deepEqual({stand:i.pdf?.stand,zeit:i.pdf?.zeit,url:i.pdf?.url},{stand:'online',zeit:'2026-09-16T05:51:00.000Z',url:eingang().pdfUrl});
  assert.equal(lauf?.items.length,0,'der Befund ist keine Änderung des Dokuments');
  assert.equal(i.version,1);
  // Abrufbar: nicht mehr fragen, und der Zeitstempel bleibt, auch wenn das PDF spaeter ersetzt wird.
  antwortVomServer={stand:'online',zeit:'2026-09-18T10:00:00.000Z'};
  await runMonitor({sources:[quelle],fetcher:async()=>[eingang()],pdfPruefer:pruefer});
  i=(await dashboard()).items[0];
  assert.equal(fragen.length,3,'ein abrufbares PDF wird nicht erneut geprüft');
  assert.equal(i.pdf?.zeit,'2026-09-16T05:51:00.000Z','der Befund übersteht das Neuschreiben beim Eingang');
  // Ein neuer Link wird neu geprueft.
  await runMonitor({sources:[quelle],fetcher:async()=>[eingang({pdfUrl:'https://dserver.bundestag.de/btd/21/079/2107988-neu.pdf'})],pdfPruefer:pruefer});
  i=(await dashboard()).items[0];
  assert.equal(fragen.at(-1),'https://dserver.bundestag.de/btd/21/079/2107988-neu.pdf');
  assert.equal(i.pdf?.zeit,'2026-09-18T10:00:00.000Z');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}
});

test('Geprüft werden die neuesten zuerst, höchstens so viele wie erlaubt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-pdf2-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 try{
  const {db}=await import('../src/server/db');const c=await db();
  await c.batch(['alt','mitte','neu','ohne'].map((id,k)=>({sql:'INSERT INTO items(id,source_id,data) VALUES(?,?,?)',
   args:[id,'dip-drucksachen',JSON.stringify(antwort({id,firstSeen:`2026-09-1${k}T08:00:00.000Z`,pdfUrl:id==='ohne'?null:`https://dserver.bundestag.de/${id}.pdf`}))]})),'write');
  const fragen:string[]=[];
  assert.equal(await pdfPruefen(async url=>{fragen.push(url);return {stand:'online',zeit:null};},2),2);
  assert.deepEqual(fragen,['https://dserver.bundestag.de/neu.pdf','https://dserver.bundestag.de/mitte.pdf']);
  assert.equal(await pdfPruefen(async url=>{fragen.push(url);throw new Error('Netz');}),0,'ein Fehler beim Prüfen bricht nichts ab');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}
});

test('Die PDF-Prüfung fragt nur amtliche Adressen',async()=>{
 assert.equal(await pdfKopf('https://attacker.example/x.pdf'),null);
 assert.equal(await pdfKopf('http://dserver.bundestag.de/x.pdf'),null,'nur HTTPS');
 const monitor=readFileSync('src/server/monitor.ts','utf8');
 assert.ok(monitor.includes('const pruefer=options.pdfPruefer??(options.fetcher?undefined:pdfKopf);'),'Tests mit eigenen Daten fragen nicht im Netz');
});

// Briefings und Aenderungslog machten ein Fuenftel von bootstrap.json aus; gezeigt wird nur die Zusammenfassung des letzten Laufs.
test('Veröffentlicht wird nur, was die Seite zeigt',()=>{
 const b=(id:string)=>({id,createdAt:'2026-09-16T09:08:00.000Z',day:'2026-09-16',baseline:false,summary:'S '+id,items:[antwort()],coverage:{ok:7,failed:0,manual:0},errors:[]});
 const d:Dashboard={items:[antwort()],sources:[],briefings:[b('neu'),b('alt')],events:[{id:'e',itemId:'a',title:'t',at:'x',change:'new',sourceId:'s',version:1}],lobby:[],serverTime:'x',scheduleEnabled:true};
 const v=veroeffentlichterStand(d);
 assert.deepEqual(v.briefings.map(x=>[x.summary,x.items.length]),[['S neu',0]]);
 assert.deepEqual(v.events,[]);
 assert.equal(v.items.length,1,'die Dokumente bleiben vollständig');
 assert.equal(d.briefings.length,2,'der Stand der Datenbank bleibt unberührt');
 assert.ok(readFileSync('scripts/monitor.ts','utf8').includes('JSON.stringify(veroeffentlichterStand(data))'));
});

// Auf dem Handy scrollt die ganze Seite. Zurueckgesetzt wurde nur der Inhaltsbereich: ein Dokument oeffnete sich unten.
test('Ein Dokument öffnet sich oben, und zurück geht es an dieselbe Stelle',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 // Der PDF-Knopf steht unter dem Titel, vor den Reitern - nicht unten im Kasten, wo lange Titel ihn aus dem Bild schoben.
 const kopf=seite.indexOf('<div className="detail-aktionen">'),reiter=seite.indexOf('<div className="detail-tabs">');
 assert.ok(kopf>0&&kopf<reiter,'Aktionen vor den Reitern');
 assert.ok(seite.slice(kopf,reiter).includes('Amtliches PDF öffnen')&&seite.slice(kopf,reiter).includes('merkenUmschalten(selected)'),'PDF und Speichern nebeneinander');
 assert.equal((seite.match(/Amtliches PDF öffnen/g)??[]).length,1,'nur ein PDF-Knopf');
 assert.ok(readFileSync('src/ui/style.css','utf8').includes('@media(max-width:700px){.detail-heading{display:flex;flex-direction:column}.detail-heading .detail-aktionen{order:-1;margin:0 0 18px}}'),'auf dem Handy über dem Titel, unabhängig von seiner Länge');
 assert.ok(seite.includes('const scrollen=(y:number)=>{window.scrollTo(0,y);mainRef.current?.scrollTo(0,y);};'),'Seite und Inhaltsbereich');
 assert.ok(seite.includes("useVorDemZeichnen(()=>{if(selected){setTab('detail');setVersions(null);}const y=selected?0:listenPosition.current;scrollen(y);const nachZeichnen=requestAnimationFrame(()=>scrollen(y));"),'vor dem Zeichnen und noch einmal danach');
 assert.ok(seite.includes("const useVorDemZeichnen=typeof window==='undefined'?useEffect:useLayoutEffect;"),'beim Vorrendern ohne Layout-Effekt');
 assert.ok(seite.includes('listenPosition.current=Math.max(window.scrollY,mainRef.current?.scrollTop??0);setSelected(i);'));
 assert.ok(!/mainRef\.current\?\.scrollTo\(0,0\)/.test(seite),'kein Zurücksetzen nur des Inhaltsbereichs');
 assert.equal((seite.match(/onClick=\{\(\)=>setSelected\((?!null\))/g)??[]).length,0,'Listen öffnen über oeffnen(), nur Zurück setzt direkt');
 for(const aufruf of ['onClick={()=>oeffnen(i)}','onClick={()=>oeffnen(item)}','onClick={()=>oeffnen(e.item)}'])assert.ok(seite.includes(aufruf),aufruf);
});

// Am 16.09. oeffnete die App Thementreffer auf dem Handy weiter unten, obwohl die Korrektur live war; im iOS-Safari des
// Simulators oeffnete dieselbe Seite oben (Position 0 aus 939, 2310 und 3501 px). Eine App auf dem Home-Bildschirm laeuft
// stundenlang mit dem Code, mit dem sie geoeffnet wurde.
test('Eine neue Fassung wird erkannt, die eigene nicht',()=>{
 assert.equal(neueFassung('150798c0c5fb',{build:'2a4b6c8d0e1f'}),'2a4b6c8d0e1f');
 assert.equal(neueFassung('150798c0c5fb',{build:'150798c0c5fb'}),null,'dieselbe Fassung');
 assert.equal(neueFassung('',{build:'2a4b6c8d0e1f'}),null,'ohne eigene Kennung (lokaler Betrieb) nie');
 for(const kaputt of [null,'text',{},{build:''},{build:42},{build:'../../böse'},{build:'<script>'}])assert.equal(neueFassung('150798c0c5fb',kaputt),null,JSON.stringify(kaputt));
 assert.equal(DATEN_ALTER_MS,300000);
});

test('Die Seite lädt neue Fassung und neuen Stand, aber nie mitten im Lesen',()=>{
 const seite=readFileSync('pages/index.tsx','utf8');
 assert.ok(seite.includes('if(!STATIC||!BUILD||offenesDokument.current)return;'),'nicht bei offenem Dokument');
 assert.ok(seite.includes("fetch(`${BASIS}/version.json?t=${Date.now()}`,{cache:'no-store'})"),'am Zwischenspeicher vorbei');
 assert.ok(seite.includes("if(neu&&sessionStorage.getItem('policy-fassung')!==neu){sessionStorage.setItem('policy-fassung',neu);window.location.replace(`${BASIS}/?v=${neu}`);}"),'einmal je Fassung, mit neuer Adresse');
 assert.ok(seite.includes("document.addEventListener('visibilitychange',sichtbar);window.addEventListener('pageshow',sichtbar);"),'bei Rückkehr in die App');
 assert.ok(seite.includes('if(Date.now()-geladenUm.current>DATEN_ALTER_MS)void loadSnapshot()'),'der Stand wird nach fünf Minuten neu geholt');
 assert.ok(seite.includes('if(STATIC){void fassungPruefen();'),'auch beim Start');
 const yml=readFileSync('.github/workflows/monitor.yml','utf8');
 assert.ok(yml.includes("export NEXT_PUBLIC_BUILD=$(git ls-files -s -- . ':(exclude)public/bootstrap.json' | git hash-object --stdin | cut -c1-12)"),'Fingerabdruck des Codes ohne Datenstand');
 assert.ok(yml.includes(`printf '{"build":"%s"}' "$NEXT_PUBLIC_BUILD" > out/version.json`),'die veröffentlichte Fassung');
 const bau=yml.indexOf('export NEXT_PUBLIC_BUILD'),npm=yml.indexOf('npm run build:pages',bau);
 assert.ok(bau>0&&npm>bau,'die Kennung steht vor dem Bau fest');
});
