import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {LOBBY_QUERIES,OWN_REGISTER_NUMBER,mapLobbyResult,mergeEntries,relevantEntries,type LobbyEntry} from '../src/server/lobby';
import {TOPICS} from '../src/server/topics';
import {runMonitor,dashboard,refreshLobby} from '../src/server/monitor';
import {resetDBForTests} from '../src/server/db';

// Aus der echten Antwort des Lobbyregisters gekürzt.
const echt={registerNumber:'R000697',
 lobbyistIdentity:{name:'TRUMPF SE + Co. KG (Holding)'},
 registerEntryDetails:{detailsPageUrl:'https://www.lobbyregister.bundestag.de/suche/R000697/72356',validFromDate:'2026-05-28T14:04:26.794+02:00'},
 activitiesAndInterests:{activity:{de:'Unternehmen'},fieldsOfInterest:[{de:'Außenwirtschaft'},{de:'Industriepolitik'},{de:'Wissenschaft, Forschung und Technologie'}]},
 employeesInvolvedInLobbying:{employeeFTE:1.5,relatedFiscalYearEnd:'2025-06-30'},
 financialExpenses:{financialExpensesEuro:{from:220001,to:230000}},
 regulatoryProjects:{regulatoryProjectsCount:5},statements:{statementsCount:1}};

test('Jedes Thema hat eine Registerabfrage',()=>{
 for(const t of TOPICS)assert.ok(LOBBY_QUERIES[t.id],`${t.id} ohne Abfrage`);
 assert.equal(Object.keys(LOBBY_QUERIES).length,TOPICS.length);
});

test('Registereintrag wird vollständig übernommen',()=>{
 const e=mapLobbyResult(echt,'halbleiter')!;
 assert.equal(e.name,'TRUMPF SE + Co. KG (Holding)');
 assert.equal(e.kind,'Unternehmen');
 assert.equal(e.projects,5);
 assert.equal(e.statements,1);
 assert.equal(e.staffFte,1.5);
 assert.equal(e.spendFrom,220001);
 assert.equal(e.spendTo,230000);
 assert.equal(e.fiscalYear,'2025');
 assert.equal(e.own,true,'der eigene Eintrag muss erkannt werden');
 assert.deepEqual(e.topics,['halbleiter']);
 assert.ok(e.fields.includes('Außenwirtschaft'));
});

test('Unvollständige Antworten erzeugen keine halben Einträge',()=>{
 for(const kaputt of [null,undefined,{},{registerNumber:'R1'},{lobbyistIdentity:{name:'X'}},
 {registerNumber:'R1',lobbyistIdentity:{name:'X'}}])
 assert.equal(mapLobbyResult(kaputt,'ki'),null,JSON.stringify(kaputt));
 // Fehlende Zahlen bleiben leer, statt als Null ausgegeben zu werden.
 const duenn=mapLobbyResult({registerNumber:'R2',lobbyistIdentity:{name:'Y'},registerEntryDetails:{detailsPageUrl:'https://x/y'}},'ki')!;
 assert.equal(duenn.staffFte,null);
 assert.equal(duenn.spendFrom,null);
 assert.equal(duenn.projects,0);
 assert.equal(duenn.kind,'Nicht angegeben');
});

test('Derselbe Akteur aus mehreren Abfragen wird zusammengeführt',()=>{
 const a=mapLobbyResult(echt,'halbleiter')!, b=mapLobbyResult(echt,'laser')!, c=mapLobbyResult(echt,'halbleiter')!;
 const zusammen=mergeEntries([a,b,c]);
 assert.equal(zusammen.length,1);
 assert.deepEqual(zusammen[0].topics.sort(),['halbleiter','laser']);
});

const bau=(nr:string,themen:string[],vorhaben=0):LobbyEntry=>({registerNumber:nr,name:'Akteur '+nr,kind:'Unternehmen',
 url:'https://www.lobbyregister.bundestag.de/suche/'+nr,topics:themen,fields:[],projects:vorhaben,statements:0,
 staffFte:null,spendFrom:null,spendTo:null,fiscalYear:null,updatedAt:null,own:nr===OWN_REGISTER_NUMBER});

test('Nur wer mehrere Themen berührt, kommt in die Übersicht — der eigene Eintrag immer',()=>{
 const liste=relevantEntries([bau('R1',['ki']),bau('R2',['ki','laser']),bau(OWN_REGISTER_NUMBER,['ki'])]);
 assert.deepEqual(liste.map(e=>e.registerNumber),[OWN_REGISTER_NUMBER,'R2']);
 assert.equal(liste[0].own,true,'der eigene Eintrag steht oben');
});

test('Reihenfolge folgt Themenbreite, dann Zahl der Vorhaben',()=>{
 const liste=relevantEntries([bau('R1',['ki','laser'],3),bau('R2',['ki','laser','halbleiter'],1),bau('R3',['ki','laser'],99)]);
 assert.deepEqual(liste.map(e=>e.registerNumber),['R2','R3','R1']);
});

test('Ein Lauf speichert die Akteure und ersetzt sie beim nächsten Mal',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-lobby-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 try{
 assert.equal(await refreshLobby(async()=>[bau('R1',['ki','laser']),bau('R2',['ki','halbleiter'])]),2);
 assert.equal((await dashboard()).lobby.length,2);
 // Der Registerstand ist die Wahrheit: ein zweiter Lauf ersetzt, statt anzuhäufen.
 assert.equal(await refreshLobby(async()=>[bau('R1',['ki','laser'])]),1);
 const nach=(await dashboard()).lobby;
 assert.equal(nach.length,1);
 assert.equal(nach[0].registerNumber,'R1');
 // Eine leere Antwort darf den Bestand nicht löschen.
 await assert.rejects(()=>refreshLobby(async()=>[]),/keine Einträge/);
 assert.equal((await dashboard()).lobby.length,1,'der letzte gute Stand bleibt erhalten');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

test('Ein Ausfall des Registers lässt die Dokumentquellen unberührt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'policy-lobbyfail-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 const doc={externalId:'1',title:'Gesetz',url:'https://www.bundestag.de/x',text:'',publishedAt:null,updatedAt:null,
  documentType:'Gesetzentwurf',step:null,procedure:null,documentNumber:null,pdfUrl:null,committees:['we'],lead:'we',ministries:[],originator:null,topics:[]};
 try{
 const run=await runMonitor({sources:[{id:'dip-committees',name:'T',institution:'Bundestag',url:'https://www.bundestag.de/',kind:'committee-dip',note:'Fixture'},
  {id:'lobbyregister',name:'L',institution:'Lobbyregister',url:'https://www.lobbyregister.bundestag.de/',kind:'lobby',note:'Fixture'}],
  fetcher:async()=>[doc],lobbyFetcher:async()=>{throw new Error('Register offline');}});
 assert.equal(run?.coverage.ok,1,'die Dokumentquelle bleibt erfolgreich');
 assert.equal(run?.coverage.failed,1);
 assert.ok(run!.errors.some(e=>/Register offline/.test(e)));
 const d=await dashboard();
 assert.equal(d.items.length,1,'die Dokumente sind trotzdem da');
 assert.equal(d.sources.find(s=>s.id==='lobbyregister')?.status,'error');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});
