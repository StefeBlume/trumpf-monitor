import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {clean,sourceURL,officialURL,germanDate,parseFeed,parseCommitteeEvents,parseAgendaTable,contentHash,dipUrl,slug} from '../src/server/parsing';
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
test('Aufbewahrung entfernt Altes, auch Archiviertes, und verschont Frisches',async()=>{
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
 // Die Vorgabe: alles, was aelter als die Frist ist, wird geloescht - auch Archiviertes.
 await c.execute({sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify({...frisch,updatedAt:lange,archived:true}),frisch.id]});
 assert.equal(await prune(180),1,'auch Archiviertes jenseits der Frist faellt weg');
 assert.equal((await dashboard()).items.length,0);
 // Kuenftige Termine liegen jenseits der Frist und duerfen nie entfernt werden.
 const morgen=new Date(Date.now()+30*86400000).toISOString();
 await c.execute({sql:'INSERT INTO items(id,source_id,data) VALUES(?,?,?)',args:[frisch.id,frisch.sourceId,JSON.stringify({...frisch,updatedAt:morgen,archived:false})]});
 assert.equal(await prune(10),0,'ein Termin in der Zukunft bleibt');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

// Briefings wurden nur nach Anzahl geloescht (die letzten 60), ausgeliefert die letzten zwoelf. Bei etwa einem Briefing am
// Tag zeigte die App dann Dokumentkopien von vor zwoelf Tagen. Aenderungslog und fruehere Versionen blieben unbegrenzt.
test('Die Frist gilt auch für Briefings, Änderungslog und frühere Versionen',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-frist-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const source:Source={id:'dip-committees',name:'T',institution:'T',url:base,kind:'committee-dip',note:'Fixture'};
 try{
 await runMonitor({sources:[source],fetcher:async()=>[doc({externalId:'bleibt'})],retentionDays:0});
 const {db}=await import('../src/server/db');const c=await db();
 const item=(await dashboard()).items[0];
 const alt=new Date(Date.now()-20*86400000).toISOString(),neu=new Date().toISOString();
 await c.batch([
  {sql:'INSERT INTO briefings(id,day,data) VALUES(?,?,?)',args:['alt','x',JSON.stringify({id:'alt',createdAt:alt,day:'x',baseline:false,summary:'alt',items:[],coverage:{ok:1,failed:0,manual:0},errors:[]})]},
  {sql:'INSERT INTO events(id,run_id,data) VALUES(?,?,?)',args:['e-alt','r',JSON.stringify({id:'e-alt',itemId:item.id,title:'x',at:alt,change:'changed',sourceId:item.sourceId,version:1})]},
  // Eine fruehere Version von vor zwanzig Tagen und der aktuelle Stand, der ebenfalls vor zwanzig Tagen entstand.
  {sql:'INSERT OR REPLACE INTO versions(item_id,version,data) VALUES(?,?,?)',args:[item.id,0,JSON.stringify({...item,version:0,changedAt:alt})]},
  {sql:'INSERT OR REPLACE INTO versions(item_id,version,data) VALUES(?,?,?)',args:[item.id,item.version,JSON.stringify({...item,changedAt:alt})]}
 ],'write');
 await prune(10);
 const d=await dashboard();
 assert.ok(!d.briefings.some(b=>b.id==='alt'),'das alte Briefing ist weg');
 assert.ok(d.briefings.length>=1,'das Briefing des Laufs bleibt');
 assert.ok(!d.events.some(e=>e.id==='e-alt'),'der alte Logeintrag ist weg');
 const v=(await c.execute({sql:'SELECT version FROM versions WHERE item_id=? ORDER BY version',args:[item.id]})).rows.map(r=>Number(r.version));
 assert.deepEqual(v,[item.version],'die fruehere Version faellt, der aktuelle Stand des Dokuments bleibt');
 assert.equal(d.items.length,1,'das Dokument selbst liegt im Zeitraum und bleibt');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

// Gespeicherte Plenarprotokoll-Beratungen trugen die Datenpflege des DIP als Bewegung. Die Aufbewahrung las das Rohdatum und
// liess sie stehen; die Oberflaeche zeigte sie oben. Beide rechnen jetzt mit dem Datum der Debatte.
test('Gespeicherte Plenarprotokoll-Beratungen verlieren das Pflegedatum und laufen ab',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-plenum-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const source:Source={id:'dip-committees',name:'T',institution:'T',url:base,kind:'committee-dip',note:'Fixture'};
 try{
 await runMonitor({sources:[source],fetcher:async()=>[doc({externalId:'debatte'}),doc({externalId:'vorlage'})],retentionDays:0});
 const {db}=await import('../src/server/db');const c=await db();
 const [a,b]=(await dashboard()).items;
 const debatte=new Date(Date.now()-365*86400000).toISOString(),pflege=new Date().toISOString();
 await c.batch([
  {sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify({...a,documentType:'Plenarprotokoll',step:'Beratung',publishedAt:debatte,updatedAt:pflege}),a.id]},
  {sql:'UPDATE items SET data=? WHERE id=?',args:[JSON.stringify({...b,documentType:'Unterrichtung',publishedAt:debatte,updatedAt:pflege}),b.id]}
 ],'write');
 const gelesen=(await dashboard()).items.find(i=>i.id===a.id)!;
 assert.equal(gelesen.updatedAt,debatte,'die Oberfläche zeigt das Datum der Debatte');
 assert.equal(await prune(10),1,'die Debatte von vor einem Jahr läuft ab');
 assert.deepEqual((await dashboard()).items.map(i=>i.id),[b.id],'die spät überwiesene Drucksache bleibt');
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
 // Ohne Vorgang und ohne Fundstelle bleibt nur die Suche - die Route /vorgangsposition/ gibt es im
 // DIP nicht, ein Link dorthin waere tot.
 assert.equal(ok.url,'https://dip.bundestag.de/suche?f.id=1');
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
 assert.equal(est.documentType,'Gesetz','der Seitentyp aus der Adresse');
 assert.equal(est.step,null,'einen Verfahrensschritt nennt die Sitemap nicht');
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

// Die Sitemap führt 38 Gesetze und 10 Verordnungen. Jedes hieß "Gesetzesvorhaben", galt als "Referentenentwurf" und stand
// im Schritt "Vorbereitung im Ressort" - die Verordnung ApO trug so den Titel "Gesetzesvorhaben ApO".
test('BMF-Einträge übernehmen nur, was die Adresse sagt',()=>{
 const url=(slug:string,seite:string)=>`https://www.bundesfinanzministerium.de/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/Abteilungen/Abteilung_IV/21_Legislaturperiode/${slug}/${seite}`;
 const xml=`<urlset>${[['2026-03-23-ApO','0-Verordnung.html'],['2025-10-29-Fondrisikobegrenzungsgesetz','0-Gesetz.html'],['2025-11-05-2-VO-Aenderung-KassenSichV','0-Verordnung.html'],['2026-04-15-LKEG','0-Gesetz.html']]
  .map(([slug,seite])=>`<url><loc>${url(slug,seite)}</loc><lastmod>2026-09-10</lastmod></url>`).join('')}</urlset>`;
 const d=parseMinistryDrafts(xml);
 const nach=(t:string)=>d.find(x=>x.url.includes(t))!;
 assert.deepEqual([nach('ApO').title,nach('ApO').documentType],['Verordnung ApO','Verordnung']);
 assert.deepEqual([nach('Fondrisiko').title,nach('Fondrisiko').documentType],['Fondrisikobegrenzungsgesetz','Gesetz'],'kein doppeltes Typwort');
 assert.deepEqual([nach('KassenSichV').title,nach('KassenSichV').documentType],['2 VO Änderung KassenSichV','Verordnung']);
 assert.deepEqual([nach('LKEG').title,nach('LKEG').documentType],['Gesetz LKEG','Gesetz']);
 for(const x of d){assert.equal(x.step,null);assert.ok(!/Referentenentwurf|Gesetzesvorhaben/.test(x.title+x.documentType),x.title);}
});

import {blaettern,TERMINSEITE} from '../src/server/connectors';

// Die Terminlisten liefern 10 Einträge je Abruf, neueste zuerst. Am 13.09. belegte der Rechtsausschuss 5 der 10 Plätze mit
// künftigen Anhörungen; die App fragte nie eine zweite Seite ab.
test('Terminlisten werden geblättert, solange die Seite noch Termine im Zeitraum führt',async()=>{
 const termin=(n:number,tag:string)=>({url:`https://www.bundestag.de/t/${n}`,title:`Anhörung ${n}`,date:`${tag}T00:00:00.000Z`});
 const listen:Record<number,ReturnType<typeof termin>[]>={
  0:Array.from({length:10},(_,i)=>termin(i,'2026-10-'+String(20-i).padStart(2,'0'))),
  10:[termin(10,'2026-09-30'),termin(11,'2026-09-20'),termin(12,'2026-05-01')],
  20:[termin(20,'2026-04-01')]
 };
 const gefragt:number[]=[];
 const seite=async(offset:number)=>{gefragt.push(offset);return listen[offset]??[];};
 const alle=await blaettern(seite,'2026-08-14');
 assert.equal(TERMINSEITE,10);
 assert.deepEqual(gefragt,[0,10],'Seite 2 ist voll im Zeitraum abgerufen, Seite 3 nicht mehr nötig');
 assert.equal(alle.length,13,'die Termine jenseits der ersten zehn fehlen nicht');
 // Endet die erste Seite schon außerhalb des Zeitraums, bleibt es bei einem Abruf.
 gefragt.length=0;
 await blaettern(async o=>{gefragt.push(o);return o===0?Array.from({length:10},(_,i)=>termin(i,i<5?'2026-10-01':'2026-03-01')):[];},'2026-08-14');
 assert.deepEqual(gefragt,[0]);
 // Eine Liste, die nie endet, wird nach fünf Seiten abgebrochen, und doppelte Adressen zählen einmal.
 gefragt.length=0;
 const endlos=await blaettern(async o=>{gefragt.push(o);return Array.from({length:10},(_,i)=>termin(i,'2026-10-01'));},'2026-08-14');
 assert.equal(gefragt.length,5);
 assert.equal(endlos.length,10);
});

import {agendaDocuments} from '../src/server/connectors';

// Die Tagesordnungsliste wurde mit limit=50 abgerufen und lieferte 10. Seite 2 enthielt 10 weitere Tagesordnungen,
// 3 davon von ausgewählten Ausschüssen; der Kommentar behauptete, die Liste habe keine Grenze.
test('Die Tagesordnungsliste wird über die erste Seite hinaus gelesen',async()=>{
 const tag=(vor:number)=>new Intl.DateTimeFormat('de-DE',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Berlin'}).format(new Date(Date.now()-vor*86400000));
 const zeile=(n:number,vor:number)=>`<tr><td>${tag(vor)}</td><td>Verteidigung</td><td><a href="https://www.bundestag.de/resource/blob/${n}/to.pdf">Tagesordnung ${n}</a></td></tr>`;
 const seiten:Record<string,string>={
  '0':`<template data-js-document-results="table">${Array.from({length:10},(_,i)=>zeile(i,i%3)).join('')}</template>`,
  '10':`<template data-js-document-results="table">${zeile(10,4)}${zeile(11,5)}</template>`
 };
 const echt=globalThis.fetch;const gefragt:string[]=[];
 globalThis.fetch=(async(u:any)=>{const o=new URL(String(u)).searchParams.get('offset')??'';gefragt.push(o);
  return new Response(seiten[o]??'<template data-js-document-results="table"></template>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});}) as typeof fetch;
 try{
  const docs=await agendaDocuments();
  assert.deepEqual(gefragt,['0','10'],'nach einer vollen ersten Seite folgt die zweite');
  assert.equal(docs.length,12,'alle zwölf Tagesordnungen kommen an');
  assert.ok(docs.every(d=>d.lead==='vt'&&d.originator==='Verteidigungsausschuss'));
 }finally{globalThis.fetch=echt;}
});

import {committeeDocuments,eigeneDrucksache} from '../src/server/connectors';

// 19 Einträge trugen die Nummer der Sammel-Unterrichtung 21/7984, "Amtliches PDF öffnen" führte zur Sammelliste. Laut DIP hat
// der Jahresbericht 2025 die eigene Drucksache 21/7050; 6 Berichte gingen an beide Häuser (etwa BT 21/7150 und BR 419/26).
test('Gesammelte Überweisungen zeigen die eigene Drucksache der Vorlage',async()=>{
 const pdf=(n:string)=>`https://dserver.bundestag.de/btd/21/${n.slice(3,6)}/21${n.slice(3)}.pdf`;
 const pos=(id:string,schritt:string,nr:string,hg='BT',datum='2026-07-02')=>({id,vorgangsposition:schritt,datum,fundstelle:{dokumentart:'Drucksache',herausgeber:hg,dokumentnummer:nr,drucksachetyp:'Unterrichtung',pdf_url:hg==='BT'?pdf(nr):`https://dserver.bundestag.de/brd/2026/0${nr.split('/')[0]}-26.pdf`}});
 const S='Überweisung gemäß § 80 Abs. 3 Geschäftsordnung BT';
 assert.deepEqual(eigeneDrucksache([pos('a','Unterrichtung','21/7050'),pos('b',S,'21/7984','BT','2026-09-10')],'BT'),{nummer:'21/7050',pdf:pdf('21/7050'),herausgeber:'BT'});
 assert.equal(eigeneDrucksache([pos('a','Unterrichtung','419/26','BR','2026-06-01'),pos('b','Unterrichtung','21/7150','BT','2026-06-03'),pos('c',S,'21/7984')],'BT')?.nummer,'21/7150','die Drucksache des überweisenden Hauses');
 assert.equal(eigeneDrucksache([pos('c',S,'21/7984')],'BT'),null,'ohne eigene Drucksache keine erfundene');
 // Der ganze Weg: Abruf, eine Nachfrage je Vorgang, berichtigte Angaben.
 const sammel={id:'p2',vorgang_id:'337282',titel:'Jahresbericht 2025',vorgangsposition:S,vorgangstyp:'Bericht, Gutachten, Programm',datum:'2026-09-10',aktualisiert:new Date().toISOString(),
  ueberweisung:[{ausschuss_kuerzel:'VgA',federfuehrung:false}],fundstelle:{dokumentart:'Drucksache',herausgeber:'BT',dokumentnummer:'21/7984',drucksachetyp:'Unterrichtung',pdf_url:pdf('21/7984')}};
 const echt=globalThis.fetch,schluessel=process.env.DIP_API_KEY;const nachfragen:string[]=[];
 process.env.DIP_API_KEY='test';
 globalThis.fetch=(async(u:any)=>{const url=new URL(String(u));const json=(x:unknown)=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
  if(url.searchParams.get('f.vorgang')){nachfragen.push(url.searchParams.get('f.vorgang')!);return json({documents:[pos('p1','Unterrichtung','21/7050'),sammel]});}
  return url.searchParams.get('cursor')?json({documents:[],cursor:'c'}):json({documents:[sammel,{...sammel,id:'p3'}],cursor:'c'});}) as typeof fetch;
 try{
  const docs=await committeeDocuments(new Date(Date.now()-86400000).toISOString());
  assert.equal(docs.length,2);
  for(const d of docs)assert.deepEqual([d.documentNumber,d.pdfUrl,d.paperKey],['21/7050',pdf('21/7050'),'BT-Drucksache 21/7050']);
  assert.deepEqual(nachfragen,['337282'],'eine Nachfrage je Vorgang');
 }finally{globalThis.fetch=echt;if(schluessel===undefined)delete process.env.DIP_API_KEY;else process.env.DIP_API_KEY=schluessel;}
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

test('Das Seitenlimit deckt ein volles Abrufzeitfenster',async()=>{
 // Die Volltextsuche liefert zehn Dokumente je Seite. Ein 30-Tage-Fenster sind rund 675 Dokumente
 // und damit 68 Seiten; bei einer Grenze von 100 bliebe wenig Luft.
 const quelle=readFileSync('src/server/connectors.ts','utf8');
 const limit=Number(quelle.match(/for\(let page=0;page<(\d+);page\+\+\)/)?.[1]);
 assert.ok(limit>=150,`Seitenlimit ${limit} lässt zu wenig Luft für ein 30-Tage-Fenster`);
 // Und das Fenster selbst bleibt bei 30 Tagen gedeckelt.
 const aeltest=lookbackStart('2020-01-01T00:00:00.000Z');
 assert.ok(Date.now()-Date.parse(aeltest)<=30*86400000+2000);
});

// Die kurzen DIP-Adressen antworteten mit HTTP 200, zeigten aber "Seite nicht gefunden". Jeder Link
// aus der App ins DIP war damit tot - und das betraf die Mehrheit aller Dokumente.
test('DIP-Adressen tragen den Slug, ohne den die Seite nicht gefunden wird',()=>{
 const v=dipUrl('vorgang',338786,'Gesetz zur Änderung des Außenwirtschaftsgesetzes');
 assert.match(v,/^https:\/\/dip\.bundestag\.de\/vorgang\/[a-z0-9-]+\/338786$/);
 assert.ok(v.includes('aussenwirtschaftsgesetzes'),'Umlaute werden umschrieben, nicht verworfen');
 const d=dipUrl('drucksache',290686,'Hochtechnologie-Agenda wirksam machen');
 assert.match(d,/^https:\/\/dip\.bundestag\.de\/drucksache\/hochtechnologie-agenda-wirksam-machen\/290686$/);
 // Ohne Slug-Segment ist die Adresse tot; das darf nie wieder entstehen.
 for(const u of [v,d])assert.equal(u.split('/').length,6,`${u} hat kein Slug-Segment`);
 assert.ok(officialURL(v)&&officialURL(d));
});

test('Der Slug bleibt auch bei unbrauchbaren Titeln gültig',()=>{
 assert.equal(slug(''),'dokument');
 assert.equal(slug('   '),'dokument');
 assert.equal(slug('!!! ??? ---'),'dokument');
 assert.equal(slug('Äpfel, Öl und Übermut – groß'),'aepfel-oel-und-uebermut-gross');
 assert.ok(slug('x'.repeat(300)).length<=80,'die Adresse bleibt handhabbar');
 assert.ok(!slug('Ende mit Satzzeichen ...').endsWith('-'),'kein Trennstrich am Ende');
});




// Die Inhaltsseiten des BMF tragen den richtigen Titel, sind aus dem Lauf heraus aber nicht
// erreichbar: sie leiten auf validate.perfdrive.com um, den Bot-Schutz von Radware. Im Browser
// faellt das nicht auf. Der Schutz von fetchOfficial haelt genau das ab - und soll es auch.
test('Eine Weiterleitung auf einen Bot-Schutz wird abgewiesen, nicht umgangen',async()=>{
 const echt=globalThis.fetch;
 globalThis.fetch=(async()=>new Response(null,{status:302,
  headers:{location:'https://validate.perfdrive.com/?ssc=x'}})) as typeof fetch;
 try{
  await assert.rejects(()=>fetchOfficial('https://www.bundesfinanzministerium.de/Content/DE/x.html'),
   (e:Error)=>e instanceof PermanentSourceError&&/Weiterleitung nicht freigegeben/.test(e.message));
 }finally{globalThis.fetch=echt;}
});

test('Ohne erreichbaren Titel dient das amtliche Kürzel, ohne einen Titel zu erfinden',()=>{
 const sitemap='<urlset><url><loc>https://www.bundesfinanzministerium.de/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/Abteilungen/Abteilung_IV/21_Legislaturperiode/2026-08-18-EStReformG-2027/0-Gesetz.html</loc><lastmod>2026-08-18</lastmod></url></urlset>';
 const [d]=parseMinistryDrafts(sitemap);
 assert.equal(d.title,'Gesetz EStReformG 2027');
 assert.equal(d.documentType,'Gesetz');
 assert.ok(d.url.startsWith('https://www.bundesfinanzministerium.de/'),'der Link öffnet im Browser die richtige Seite');
});

// "npm run dev" brach mit "EADDRINUSE: address already in use 0.0.0.0:4180" ab, während die App aus einem
// anderen Terminal-Tab längst lief und antwortete - zweimal hintereinander für dieselbe Person.
test('npm run dev erkennt eine bereits laufende App',async()=>{
 const {readFileSync}=await import('node:fs');
 const paket=JSON.parse(readFileSync('package.json','utf8'));
 assert.equal(paket.scripts.dev,'node scripts/dev.mjs','der Start läuft über die Portprüfung');
 const skript=readFileSync('scripts/dev.mjs','utf8');
 assert.match(skript,/net\.connect\(PORT, HOST\)/,'ein laufender Server wird per Verbindung erkannt, auch wenn er auf allen Adressen lauscht');
 assert.match(skript,/Die App läuft bereits: http:\/\/localhost:\$\{PORT\}/,'und die Adresse genannt');
 assert.match(skript,/'--hostname', HOST, '--port', String\(PORT\)/,'gestartet wird auf demselben Port');
});

// Auf 0.0.0.0 war die lokale Fassung im ganzen WLAN erreichbar: http://192.168.178.135:4180/connection.json
// lieferte mit HTTP 200 den Verbindungsschluessel, mit dem sich Quellenlaeufe ausloesen und Dokumente archivieren liessen.
test('Die lokale Fassung ist nur auf diesem Mac erreichbar',async()=>{
 const {readFileSync}=await import('node:fs');
 const skript=readFileSync('scripts/dev.mjs','utf8');
 assert.match(skript,/const HOST = '127\.0\.0\.1';/);
 assert.ok(!skript.includes("'0.0.0.0'"),'npm run dev lauscht nicht im Netzwerk');
 const paket=JSON.parse(readFileSync('package.json','utf8'));
 assert.match(paket.scripts.start,/--hostname 127\.0\.0\.1 /,'npm start ebenso');
 assert.ok(!JSON.stringify(paket.scripts).includes('0.0.0.0'));
});
