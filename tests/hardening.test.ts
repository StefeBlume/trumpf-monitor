import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {clean,sourceURL,officialURL,germanDate,parseFeed,parseCommitteeEvents,parseAgendaTable,contentHash} from '../src/server/parsing';
import {fetchOfficial,PermanentSourceError,matchCommitteeName,lookbackStart,mapCommitteePosition} from '../src/server/connectors';
import {runMonitor,dashboard,prune} from '../src/server/monitor';
import {resetDBForTests} from '../src/server/db';
import {COMMITTEES,MINISTRIES,SOURCES,type DocumentInput,type Source} from '../src/model';

const base='https://www.bundestag.de/';
const doc=(over:Partial<DocumentInput>={}):DocumentInput=>({externalId:'1',title:'T',url:base+'a',text:'',publishedAt:null,updatedAt:null,
 documentType:'Gesetzentwurf',step:null,procedure:null,documentNumber:null,pdfUrl:null,committees:[],lead:null,ministries:[],originator:null,topics:[],...over});

// --- Quellenadressen ---------------------------------------------------------------------------
test('Fremde Adressen aus fremdem Markup werden nicht als amtliche Quelle uebernommen',()=>{
 assert.equal(sourceURL('https://www.bundestag.de/x'),'https://www.bundestag.de/x');
 for(const bad of ['https://attacker.example/x','http://www.bundestag.de/x','https://bundestag.de.attacker.com/x',
 'javascript:alert(1)','https://user:pw@www.bundestag.de/x','https://www.bundestag.de:8443/x',undefined])
 assert.equal(sourceURL(bad as string|undefined),null,`${bad} darf nicht durchgehen`);
});
test('Feed mit fremdem Link liefert den Eintrag nicht aus',()=>{
 const fremd=parseFeed('<rss><channel><item><title>X</title><link>https://attacker.example/x</link></item></channel></rss>',base);
 assert.equal(fremd.length,0);
 const echt=parseFeed('<rss><channel><item><title>X</title><link>https://www.bafa.de/x</link></item></channel></rss>',base);
 assert.equal(echt.length,1);
});
test('Terminliste und Tagesordnung filtern fremde Adressen',()=>{
 const ev=parseCommitteeEvents('<div class="bt-listenteaser"><h4>8. September 2026</h4><ul><li><a href="https://attacker.example/x">Anhörung</a></li><li><a href="https://www.bundestag.de/ok">Echt</a></li></ul></div>',base);
 assert.deepEqual(ev.map(r=>r.title),['Echt']);
 // Eine verworfene fremde Adresse ist eine Filterentscheidung, kein Formatbruch: die Zeile faellt
 // weg, die Quelle bleibt lesbar.
 const ag=parseAgendaTable('<template><tr><td>9. September 2026</td><td>Wirtschaft, Energie</td><td><a href="https://attacker.example/to.pdf">TO</a></td><td>x</td></tr></template>',base);
 assert.equal(ag.length,0);
});

// --- Zeichen und Suche -------------------------------------------------------------------------
test('Weiche Trennstriche und unsichtbare Zeichen werden entfernt',()=>{
 assert.equal(clean('Stromversorgungs­gesetz'),'Stromversorgungsgesetz');
 assert.equal(clean('Raum​fahrt﻿standort'),'Raumfahrtstandort');
 assert.equal(clean('  mehrere   Leerzeichen \n und Umbruch '),'mehrere Leerzeichen und Umbruch');
 assert.equal(clean('<b>Markup</b> raus'),'Markup raus');
 assert.equal(clean(null),'');
});

// --- Formatbruch faellt auf --------------------------------------------------------------------
test('Zeilen ohne lesbaren Inhalt gelten als Formatbruch, leere Tabellen nicht',()=>{
 // Genau dieser Fall lief schon einmal still auf null, als die Spaltenzahl wechselte.
 assert.throws(()=>parseAgendaTable('<template><tr><td>9. September 2026</td><td>Wirtschaft</td><td>kein Link</td></tr></template>',base),/keine Verweise/);
 assert.deepEqual(parseAgendaTable('<template></template>',base),[]);
 assert.deepEqual(parseCommitteeEvents('<div class="bt-listenteaser"></div>',base),[]);
});

// --- Wiederholung ------------------------------------------------------------------------------
test('Dauerhafte Fehler werden nicht wiederholt',async()=>{
 const start=Date.now();
 await assert.rejects(()=>fetchOfficial('https://attacker.example/x'),(e:Error)=>e instanceof PermanentSourceError);
 // Drei Versuche mit Wartezeit braeuchten mindestens 1,5 Sekunden.
 assert.ok(Date.now()-start<500,'Allowlist-Verstoß darf nicht wiederholt werden');
 await assert.rejects(()=>fetchOfficial('https://www.bundestag.de/gibt-es-nicht-404-test'),(e:Error)=>e instanceof PermanentSourceError);
});

