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

import {mapProject,enrichProjects,withTopics,kappen,MAX_PROJECTS_PER_ENTRY,type LobbyProject} from '../src/server/lobby';

// Aus der echten Detailantwort des Registers gekürzt.
const rohVorhaben={regulatoryProjectNumber:'RV0012620',
 title:'Maschinensicherheit und E-Commerce',description:'Maschinensicherheit und E-Commerce',
 printedMatters:[{title:'Antrag',printingNumber:'20/14736',issuer:'BT',
  documentUrl:'https://dserver.bundestag.de/btd/20/147/2014736.pdf',
  projectUrl:'https://dip.bundestag.de/vorgang/maschinensicherheit/307091'}]};

test('Ein Vorhaben wird mit Drucksache und Themenbezug übernommen',()=>{
 const v=mapProject(rohVorhaben)!;
 assert.equal(v.number,'RV0012620');
 assert.equal(v.title,'Maschinensicherheit und E-Commerce');
 assert.equal(v.printingNumber,'20/14736');
 assert.ok(v.documentUrl?.endsWith('.pdf'));
 assert.ok(v.topics.includes('maschinen'),'genau dieses Vorhaben hatte TRUMPF selbst angemeldet');
 // Die Beschreibung fliesst in die Themensuche ein, wird aber nicht mitgespeichert.
 assert.equal((v as unknown as Record<string,unknown>).description,undefined);
});

test('Vorhaben ohne Nummer oder Titel werden verworfen, fremde Adressen gefiltert',()=>{
 for(const kaputt of [null,undefined,{},{title:'X'},{regulatoryProjectNumber:'R1'}])
  assert.equal(mapProject(kaputt),null,JSON.stringify(kaputt));
 const fremd=mapProject({...rohVorhaben,printedMatters:[{printingNumber:'1/1',documentUrl:'https://attacker.example/x.pdf',projectUrl:'https://attacker.example/v'}]})!;
 assert.equal(fremd.documentUrl,null);
 assert.equal(fremd.projectUrl,null);
 assert.equal(fremd.printingNumber,'1/1','die Nummer selbst bleibt erhalten');
});

test('Nur Vorhaben mit Themenbezug kommen in die Übersicht',()=>{
 const mit=mapProject(rohVorhaben)!;
 const ohne={...mit,topics:[]};
 assert.deepEqual(withTopics([mit,ohne]).map(v=>v.number),['RV0012620']);
 // Und hoechstens zwölf je Akteur: die Übersicht zeigt vier und nennt den Rest als Zahl.
 // withTopics filtert nur noch; begrenzt wird beim Speichern, gezählt wird vollständig.
 const viele=Array.from({length:MAX_PROJECTS_PER_ENTRY+8},(_,i)=>({...mit,number:'RV'+i}));
 assert.equal(withTopics(viele).length,MAX_PROJECTS_PER_ENTRY+8,'die Filterung kappt nicht');
 assert.equal(kappen(withTopics(viele)).length,MAX_PROJECTS_PER_ENTRY,'die Speicherung kappt');
 assert.ok(MAX_PROJECTS_PER_ENTRY>=40,'unter 40 würde die Kappung häufig greifen');
});

test('Vorhaben werden nur bei geändertem Registerstand neu geholt',async()=>{
 const v:LobbyProject[]=[mapProject(rohVorhaben)!];
 let abrufe=0;
 const holen=async()=>{abrufe++;return v;};
 const e=(nr:string,stand:string,anzahl=2):LobbyEntry=>({...bau(nr,['ki','laser']),updatedAt:stand,projects:anzahl});
 // Erster Lauf: nichts bekannt, also holen.
 let stand=await enrichProjects([e('R1','2026-01-01'),e('R2','2026-01-01')],new Map(),holen);
 assert.equal(abrufe,2);
 assert.equal(stand[0].projectList?.length,1);
 // Zweiter Lauf mit unveraendertem Registerstand: kein Abruf.
 const bekannt=new Map(stand.map(x=>[x.registerNumber,x]));
 stand=await enrichProjects([e('R1','2026-01-01'),e('R2','2026-01-01')],bekannt,holen);
 assert.equal(abrufe,2,'unveränderte Einträge dürfen nicht erneut abgerufen werden');
 assert.equal(stand[0].projectList?.length,1,'die bekannten Vorhaben bleiben erhalten');
 // Geaenderter Stand: erneut holen.
 stand=await enrichProjects([e('R1','2026-06-01'),e('R2','2026-01-01')],bekannt,holen);
 assert.equal(abrufe,3);
});

test('Ohne gemeldete Vorhaben wird gar nicht erst abgerufen',async()=>{
 let abrufe=0;
 const stand=await enrichProjects([{...bau('R9',['ki','laser']),updatedAt:'2026-01-01',projects:0}],new Map(),async()=>{abrufe++;return [];});
 assert.equal(abrufe,0);
 assert.deepEqual(stand[0].projectList,[]);
});

