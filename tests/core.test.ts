import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {parseFeed,contentHash,officialURL} from '../src/server/parsing';
import {mapCommitteePosition,mapMinistryDrucksache,matchAgendaCommittee,lookbackStart} from '../src/server/connectors';
import {berlinClock,runMonitor,dashboard,history,briefingSummary} from '../src/server/monitor';
import {resetDBForTests} from '../src/server/db';import {COMMITTEES,MINISTRIES,type DocumentInput,type Item,type Source} from '../src/model';
const doc:DocumentInput={externalId:'1',title:'Gesetz zur Änderung des Außenwirtschaftsgesetzes',url:'https://www.bundestag.de/test',text:'',publishedAt:null,documentType:'Gesetzentwurf',step:'Gesetzentwurf',procedure:'Gesetzgebung',documentNumber:'21/1234',pdfUrl:null,committees:['we'],lead:'we',ministries:[],originator:'Bundesregierung'};
// Aus einer echten DIP-Vorgangsposition gekürzt.
const position={id:'698164',vorgangsposition:'Unterrichtung',vorgangstyp:'EU-Vorlage',titel:'Vorschlag für eine Verordnung',vorgang_id:'338133',datum:'2026-08-04',
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
});
test('Überweisung wird nur für ausgewählte Ausschüsse übernommen',()=>{
 const m=mapCommitteePosition(position)!;
 assert.equal(m.lead,'we');
 assert.deepEqual(m.committees,['we']);               // Verkehrsausschuss nicht ausgewählt; Finanzausschuss nur federführend
 assert.equal(m.documentNumber,'426/26');
 assert.equal(m.pdfUrl,'https://dserver.bundestag.de/brd/2026/0426-26.pdf');
 assert.equal(m.step,'Unterrichtung');
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
 const hit=mapMinistryDrucksache({id:'9',titel:'Verordnung',datum:'2026-09-01',drucksachetyp:'Verordnung',dokumentnummer:'21/9',fundstelle:{urheber:['Bundesministerium für Wirtschaft und Energie']}})!;
 assert.deepEqual(hit.ministries,['bmwe']);
 assert.equal(mapMinistryDrucksache({id:'9',titel:'Bericht des Bundesministeriums für Wirtschaft und Energie',fundstelle:{urheber:['Fraktion der AfD']}}),null);
 assert.equal(mapMinistryDrucksache({id:'9',titel:'X',fundstelle:{urheber:['Bundesministerium für Gesundheit']}}),null);
});
test('Tagesordnungen werden nur bei eindeutigem Ausschusspräfix übernommen',()=>{
 assert.equal(matchAgendaCommittee('Wirtschaft und Energie: 12. Sitzung am Mittwoch'),'we');
 assert.equal(matchAgendaCommittee('Forschung, Technologie und Raumfahrt: 8. Sitzung'),'ftr');
 assert.equal(matchAgendaCommittee('Inneres: 40. Sitzung am Donnerstag'),null);
 assert.equal(matchAgendaCommittee('Parlament: Tagesordnung Dienstag'),null);
 assert.equal(matchAgendaCommittee('Tagesordnung ohne Präfix'),null);
});
test('Abruffenster überlappt den letzten Lauf und reicht höchstens 30 Tage zurück',()=>{
 const recent=lookbackStart(new Date(Date.now()-3600000).toISOString());
 assert.ok(Date.now()-Date.parse(recent)>=2*86400000-3600000,'zwei Tage Überlappung fehlen');
 assert.ok(Date.now()-Date.parse(lookbackStart(new Date('2020-01-01').toISOString()))<=30*86400000+1000);
 assert.doesNotThrow(()=>new Date(lookbackStart(undefined)).toISOString());
});
test('Metadata changes produce a new hash; whitespace does not',()=>{assert.equal(contentHash(doc),contentHash({...doc,title:'Gesetz zur  Änderung des Außenwirtschaftsgesetzes'}));assert.notEqual(contentHash(doc),contentHash({...doc,step:'Beschlussempfehlung und Bericht'}));assert.notEqual(contentHash(doc),contentHash({...doc,committees:['we','fi']}));});
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
 const third=await runMonitor({sources:[source],fetcher:async()=>[{...doc,step:'Beschlussempfehlung und Bericht'},{...doc,externalId:'2',title:'Forschungszulage',committees:['ftr'],lead:'ftr'}]});
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