// --- Ausschusszuordnung ------------------------------------------------------------------------
test('Ausschussnamen treffen genau die Auswahl, quer durch alle echten Bezeichnungen',()=>{
 const treffer:Record<string,string>={'Wirtschaft, Energie':'we','Wirtschaft und Energie':'we','Verteidigung':'vt',
 'Finanzen':'fi','Haushalt':'ha','Auswärtiges':'aa','Recht und Verbraucherschutz':'rv','Arbeit und Soziales':'as',
 'Digitales und Staatsmodernisierung':'di','Europäische Union':'eu','Umwelt, Klimaschutz, Naturschutz, Nukleare Sicherheit':'um',
 'Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung':'ftr'};
 for(const [label,id] of Object.entries(treffer))assert.equal(matchCommitteeName(label),id,label);
 const nicht=['Inneres','Verkehr','Gesundheit','Tourismus','Sport und Ehrenamt','Kultur und Medien','Petitionen',
 'Menschenrechte und humanitäre Hilfe','Landwirtschaft, Ernährung, Heimat','Wohnen, Stadtentwicklung, Bauwesen und Kommunen',
 'Bildung, Familie, Senioren, Frauen und Jugend','Wirtschaftliche Zusammenarbeit und Entwicklung',
 'Wahlprüfung, Immunität und Geschäftsordnung','',' ','—'];
 for(const label of nicht)assert.equal(matchCommitteeName(label),null,`${label} ist nicht ausgewählt`);
});

// --- Datumsauswertung --------------------------------------------------------------------------
test('Datumsauswertung deckt Randfaelle ab',()=>{
 assert.equal(germanDate('31. Dezember 2026')?.slice(0,10),'2026-12-31');
 assert.equal(germanDate('1. Januar 2027')?.slice(0,10),'2027-01-01');
 assert.equal(germanDate('9. März 2026')?.slice(0,10),'2026-03-09');
 // Ein ungueltiger Tag darf nicht in den Folgemonat ueberlaufen.
 assert.equal(germanDate('31. Februar 2026'),null);
 assert.equal(germanDate('32. Januar 2026'),null);
 for(const bad of ['','September 2026','8. September','8.9.2026','irgendwann'])assert.equal(germanDate(bad),null,bad);
});

