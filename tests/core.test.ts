import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {parseFeed,contentHash,officialURL,germanDate,parseCommitteeEvents,parseAgendaTable} from '../src/server/parsing';
import {mapCommitteePosition,mapFulltextDrucksache,matchCommitteeName,lookbackStart} from '../src/server/connectors';
import {berlinClock,runMonitor,dashboard,history,briefingSummary,seedFromSnapshot} from '../src/server/monitor';
import {resetDBForTests} from '../src/server/db';import {COMMITTEES,MINISTRIES,type DocumentInput,type Item,type Source} from '../src/model';
const doc:DocumentInput={externalId:'1',title:'Gesetz zur Änderung des Außenwirtschaftsgesetzes',url:'https://www.bundestag.de/test',text:'',publishedAt:null,updatedAt:null,documentType:'Gesetzentwurf',step:'Gesetzentwurf',procedure:'Gesetzgebung',documentNumber:'21/1234',pdfUrl:null,committees:['we'],lead:'we',ministries:[],originator:'Bundesregierung',topics:[]};
// Aus einer echten DIP-Vorgangsposition gekürzt.
const position={id:'698164',vorgangsposition:'Unterrichtung',vorgangstyp:'EU-Vorlage',titel:'Vorschlag für eine Verordnung',vorgang_id:'338133',datum:'2026-08-04',
 aktualisiert:'2026-09-05T10:39:50+02:00',
 ueberweisung:[{ausschuss:'Ausschuss für Wirtschaft und Energie',ausschuss_kuerzel:'AfWE',federfuehrung:true},{ausschuss:'Verkehrsausschuss',ausschuss_kuerzel:'VerkA',federfuehrung:false},{ausschuss:'Finanzausschuss',ausschuss_kuerzel:'FinanzA',federfuehrung:false}],
 fundstelle:{dokumentnummer:'426/26',drucksachetyp:'Unterrichtung',urheber:['Europäische Kommission'],pdf_url:'https://dserver.bundestag.de/brd/2026/0426-26.pdf'}};

test('RSS removes executable markup and preserves explicit dates',()=>{const r=parseFeed('<rss><channel><item><title>Dual-Use</title><link>https://www.bundestag.de/test</link><description><![CDATA[<b>Exportkontrolle</b>]]></description><pubDate>Mon, 07 Sep 2026 08:00:00 GMT</pubDate></item></channel></rss>',doc.url);assert.equal(r[0].text,'Exportkontrolle');assert.equal(r[0].publishedAt,'2026-09-07T08:00:00.000Z');});
test('Atom handles alternate links and absent publication dates honestly',()=>{const r=parseFeed('<feed><entry><id>abc</id><title>A</title><link rel="self" href="https://www.bundestag.de/meta"/><link rel="alternate" href="https://www.bundestag.de/a"/><updated>2026-09-07</updated></entry></feed>',doc.url);assert.equal(r[0].url,'https://www.bundestag.de/a');assert.equal(r[0].publishedAt,null);});
test('Rejects HTML responses and XML entities',()=>{assert.throws(()=>parseFeed('<html>error</html>',doc.url));assert.throws(()=>parseFeed('<!DOCTYPE x><rss><channel/></rss>',doc.url));});
test('URL allowlist blocks private addresses, credentials and lookalike domains',()=>{assert.equal(officialURL('https://dserver.bundestag.de/btd/21/078/2107868.pdf'),true);for(const s of ['http://www.bundestag.de','https://bundestag.de.attacker.com','https://localhost/','https://127.0.0.1/','https://me@www.bundestag.de/a'])assert.equal(officialURL(s),false);});