test('Pro Lauf wird die Zahl der Abrufe begrenzt, der Rest folgt später',async()=>{
 let abrufe=0;
 const viele=Array.from({length:10},(_,i)=>({...bau('R'+i,['ki','laser']),updatedAt:'2026-01-01',projects:3}));
 const stand=await enrichProjects(viele,new Map(),async()=>{abrufe++;return [];},4);
 assert.equal(abrufe,4,'die Grenze muss greifen');
 // Die uebrigen bleiben unmarkiert und werden im naechsten Lauf nachgeholt.
 assert.equal(stand.filter(e=>e.detailFor===null).length,6);
});

test('Ein fehlgeschlagener Detailabruf verwirft den bekannten Stand nicht',async()=>{
 const v=[mapProject(rohVorhaben)!];
 const bekannt=new Map([['R1',{...bau('R1',['ki','laser']),updatedAt:'2026-01-01',projectList:v,detailFor:'2026-01-01'}]]);
 const stand=await enrichProjects([{...bau('R1',['ki','laser']),updatedAt:'2026-06-01',projects:2}],bekannt,
  async()=>{throw new Error('Register offline');});
 assert.equal(stand[0].projectList?.length,1,'der letzte gute Stand bleibt');
});

test('Gespeicherte Stände aus einer früheren Fassung werden beim Wiederverwenden gefiltert',async()=>{
 // Der Zwischenspeicher hielt Vorhaben ohne Themenbezug. Da unveraenderte Eintraege gar nicht neu
 // abgerufen werden, blieb der veroeffentlichte Stand gross.
 const mit=mapProject(rohVorhaben)!;
 const ohne={...mit,number:'RV-ohne',topics:[]};
 const bekannt=new Map([['R1',{...bau('R1',['ki','laser']),updatedAt:'2026-01-01',
  projectList:[mit,ohne],detailFor:'2026-01-01'}]]);
 let abrufe=0;
 const stand=await enrichProjects([{...bau('R1',['ki','laser']),updatedAt:'2026-01-01',projects:2}],bekannt,
  async()=>{abrufe++;return [];});
 assert.equal(abrufe,0,'ein unveränderter Eintrag wird nicht neu abgerufen');
 assert.deepEqual(stand[0].projectList?.map(v=>v.number),['RV0012620'],'das themenlose Vorhaben fällt weg');
});

test('Ausgefallene Themenabfragen erscheinen im Quellenstatus',async()=>{
 // Faellt eine Abfrage aus, beruehren Eintraege weniger Themen und fallen unter die Schwelle.
 // Ohne Hinweis sieht das aus wie ein geschrumpftes Register - live von 95 auf 29 Akteure.
 const dir=mkdtempSync(join(tmpdir(),'policy-lobbywarn-'));process.env.DATABASE_URL='file:'+join(dir,'test.db');
 try{
 const lauf=await runMonitor({sources:[{id:'lobbyregister',name:'L',institution:'Lobbyregister',
  url:'https://www.lobbyregister.bundestag.de/',kind:'lobby',note:'Fixture'}],
  lobbyFetcher:async(warn?:(n:string)=>void)=>{warn?.('3 von 9 Themenabfragen fehlgeschlagen: Halbleiter; Laser; KI');return [bau('R1',['ki','laser'])];}});
 const q=(await dashboard()).sources.find(s=>s.id==='lobbyregister')!;
 assert.equal(q.status,'partial');
 assert.match(q.error!,/3 von 9 Themenabfragen/);
 assert.equal(lauf?.coverage.failed,0,'ein Teilausfall ist kein Totalausfall');
 assert.ok(lauf!.errors.some(e=>/Themenabfragen/.test(e)),'das Briefing muss ihn nennen');
 assert.equal((await dashboard()).lobby.length,1,'die erreichbaren Einträge bleiben');
 }finally{await resetDBForTests();delete process.env.DATABASE_URL;rmSync(dir,{recursive:true,force:true});}});

test('Die Karte nennt alle Vorhaben mit Themenbezug, auch die nicht gespeicherten',async()=>{
 // Der BDEW führt 41 Vorhaben zu diesen Themen, gespeichert werden 40. Ohne mitgeführte Zahl
 // meldete die Karte "und 8 weitere", obwohl es 29 waren.
 const mit=mapProject(rohVorhaben)!;
 const viele=Array.from({length:41},(_,i)=>({...mit,number:'RV'+i}));
 const stand=await enrichProjects([{...bau('R1',['ki']),projects:200}],new Map(),async()=>viele);
 assert.equal(stand[0].projectList!.length,MAX_PROJECTS_PER_ENTRY,'gespeichert wird begrenzt');
 assert.equal(stand[0].topicProjects,41,'gezählt wird vollständig');
 // Beim Wiederverwenden darf die gezählte Zahl nicht verloren gehen.
 const bekannt=new Map([['R1',stand[0]]]);
 const zweiter=await enrichProjects([{...bau('R1',['ki']),projects:200,updatedAt:stand[0].updatedAt}],bekannt,
  async()=>{throw new Error('darf nicht erneut abrufen');});
 assert.equal(zweiter[0].topicProjects,41);
});