// --- Abrufzeitfenster --------------------------------------------------------------------------
test('Abrufzeitfenster bleibt in jedem Fall gueltig und begrenzt',()=>{
 for(const input of [undefined,'','kaputt','2020-01-01T00:00:00Z',new Date().toISOString()]){
 const s=lookbackStart(input as string|undefined);
 assert.doesNotThrow(()=>new Date(s).toISOString(),`${input}`);
 const age=Date.now()-Date.parse(s);
 assert.ok(age>=0&&age<=30*86400000+2000,`Fenster ausserhalb der Grenzen fuer ${input}`);
 assert.match(s,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
 }
});

// --- Inhalts-Hash ------------------------------------------------------------------------------
test('Hash ist unabhaengig von der Reihenfolge der Gremien, aber empfindlich fuer Inhalte',()=>{
 assert.equal(contentHash(doc({committees:['we','fi']})),contentHash(doc({committees:['fi','we']})));
 assert.equal(contentHash(doc({ministries:['bmf','bmwe']})),contentHash(doc({ministries:['bmwe','bmf']})));
 for(const change of [{title:'Anders'},{step:'Beschlussempfehlung'},{documentNumber:'21/2'},{lead:'we'},
 {pdfUrl:base+'x.pdf'},{originator:'Bundesregierung'},{documentType:'Antrag'},{procedure:'Gesetzgebung'}])
 assert.notEqual(contentHash(doc()),contentHash(doc(change)),JSON.stringify(change));
 // updatedAt bleibt draussen: DIP setzt aktualisiert auch ohne inhaltliche Aenderung neu.
 assert.equal(contentHash(doc()),contentHash(doc({updatedAt:new Date().toISOString()})));
});

// --- Auswahl bleibt konsistent -----------------------------------------------------------------
test('Auswahl und Quellen bleiben in sich stimmig',()=>{
 const ids=[...COMMITTEES.map(c=>c.id),...MINISTRIES.map(m=>m.id)];
 assert.equal(ids.length,new Set(ids).size,'Ids muessen eindeutig sein');
 assert.equal(SOURCES.length,new Set(SOURCES.map(s=>s.id)).size);
 for(const c of COMMITTEES){
 assert.ok(c.kuerzel.length,`${c.id} ohne Kuerzel`);
 assert.ok(c.scope.length>10,`${c.id} ohne Begruendung der Auswahl`);
 if(c.institution==='Bundesrat')assert.equal(c.leadOnly,true,'Bundesratsausschuesse zaehlen nur federfuehrend');
 if(c.events)assert.match(c.events,/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/\d+-\d+$/,`${c.id} hat einen unbrauchbaren Terminpfad`);
 }
 for(const s of SOURCES)assert.ok(s.note.length>20,`${s.id} ohne Hinweis auf die Grenzen`);
});

// --- Aufbewahrung ------------------------------------------------------------------------------
test('Aufbewahrung entfernt Altes, verschont Archiviertes und Frisches',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-prune-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const source:Source={id:'dip-committees',name:'T',institution:'T',url:base,kind:'committee-dip',note:'Fixture'};
 try{
 await runMonitor({sources:[source],fetcher:async()=>[doc({externalId:'alt'}),doc({externalId:'frisch'})],retentionDays:0});
 const before=await dashboard();
 assert.equal(before.items.length,2);
 const {db}=await import('../src/server/db');const c=await db();
 // Massstab ist das Datum des Dokuments, nicht der letzte Abruf: ein gestern wiedergesehenes
 // Papier von vor einem Jahr bleibt sonst liegen.
 const alt=before.items.find(i=>i.externalId==='alt')!;
 const lange=new Date(Date.now()-400*86400000).toISOString();
 await c.execute({sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify({...alt,updatedAt:lange,lastSeen:new Date().toISOString()}),alt.id]});
 assert.equal(await prune(180),1,'nur das alte Dokument faellt weg');
 assert.deepEqual((await dashboard()).items.map(i=>i.externalId),['frisch']);
 const frisch=(await dashboard()).items[0];
 await c.execute({sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify({...frisch,updatedAt:lange,archived:true}),frisch.id]});
 assert.equal(await prune(180),0,'Archiviertes bleibt erhalten');
 assert.equal((await dashboard()).items.length,1);
 // Kuenftige Termine liegen jenseits der Frist und duerfen nie entfernt werden.
 const morgen=new Date(Date.now()+30*86400000).toISOString();
 await c.execute({sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify({...frisch,updatedAt:morgen,archived:false}),frisch.id]});
 assert.equal(await prune(10),0,'ein Termin in der Zukunft bleibt');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