test('Kuratierte Auswahl bleibt eindeutig zuordenbar',()=>{
 const kuerzel=COMMITTEES.flatMap(c=>c.kuerzel);assert.equal(kuerzel.length,new Set(kuerzel).size);
 assert.equal(COMMITTEES.length,new Set(COMMITTEES.map(c=>c.id)).size);
 // Kollision zwischen Ausschuss- und Ressort-Ids würde die Filter in der Oberfläche verschmelzen.
 for(const m of MINISTRIES)assert.ok(!COMMITTEES.some(c=>c.id===m.id),`Id-Kollision: ${m.id}`);
 // Termin-Pfade muessen eindeutig sein, sonst zeigen zwei Ausschuesse dieselbe Liste.
 const events=COMMITTEES.map(c=>c.events).filter(Boolean);
 assert.equal(events.length,new Set(events).size);
});
test('Überweisung wird nur für ausgewählte Ausschüsse übernommen',()=>{
 const m=mapCommitteePosition(position)!;
 assert.equal(m.lead,'we');
 assert.deepEqual(m.committees,['we']);               // Verkehrsausschuss nicht ausgewählt; Finanzausschuss nur federführend
 assert.equal(m.documentNumber,'426/26');
 assert.equal(m.pdfUrl,'https://dserver.bundestag.de/brd/2026/0426-26.pdf');
 assert.equal(m.step,'Unterrichtung');
 // Ein im Mai veroeffentlichtes Papier, das im September neu ueberwiesen wird, ist eine aktuelle
 // Bewegung. Ohne aktualisiert wuerde es hinter monatealtem Material einsortiert.
 assert.equal(m.publishedAt?.slice(0,10),'2026-08-04');
 assert.equal(m.updatedAt?.slice(0,10),'2026-09-05');
 assert.equal(mapCommitteePosition({...position,ueberweisung:[{ausschuss_kuerzel:'VerkA',federfuehrung:true}]}),null);
 // Querschnittsausschüsse zählen nur federführend, sonst schlägt Routine-Mitberatung als Treffer durch.
 assert.equal(mapCommitteePosition({...position,ueberweisung:[{ausschuss_kuerzel:'Wi',federfuehrung:false}]}),null);
 assert.deepEqual(mapCommitteePosition({...position,ueberweisung:[{ausschuss_kuerzel:'Wi',federfuehrung:true}]})!.committees,['br-wi']);
 assert.equal(mapCommitteePosition({...position,ueberweisung:[]}),null);
});
test('Fremde PDF-Adressen werden nicht als amtliche Quelle ausgegeben',()=>{
 assert.equal(mapCommitteePosition({...position,fundstelle:{...position.fundstelle,pdf_url:'https://attacker.example/x.pdf'}})!.pdfUrl,null);
});
test('Ressorts werden über das amtliche Urheberfeld erkannt, nicht über den Titel',()=>{
 const hit=mapFulltextDrucksache({id:'9',titel:'Verordnung',datum:'2026-09-01',drucksachetyp:'Verordnung',dokumentnummer:'21/9',fundstelle:{urheber:['Bundesministerium für Wirtschaft und Energie']}})!;
 assert.deepEqual(hit.ministries,['bmwe']);
 // Der Titel allein macht kein Ressort: entscheidend ist das amtliche Urheberfeld.
 assert.equal(mapFulltextDrucksache({id:'9',titel:'Bericht des Bundesministeriums für Wirtschaft und Energie',fundstelle:{urheber:['Fraktion der AfD']}}),null);
 assert.equal(mapFulltextDrucksache({id:'9',titel:'X',fundstelle:{urheber:['Bundesministerium für Gesundheit']}}),null);
 // Ohne Ressortbezug entscheidet der Volltext: ein Dual-Use-Bezug steht selten im Titel.
 const volltext=mapFulltextDrucksache({id:'10',titel:'Entwurf eines Gesetzes',fundstelle:{urheber:['Fraktion der AfD']},
  text:'Die Ausfuhrkontrolle für Güter mit doppeltem Verwendungszweck wird angepasst.'})!;
 assert.deepEqual(volltext.topics.map(t=>t.topic),['dualuse']);
 assert.equal(volltext.ministries.length,0);
});
test('Tagesordnungen werden nur für ausgewählte Ausschüsse übernommen',()=>{
 // Kurzbezeichnung der Spalte gegen den langen amtlichen Namen.
 assert.equal(matchCommitteeName('Verteidigung'),'vt');
 assert.equal(matchCommitteeName('Finanzen'),'fi');
 assert.equal(matchCommitteeName('Wirtschaft, Energie'),'we');
 assert.equal(matchCommitteeName('Umwelt, Klimaschutz, Naturschutz, Nukleare Sicherheit'),'um');
 for(const off of ['Inneres','Verkehr','Gesundheit','Tourismus','Landwirtschaft, Ernährung, Heimat',''])
 assert.equal(matchCommitteeName(off),null,`${off} ist nicht ausgewählt`);
});
test('Deutsche Datumsangaben werden geparst, nie geraten',()=>{
 assert.equal(germanDate('8. September 2026')?.slice(0,10),'2026-09-08');
 assert.equal(germanDate(' 17. Dezember 2025 ')?.slice(0,10),'2025-12-17');
 for(const bad of ['September 2026','8. Smarch 2026','','demnächst'])assert.equal(germanDate(bad),null);
});
// Aus der amtlichen Anhoerungsliste des Wirtschaftsausschusses gekuerzt.
test('Anhörungsliste liefert Datum, Titel und Permalink',()=>{
 const rows=parseCommitteeEvents(`<div class="bt-listenteaser"><h3>September 2026</h3><h4>8. September 2026</h4>
  <ul class="bt-linkliste"><li><a title="Anhörung zum Wärmeplanungsgesetz" href="https://www.bundestag.de/ausschuesse/a09_wirtschaft/wp21_a09_Anhoerungen/1205008-1205008">Anhörung zum Wärmeplanungsgesetz</a></li></ul>
  <h4>22. Juni 2026</h4><ul class="bt-linkliste"><li><a href="https://www.bundestag.de/x">Scharfe Kritik</a></li><li><a href="https://www.bundestag.de/y">Vorrang für Freileitungen</a></li></ul></div>`,'https://www.bundestag.de/');
 assert.equal(rows.length,3);
 assert.equal(rows[0].title,'Anhörung zum Wärmeplanungsgesetz');
 assert.equal(rows[0].date?.slice(0,10),'2026-09-08');
 // Jeder Termin behaelt das Datum seiner eigenen h4-Gruppe.
 assert.equal(rows[2].date?.slice(0,10),'2026-06-22');
 assert.deepEqual(parseCommitteeEvents('<div class="bt-listenteaser"></div>','https://www.bundestag.de/'),[]);
});
test('Tagesordnungstabelle liefert Ausschussspalte und PDF',()=>{
 // Vierspaltige Zeile im Template-Wrapper, genau wie die amtliche Antwort sie liefert.
 const rows=parseAgendaTable(`<template data-js-document-results="table"><tr><td>9. September 2026</td><td>Verteidigung</td><td><a href="https://www.bundestag.de/resource/blob/1/to.pdf">Tagesordnung für die 33. Sitzung</a></td><td>Tagesordnung</td></tr>
  <tr><td>nur zwei</td><td>Spalten</td></tr></template>`,'https://www.bundestag.de/');
 assert.equal(rows.length,1);
 assert.equal(rows[0].committee,'Verteidigung');
 assert.equal(rows[0].date?.slice(0,10),'2026-09-09');
 assert.ok(rows[0].url.endsWith('.pdf'));
});
test('Abruffenster überlappt den letzten Lauf und reicht höchstens 30 Tage zurück',()=>{
 const recent=lookbackStart(new Date(Date.now()-3600000).toISOString());
 assert.ok(Date.now()-Date.parse(recent)>=2*86400000-3600000,'zwei Tage Überlappung fehlen');
 assert.ok(Date.now()-Date.parse(lookbackStart(new Date('2020-01-01').toISOString()))<=30*86400000+1000);
 assert.doesNotThrow(()=>new Date(lookbackStart(undefined)).toISOString());
});
test('Metadata changes produce a new hash; whitespace does not',()=>{assert.equal(contentHash(doc),contentHash({...doc,title:'Gesetz zur  Änderung des Außenwirtschaftsgesetzes'}));assert.notEqual(contentHash(doc),contentHash({...doc,step:'Beschlussempfehlung und Bericht'}));assert.notEqual(contentHash(doc),contentHash({...doc,committees:['we','fi']}));
 // updatedAt darf den Hash nicht beeinflussen: DIP setzt aktualisiert auch ohne inhaltliche
 // Aenderung neu, sonst gaelte jedes Dokument dauerhaft als "Geaendert".
 assert.equal(contentHash(doc),contentHash({...doc,updatedAt:'2026-09-08T12:00:00.000Z'}));});