// --- Teilausfall wird sichtbar -----------------------------------------------------------------
test('Teilausfall einer Quelle erscheint im Status, nicht nur im Log',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-partial-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const source:Source={id:'bt-events',name:'T',institution:'Bundestag',url:base,kind:'committee-events',note:'Fixture'};
 try{
 const run=await runMonitor({sources:[source],fetcher:async(_s,_since,warn)=>{warn?.('2 von 10 Terminlisten nicht lesbar: Umwelt; Recht');return [doc()];}});
 const state=(await dashboard()).sources.find(s=>s.id==='bt-events')!;
 assert.equal(state.status,'partial');
 assert.match(state.error!,/2 von 10 Terminlisten/);
 assert.equal(run?.coverage.failed,0,'ein Teilausfall ist kein Totalausfall');
 assert.ok(run!.errors.some(e=>/Terminlisten/.test(e)),'das Briefing muss den Teilausfall nennen');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

// --- Identitaet der Treffer --------------------------------------------------------------------
test('Gleiche Kennung in zwei Quellen erzeugt zwei getrennte Eintraege',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-ids-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const a:Source={id:'dip-committees',name:'A',institution:'A',url:base,kind:'committee-dip',note:'Fixture'};
 const b:Source={id:'dip-ministries',name:'B',institution:'B',url:base,kind:'fulltext-dip',note:'Fixture'};
 try{
 await runMonitor({sources:[a,b],fetcher:async()=>[doc({externalId:'gleich'})]});
 const items=(await dashboard()).items;
 assert.equal(items.length,2,'die Quelle gehoert zur Identitaet');
 assert.equal(new Set(items.map(i=>i.id)).size,2);
 // Doppelte Kennung innerhalb einer Quelle wird zusammengefasst.
 await runMonitor({sources:[a],fetcher:async()=>[doc({externalId:'x',title:'erst'}),doc({externalId:'x',title:'zuletzt'})]});
 const x=(await dashboard()).items.filter(i=>i.externalId==='x');
 assert.equal(x.length,1);
 assert.equal(x[0].title,'zuletzt','der letzte Eintrag gewinnt');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

// --- DIP-Abbildung -----------------------------------------------------------------------------
test('Unvollstaendige DIP-Antworten fuehren nicht zu halben Eintraegen',()=>{
 for(const kaputt of [null,undefined,{},{id:'1'},{titel:'X'},{id:'1',titel:'X'},
 {id:'1',titel:'X',ueberweisung:'kein Array'},{id:'1',titel:'X',ueberweisung:[{}]},
 {id:'1',titel:'X',ueberweisung:[{ausschuss_kuerzel:null,federfuehrung:true}]}])
 assert.equal(mapCommitteePosition(kaputt),null,JSON.stringify(kaputt));
 const ok=mapCommitteePosition({id:'1',titel:'X',ueberweisung:[{ausschuss_kuerzel:'AfWE',federfuehrung:true}],datum:'kein Datum',aktualisiert:'auch nicht'})!;
 assert.equal(ok.publishedAt,null,'ein unlesbares Datum wird nicht geraten');
 assert.equal(ok.updatedAt,null);
 assert.equal(ok.pdfUrl,null);
 assert.equal(ok.url,'https://dip.bundestag.de/vorgangsposition/1');
});

import {parseMinistryDrafts,bmfLabel} from '../src/server/connectors';

// Aus der echten Sitemap des BMF gekürzt.
const sitemap=`<?xml version="1.0"?><urlset>
<url><loc>https://www.bundesfinanzministerium.de/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/Abteilungen/Abteilung_IV/21_Legislaturperiode/2026-08-18-EStReformG-2027/0-Gesetz.html</loc><lastmod>2026-09-02</lastmod></url>
<url><loc>https://www.bundesfinanzministerium.de/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/Abteilungen/Abteilung_V/21_Legislaturperiode/2026-08-28-FAG-Aenderung/0-Gesetz.html</loc><lastmod>2026-09-02</lastmod></url>
<url><loc>https://www.bundesfinanzministerium.de/Web/DE/Presse/pressemitteilung.html</loc><lastmod>2026-09-11</lastmod></url>
<url><loc>https://attacker.example/Gesetze_Gesetzesvorhaben/Abteilungen/X/21_Legislaturperiode/2026-01-01-Boese/0-Gesetz.html</loc><lastmod>2026-09-01</lastmod></url>
</urlset>`;

test('Aus der BMF-Sitemap werden nur amtliche Gesetzesvorhaben übernommen',()=>{
 const d=parseMinistryDrafts(sitemap);
 assert.equal(d.length,2,'Pressemitteilung und fremde Domain fallen weg');
 const est=d.find(x=>x.title.includes('EStReformG'))!;
 assert.equal(est.documentType,'Referentenentwurf');
 assert.deepEqual(est.ministries,['bmf']);
 // Zwei Daten: wann entworfen (aus der Adresse) und wann zuletzt geändert (aus der Sitemap).
 assert.equal(est.publishedAt?.slice(0,10),'2026-08-18');
 assert.equal(est.updatedAt?.slice(0,10),'2026-09-02');
 assert.ok(est.url.startsWith('https://www.bundesfinanzministerium.de/'));
 assert.equal(d.filter(x=>x.url.includes('attacker')).length,0);
});

test('Das Kürzel wird lesbar gemacht, ohne einen Titel zu erfinden',()=>{
 assert.equal(bmfLabel('2026-08-28-FAG-Aenderung'),'FAG Änderung');
 assert.equal(bmfLabel('2026-08-07-G-Kassenpflicht'),'Kassenpflicht');
 assert.equal(bmfLabel('2026-05-19-JStG2026'),'JStG2026');
});

test('Eine Sitemap ohne Gesetzesvorhaben gilt als Formatbruch',()=>{
 assert.deepEqual(parseMinistryDrafts('<urlset></urlset>'),[]);
 // Dieselbe Adresse aus mehreren Unterseiten wird nur einmal geführt.
 const doppelt=parseMinistryDrafts(sitemap+sitemap);
 assert.equal(doppelt.length,2);
});

import {fetchTimeoutFor} from '../src/server/connectors';

test('Das Zeitlimit wächst mit der erlaubten Antwortgröße',()=>{
 // Bei festen 10 Sekunden bricht eine 26-MB-Antwort der Volltextsuche auf langsamer Leitung ab.
 assert.equal(fetchTimeoutFor(4_000_000),10_000);
 assert.equal(fetchTimeoutFor(24*1024*1024),50_000);
 assert.equal(fetchTimeoutFor(32*1024*1024),68_000);
 // Nach oben gedeckelt, damit ein haengender Server den Lauf nicht blockiert.
 assert.equal(fetchTimeoutFor(500*1024*1024),90_000);
 assert.equal(fetchTimeoutFor(1),10_000);
});