test('Zusammenfassung nennt Zahlen und Gremien, aber keine Relevanz',()=>{
 const item=(c:string[],change:string)=>({...doc,committees:c,change}) as unknown as Item;
 const s=briefingSummary([item(['we'],'new'),item(['fi'],'changed')],false,4,0,0);
 assert.match(s,/2 neue oder geänderte Dokumente/);assert.match(s,/Wirtschaft und Energie/);
 assert.doesNotMatch(s,/relevant|Relevanz|Priorität/i);
 assert.match(briefingSummary([],false,4,0,0),/Keine neuen oder geänderten Dokumente/);
 assert.match(briefingSummary([],false,0,4,0),/Keine belastbare Aussage/);
});
test('06:00 Berlin handles summer and winter offsets',()=>{assert.equal(berlinClock(new Date('2026-07-10T04:00:00Z')).hour,6);assert.equal(berlinClock(new Date('2026-01-10T05:00:00Z')).hour,6);assert.equal(berlinClock(new Date('2026-07-10T05:00:00Z')).hour,7);});
test('Persistent runs distinguish baseline, unchanged, new, changed and source failure',async()=>{const dir=mkdtempSync(join(tmpdir(),'policy-test-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');const source:Source={id:'test',name:'Test',institution:'Test',url:doc.url,kind:'committee-dip',note:'Fixture'};try{
 const first=await runMonitor({sources:[source],fetcher:async()=>[doc]});assert.equal(first?.items[0].change,'baseline');
 const second=await runMonitor({sources:[source],fetcher:async()=>[doc]});assert.equal(second?.items.length,0);
 const third=await runMonitor({sources:[source],fetcher:async()=>[{...doc,step:'Beschlussempfehlung und Bericht'},{...doc,externalId:'2',title:'Forschungszulage',documentNumber:'21/5678',committees:['ftr'],lead:'ftr'}]});
 assert.equal(third?.items.find(i=>i.externalId==='1')?.change,'changed');assert.equal(third?.items.find(i=>i.externalId==='2')?.change,'new');
 const d=await dashboard();const h=await history(d.items.find(i=>i.externalId==='1')!.id);assert.equal(h.versions.length,2);assert.ok(h.diff.some(p=>p.added));
 const failure=await runMonitor({sources:[source],fetcher:async()=>{throw new Error('offline');}});assert.equal(failure?.coverage.failed,1);assert.match(failure!.summary,/Keine belastbare Aussage/);assert.equal((await dashboard()).items.length,2);
 assert.equal((await dashboard()).briefings.find(b=>b.id===first!.id)?.items[0].version,1);
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});
test('Ein leeres Ergebnis wird als geprüft gewertet, nicht als Fehler',async()=>{const dir=mkdtempSync(join(tmpdir(),'policy-empty-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');const source:Source={id:'dip-committees',name:'Leer',institution:'Test',url:doc.url,kind:'committee-dip',note:'Fixture'};try{
 const run=await runMonitor({sources:[source],fetcher:async()=>[]});
 assert.equal(run?.coverage.ok,1);assert.equal(run?.coverage.failed,0);
 assert.match(run!.summary,/Keine neuen oder geänderten Dokumente/);
 assert.equal((await dashboard()).sources.find(s=>s.id==='dip-committees')?.status,'ok');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

test('Ohne Datenbank stellt der veröffentlichte Stand die bekannten Dokumente wieder her',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-seed-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const source:Source={id:'dip-committees',name:'Test',institution:'Test',url:doc.url,kind:'committee-dip',note:'Fixture'};
 try{
 const first=await runMonitor({sources:[source],fetcher:async()=>[doc]});
 const snapshot=await dashboard();
 assert.equal(first?.items[0].change,'baseline');
 // Zwischenspeicher verloren: frische Datenbank, aber der veröffentlichte Stand ist noch da.
 await resetDBForTests();rmSync(join(dir,'test.db'),{force:true});
 assert.equal(await seedFromSnapshot(snapshot),1);
 const second=await runMonitor({sources:[source],fetcher:async()=>[doc]});
 assert.equal(second?.items.length,0,'bekanntes Dokument darf nicht erneut als neu gelten');
 // Nach dem Wiederaufbau muss die naechste Aenderung wieder vergleichbar sein.
 await runMonitor({sources:[source],fetcher:async()=>[{...doc,step:'Beschlussempfehlung und Bericht'}]});
 const d2=await dashboard();
 const h=await history(d2.items[0].id);
 assert.equal(h.versions.length,2,'Wiederaufbau muss einen Vergleichsstand hinterlassen');
 assert.ok(h.diff.some(p=>p.added),'der Wortdiff muss die Änderung zeigen');
 // Ein zweiter Aufbau darf einen vorhandenen Bestand nicht überschreiben.
 assert.equal(await seedFromSnapshot(snapshot),0);
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

test('Jeder Lauf wird dokumentiert, Leerläufe ersetzen einander statt sich zu häufen',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-briefings-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const source:Source={id:'dip-committees',name:'Test',institution:'Test',url:doc.url,kind:'committee-dip',note:'Fixture'};
 try{
 await runMonitor({sources:[source],fetcher:async()=>[doc]});
 assert.equal((await dashboard()).briefings.length,1,'Erstlauf wird dokumentiert');
 for(let i=0;i<3;i++)await runMonitor({sources:[source],fetcher:async()=>[doc]});
 const ruhig=(await dashboard()).briefings;
 assert.equal(ruhig.length,2,'ein Änderungslauf plus genau ein aktueller Leerlauf');
 // Der Kopf des Lagebilds muss den juengsten Lauf zeigen, nicht die letzte Meldung.
 assert.equal(ruhig[0].items.length,0);
 assert.match(ruhig[0].summary,/Keine neuen oder geänderten Dokumente/);
 await runMonitor({sources:[source],fetcher:async()=>[{...doc,externalId:'2',title:'Neue Vorlage'}]});
 const nach=(await dashboard()).briefings;
 assert.equal(nach.length,3,'eine Änderung wird zusätzlich dokumentiert');
 assert.equal(nach[0].items.length,1,'der neueste Eintrag ist der Änderungslauf');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

// Der Fehler, der die Anhoerung zum Waermeplanungsgesetz unsichtbar machte: beim Lauf bekommen alle
// Treffer denselben changedAt, die Reihenfolge war damit praktisch zufaellig.
test('Liste ordnet nach Bewegung der Quelle, nicht nach dem eigenen Lauf',()=>{
 type Row={name:string;updatedAt:string|null;publishedAt:string|null;firstSeen:string;changedAt:string};
 const recency=(i:Row)=>i.updatedAt??i.publishedAt??i.firstSeen;
 const lauf='2026-09-08T07:10:34.000Z';
 const items:Row[]=[
 {name:'Mai-Unterrichtung',publishedAt:'2026-05-22T00:00:00.000Z',updatedAt:'2026-05-23T00:00:00.000Z',firstSeen:lauf,changedAt:lauf},
 {name:'Anhörung Wärmeplanungsgesetz',publishedAt:'2026-09-08T00:00:00.000Z',updatedAt:'2026-09-08T00:00:00.000Z',firstSeen:lauf,changedAt:lauf},
 {name:'BAFA ohne Datum',publishedAt:null,updatedAt:null,firstSeen:'2026-08-20T09:00:00.000Z',changedAt:lauf}
 ];
 const sorted=[...items].sort((a,b)=>recency(b).localeCompare(recency(a)));
 assert.equal(sorted[0].name,'Anhörung Wärmeplanungsgesetz','der heutige Termin muss oben stehen');
 assert.equal(sorted.at(-1)!.name,'Mai-Unterrichtung','das Mai-Papier gehoert nach unten');
 // Ohne Quellendatum zaehlt der Erstkontakt. Faellt hier changedAt ein, wuerde die Meldung bei
 // jedem Lauf nach oben springen und aktuelle Vorgaenge verdraengen.
 const ohneDatum=items[2];
 assert.equal(recency(ohneDatum),'2026-08-20T09:00:00.000Z');
 assert.notEqual(recency(ohneDatum),ohneDatum.changedAt);
});

// Nach einem Wiederaufbau folgen die Zeilen der Einfuegereihenfolge, nicht der Zeit. Ohne Sortierung
// zeigt die Briefing-Auswahl die Staende durcheinander.
test('Briefings und Änderungslog kommen chronologisch, auch nach Wiederaufbau',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-order-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const source:Source={id:'dip-committees',name:'T',institution:'T',url:doc.url,kind:'committee-dip',note:'Fixture'};
 try{
 await runMonitor({sources:[source],fetcher:async()=>[doc]});
 await runMonitor({sources:[source],fetcher:async()=>[{...doc,step:'Zweite Beratung'}]});
 const snapshot=await dashboard();
 await resetDBForTests();rmSync(join(dir,'test.db'),{force:true});
 await seedFromSnapshot({...snapshot,briefings:[...snapshot.briefings].reverse(),events:[...snapshot.events].reverse()});
 const nach=await dashboard();
 const zeiten=nach.briefings.map(b=>b.createdAt);
 assert.deepEqual(zeiten,[...zeiten].sort().reverse(),'Briefings müssen absteigend nach Zeit stehen');
 const log=nach.events.map(e=>e.at);
 assert.deepEqual(log,[...log].sort().reverse(),'das Änderungslog muss absteigend nach Zeit stehen');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

// Dieselbe Drucksache kommt als Ausschussueberweisung und aus der Volltextsuche. Zwei Zeilen fuer
// dasselbe Papier waren in der Oberflaeche sichtbar, und die Ausschusszeile kannte die Themen nicht.
test('Dieselbe Drucksache aus zwei Quellen wird zu einem Eintrag zusammengeführt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-merge-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const ausschuss:Source={id:'dip-committees',name:'A',institution:'Bundestag',url:doc.url,kind:'committee-dip',note:'Fixture'};
 const volltext:Source={id:'dip-drucksachen',name:'V',institution:'Bundestag',url:doc.url,kind:'fulltext-dip',note:'Fixture'};
 try{
 await runMonitor({sources:[ausschuss,volltext],fetcher:async(s)=>s.id==='dip-committees'
  ? [{...doc,externalId:'pos-1',documentNumber:'21/999',committees:['we'],lead:'we',topics:[]}]
  : [{...doc,externalId:'drs-1',documentNumber:'21/999',committees:[],lead:null,ministries:['bmwe'],
      topics:[{topic:'halbleiter',terms:['halbleiter'],count:7,inTitle:false,snippet:'… Halbleiter …'}]}]});
 const items=(await dashboard()).items;
 assert.equal(items.length,1,'das Papier darf nur einmal erscheinen');
 const i=items[0];
 assert.equal(i.sourceId,'dip-committees','die Ausschussquelle behält die Führung');
 assert.deepEqual(i.committees,['we'],'die Gremienzuordnung bleibt erhalten');
 assert.deepEqual(i.ministries,['bmwe'],'das Ressort der zweiten Quelle kommt dazu');
 assert.deepEqual(i.topics.map(t=>t.topic),['halbleiter'],'die Themen aus dem Volltext werden vererbt');
 // Ein zweiter Lauf darf die Dublette nicht wieder anlegen.
 await runMonitor({sources:[ausschuss,volltext],fetcher:async(s)=>s.id==='dip-committees'
  ? [{...doc,externalId:'pos-1',documentNumber:'21/999',committees:['we'],lead:'we',topics:[]}]
  : [{...doc,externalId:'drs-1',documentNumber:'21/999',committees:[],lead:null,ministries:['bmwe'],topics:[]}]});
 assert.equal((await dashboard()).items.length,1);
 // Auch zeitversetzt: liefert nur noch eine Quelle das Papier, bleibt es ein Eintrag.
 await runMonitor({sources:[volltext],fetcher:async()=>[{...doc,externalId:'drs-1',documentNumber:'21/999',
  committees:[],lead:null,ministries:['bmwe'],topics:[]}]});
 assert.equal((await dashboard()).items.length,1,'kein Wiederauftauchen der Dublette');
 // Die Dublette darf keine verwaisten Versionen oder Ereignisse hinterlassen.
 const {db}=await import('../src/server/db');const c=await db();
 const waisen=await c.execute("SELECT COUNT(*) n FROM versions WHERE item_id NOT IN (SELECT id FROM items)");
 assert.equal(Number(waisen.rows[0].n),0,'verwaiste Versionen');
 const waisenE=await c.execute("SELECT COUNT(*) n FROM events WHERE json_extract(data,'$.itemId') NOT IN (SELECT id FROM items)");
 assert.equal(Number(waisenE.rows[0].n),0,'verwaiste Ereignisse');
 // Verschiedene Drucksachennummern bleiben getrennt.
 await runMonitor({sources:[ausschuss],fetcher:async()=>[
  {...doc,externalId:'a',documentNumber:'21/111'},{...doc,externalId:'b',documentNumber:'21/222'}]});
 assert.equal((await dashboard()).items.length,3);
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

// Terminlisten liefern bei jedem Lauf dieselben alten Sitzungen. Ohne Eingangsfilter legte die App
// sie an, die Aufbewahrung loeschte sie, der naechste Lauf meldete sie erneut als "neu" - das
// Briefing zeigte dauerhaft dreistellige Zahlen, obwohl sich nichts bewegt hatte.
test('Was aelter als die Aufbewahrungsfrist ist, wird gar nicht erst angelegt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-churn-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const quelle:Source={id:'bt-events',name:'T',institution:'Bundestag',url:doc.url,kind:'committee-events',note:'Fixture'};
 const alt=new Date(Date.now()-40*86400000).toISOString();
 const frisch=new Date(Date.now()-2*86400000).toISOString();
 const termin=new Date(Date.now()+20*86400000).toISOString();
 // Eine Terminliste, wie sie die Quelle unveraendert bei jedem Lauf liefert.
 const liste=async()=>[
  {...doc,externalId:'alt',documentNumber:null,publishedAt:alt,updatedAt:alt},
  {...doc,externalId:'frisch',documentNumber:null,publishedAt:frisch,updatedAt:frisch},
  {...doc,externalId:'termin',documentNumber:null,publishedAt:termin,updatedAt:termin}];
 try{
 const erst=await runMonitor({sources:[quelle],fetcher:liste,retentionDays:10});
 assert.equal(erst?.items.length,2,'die alte Sitzung darf gar nicht erst eingehen');
 assert.deepEqual((await dashboard()).items.map(i=>i.externalId).sort(),['frisch','termin']);
 // Und beim naechsten Lauf meldet die App nichts Neues, obwohl die Quelle dasselbe liefert.
 const zweit=await runMonitor({sources:[quelle],fetcher:liste,retentionDays:10});
 assert.equal(zweit?.items.length,0,'derselbe Inhalt darf nicht erneut als neu gelten');
 assert.match(zweit!.summary,/Keine neuen oder geänderten Dokumente/);
 const dritt=await runMonitor({sources:[quelle],fetcher:liste,retentionDays:10});
 assert.equal(dritt?.items.length,0);
 assert.equal((await dashboard()).items.length,2,'der Bestand bleibt stabil');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

// Die laufinterne Zusammenfuehrung reichte nicht: die Quellen haben unterschiedliche Zeitfenster,
// und Altbestand aus frueheren Laeufen blieb liegen. Live standen dadurch 12 Papiere doppelt.
test('Altbestand mit doppelter Drucksachennummer wird nachträglich zusammengeführt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-dedup2-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 try{
 const {db}=await import('../src/server/db');const c=await db();
 const {deduplicate}=await import('../src/server/monitor');
 const bau=(id:string,quelle:string,gremien:string[],themen:string[],ressorts:string[]=[])=>({
  ...doc,id,sourceId:quelle,institution:'X',hash:id,version:1,change:'unchanged' as const,
  firstSeen:'2026-09-01T00:00:00.000Z',lastSeen:'2026-09-01T00:00:00.000Z',changedAt:'2026-09-01T00:00:00.000Z',
  archived:false,documentNumber:'21/777',committees:gremien,lead:gremien[0]??null,ministries:ressorts,
  topics:themen.map(t=>({topic:t,terms:[t],count:1,inTitle:false,snippet:'…'}))});
 const a=bau('aaa','dip-committees',['we','um'],[]);
 const b=bau('bbb','dip-drucksachen',[],['halbleiter','dualuse'],['bmwe']);
 await c.batch([
  {sql:'INSERT INTO items(id,source_id,data) VALUES(?,?,?)',args:['aaa','dip-committees',JSON.stringify(a)]},
  {sql:'INSERT INTO items(id,source_id,data) VALUES(?,?,?)',args:['bbb','dip-drucksachen',JSON.stringify(b)]},
  {sql:'INSERT INTO versions(item_id,version,data) VALUES(?,?,?)',args:['bbb',1,JSON.stringify(b)]}
 ],'write');
 assert.equal(await deduplicate(),1,'genau eine Dublette faellt weg');
 const items=(await dashboard()).items;
 assert.equal(items.length,1);
 // Der Eintrag mit den meisten Gremien behaelt die Fuehrung und erbt alles andere.
 assert.equal(items[0].id,'aaa');
 assert.deepEqual(items[0].committees.sort(),['um','we']);
 assert.deepEqual(items[0].ministries,['bmwe']);
 assert.deepEqual(items[0].topics.map(t=>t.topic).sort(),['dualuse','halbleiter']);
 const waisen=await c.execute("SELECT COUNT(*) n FROM versions WHERE item_id NOT IN (SELECT id FROM items)");
 assert.equal(Number(waisen.rows[0].n),0);
 // Ein zweiter Durchgang findet nichts mehr.
 assert.equal(await deduplicate(),0);
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});
