import Head from 'next/head';
import {useEffect,useRef,useState} from 'react';
import {Radar,LayoutDashboard,FileText,Radio,Settings,Search,ArrowUpRight,RefreshCw,ChevronRight,Clock,ShieldCheck,AlertCircle,ArrowLeft,Download,Archive,Check,SlidersHorizontal,X,Landmark,FileDown,Building2,Target,Quote,CalendarDays,Users,Euro,Bookmark,BookmarkCheck} from 'lucide-react';
import {COMMITTEES,MINISTRIES,SOURCES,committeeById,type Dashboard,type Item,type Briefing,type Change} from '../src/model';
import {TOPICS,topicById,type TopicMatch} from '../src/server/topics';
import type {LobbyProject} from '../src/server/lobby';
import {recency,kartenDaten as kartenDatenRoh,datumsZeilen,pdfAngabe,spaeterErschienen,abrufLuecke,dauer,suchtext,kartenDatum,istTermin,datum,nurTag,withTopics,anzeigeStatus,STATUS_STUNDEN,berlinTag,themenReihenfolge,quellenStand,gremienNamen,listenOrdnung,kommenderTermin} from '../src/ui/format';
import {MERK_SCHLUESSEL,merklisteLesen,istGemerkt,merken,vergessen,imBestand as merkImBestand,auffrischen,type Merkeintrag} from '../src/ui/gespeichert';
// Statischer Betrieb auf GitHub Pages: kein Server, kein Schlüssel. Die Seite liest den Stand,
// den der tägliche Lauf in bootstrap.json geschrieben hat. Alles, was einen Server braucht, entfällt.
const STATIC=process.env.NEXT_PUBLIC_STATIC==='1';
const REPO=process.env.NEXT_PUBLIC_REPO??'';
const labels:Record<string,string>={baseline:'Ausgangsstand',new:'Neu',changed:'Geändert',unchanged:'Unverändert'};
const ministryById=(id:string)=>MINISTRIES.find(m=>m.id===id);
const empty:Dashboard={items:[],sources:SOURCES,briefings:[],events:[],lobby:[],serverTime:'',scheduleEnabled:false};
const date=(s:string|null|undefined,full=false)=>datum(s,full);
// "ab heute" richtet sich nach Berliner Datum. Mit UTC gaelte zwischen Mitternacht und zwei Uhr
// morgens noch der Vortag, und ein Termin von gestern stuende weiter unter "Als Nächstes".
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date());
// Bei Terminen ist publishedAt der Sitzungstag, nicht der Tag einer Veroeffentlichung.
const isUpcoming=(i:Item)=>kommenderTermin(i,today());
const nurMitberatend=(i:Item)=>(i.nurMitberatend??[]).filter(c=>!i.committees.includes(c)).map(c=>committeeById(c)?.name).filter((n):n is string=>!!n);
// Altbestand aus einem Stand vor der Themensuche traegt das Feld noch nicht.
const topicsOf=(i:Item):TopicMatch[]=>i.topics??[];
const kartenDaten=(i:Item)=>kartenDatenRoh(i,d=>date(d));
// Die Beschriftung folgt der Adresse, nicht der Quelle: die Volltextsuche verweist auf eine
// Drucksache, nicht auf einen Vorgang. "Vorgang im DIP" stand frueher ueber beiden.
const quellenLabel=(i:Item)=>i.url.includes('dip.bundestag.de/vorgang/')?'Vorgang im DIP'
 :i.url.includes('dip.bundestag.de/drucksache/')?'Drucksache im DIP'
 :i.url.includes('dip.bundestag.de/')?'Im DIP suchen':'Originalquelle';
const bodies=(i:Item)=>[...i.committees.map(c=>committeeById(c)?.short),...i.ministries.map(m=>ministryById(m)?.short)].filter(Boolean) as string[];
const nav=[['overview','Lagebild',LayoutDashboard],['lobby','Akteure',Users],['committees','Ausschüsse',Landmark],['saved','Gespeichert',Bookmark],['sources','Quellen',Radio],['settings','Einstellungen',Settings]] as const;
type Connection={url:string;token:string};
async function request<T>(conn:Connection,path:string,method='GET',body?:unknown):Promise<T>{
 if(!conn.token)throw new Error('Bitte unter Einstellungen den Verbindungsschlüssel hinterlegen.');
 const url=conn.url.replace(/\/$/,'')+'/api/'+path;
 const headers:Record<string,string>={'Content-Type':'application/json'};headers.Authorization='Bearer '+conn.token;
 const r=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(300000)});if(!r.headers.get('content-type')?.includes('application/json'))throw new Error('Unter der Server-Adresse antwortet kein Monitoring-Server. Bitte Adresse prüfen oder den Server neu starten. Dein gespeicherter Stand bleibt erhalten.');const data=await r.json() as T & {error?:string};if(!r.ok)throw new Error(data.error??'Verbindung fehlgeschlagen');return data;
}
export default function Home(){
 const [data,setData]=useState<Dashboard>(empty),[view,setView]=useState('overview'),[selected,setSelected]=useState<Item|null>(null);
 const [gremium,setGremium]=useState<string|null>(null),[topic,setTopic]=useState(''),[alleTreffer,setAlleTreffer]=useState(false),[alleTermine,setAlleTermine]=useState(false),[query,setQuery]=useState(''),[source,setSource]=useState(''),[body,setBody]=useState(''),[after,setAfter]=useState(''),[status,setStatus]=useState<Change|''>(''),[docType,setDocType]=useState(''),[showArchive,setShowArchive]=useState(false),[filters,setFilters]=useState(false);
 const [conn,setConn]=useState<Connection>({url:'',token:''}),[draft,setDraft]=useState<Connection>({url:'',token:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[online,setOnline]=useState(false),[ready,setReady]=useState(false);
 const [versions,setVersions]=useState<{versions:Item[];diff:{added?:boolean;removed?:boolean;value:string}[]}|null>(null),[tab,setTab]=useState('detail');
 const [merkliste,setMerkliste]=useState<Merkeintrag[]>([]);
 const mainRef=useRef<HTMLElement>(null);
 // Auf dem Handy scrollt die ganze Seite, am Rechner nur der Inhaltsbereich. Zurueckgesetzt wurde nur der Inhaltsbereich: ein
 // Dokument aus der Mitte der Liste oeffnete sich auf dem Handy deshalb unten bei den Fundstellen, der PDF-Link lag darueber.
 // Beim Zurueckkehren steht die Liste wieder dort, wo man sie verlassen hat.
 const listenPosition=useRef(0);
 const scrollen=(y:number)=>{window.scrollTo(0,y);mainRef.current?.scrollTo(0,y);};
 function oeffnen(i:Item){listenPosition.current=Math.max(window.scrollY,mainRef.current?.scrollTop??0);setSelected(i);}
 // Nicht relativ zur Adresszeile: Next.js entfernt nach dem Start den Schraegstrich, sobald die Adresse einen
 // Parameter traegt. Aus "/trumpf-monitor/?x=1" wurde "/trumpf-monitor?x=1", der Abruf ging an
 // "/bootstrap.json" (404), und die App blieb leer - bei jedem geteilten Link mit ?fbclid= oder ?utm_.
 async function loadSnapshot(){const r=await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH??''}/bootstrap.json`,{cache:'no-store'});if(!r.ok)throw new Error('Stand nicht erreichbar');return await r.json() as Dashboard;}
 async function reload(){setBusy(true);setError('');try{setData(await loadSnapshot());setOnline(true);setNotice('Stand neu geladen.');}catch{setOnline(false);setError('Der gespeicherte Stand konnte nicht geladen werden. Bitte Internetverbindung prüfen.');}finally{setBusy(false);}}
 const cache=(d:Dashboard)=>{setData(d);try{localStorage.setItem('policy-cache',JSON.stringify(d));}catch{}};
 async function refresh(c=conn){setError('');try{const d=await request<Dashboard>(c,'dashboard');cache(d);setOnline(true);return true;}catch(e){setOnline(false);setError(e instanceof Error&&/timed? ?out|timeout|network|fetch/i.test(e.message)?'Die Verbindung dauert zu lange. Bitte Internetverbindung prüfen und erneut versuchen. Dein gespeicherter Stand bleibt erhalten.':e instanceof Error?e.message:'Keine Verbindung. Dein gespeicherter Stand bleibt erhalten.');return false;}}
 useEffect(()=>{let active=true;(async()=>{
 if(STATIC){try{const d=await loadSnapshot();if(active){setData(d);setOnline(true);}}catch{if(active)setError('Der gespeicherte Stand konnte nicht geladen werden. Bitte Seite neu laden.');}finally{if(active)setReady(true);}return;}
 let saved:Connection={url:'',token:''};try{saved=JSON.parse(localStorage.getItem('policy-connection')??'null')??saved;const cached=JSON.parse(localStorage.getItem('policy-cache')??'null');if(cached)setData(cached);}catch{}
 if(!saved.token){try{const r=await fetch('/connection.json');if(r.ok)saved=await r.json();}catch{}}
 try{if(!localStorage.getItem('policy-cache')){const r=await fetch('/bootstrap.json');if(r.ok&&active)setData(await r.json());}}catch{}
 if(!active)return;setConn(saved);setDraft(saved);setReady(true);if(saved.token)await refresh(saved);
 })();return()=>{active=false;};},[]);
 useEffect(()=>{if(selected){setTab('detail');setVersions(null);scrollen(0);}else scrollen(listenPosition.current);},[selected?.id]);
 useEffect(()=>{try{setMerkliste(merklisteLesen(localStorage.getItem(MERK_SCHLUESSEL)));}catch{}},[]);
 const merklisteSichern=(l:Merkeintrag[])=>{try{localStorage.setItem(MERK_SCHLUESSEL,JSON.stringify(l));return true;}catch{return false;}};
 // Gespeichert wird das ganze Dokument. Solange es im Bestand ist, haelt die Liste dessen neuesten Stand fest.
 useEffect(()=>{if(data.items.length)setMerkliste(l=>{const n=auffrischen(l,data.items);if(n!==l)merklisteSichern(n);return n;});},[data]);
 const gemerkt=(id:string)=>istGemerkt(merkliste,id);
 function merkenUmschalten(i:Item){
  const neu=gemerkt(i.id)?vergessen(merkliste,i.id):merken(merkliste,i);
  if(!merklisteSichern(neu)){setError('Speichern nicht möglich: Dieser Browser erlaubt der Seite keinen lokalen Speicher, etwa im privaten Modus.');return;}
  // Keine Meldung: sie schob den PDF-Knopf unter den Bildschirmrand. Der Knopf selbst zeigt den Zustand.
  setMerkliste(neu);
 }
 const gespeicherte=merkliste.map(e=>{const aktuell=merkImBestand(e,data.items);return {...e,item:aktuell??e.item,imBestand:!!aktuell};});
 useEffect(()=>{if(!ready)return;const onVisible=()=>{if(document.visibilityState==='visible'&&conn.token)void refresh();};document.addEventListener('visibilitychange',onVisible);return()=>document.removeEventListener('visibilitychange',onVisible);},[ready,conn.url,conn.token]);
 const latest=data.briefings[0];
 // Der Zeitpunkt des letzten Quellenabrufs steht im Quellenstatus. Er ist der ehrlichere Wert als
 // der Zeitstempel des Briefings, weil er auch dann stimmt, wenn ein Lauf nichts gefunden hat.
 const lastCheck=data.sources.map(s=>s.checkedAt).filter(Boolean).sort().at(-1);
 // Sortiert nach eigenem Eintrag, dann der Zahl der Vorhaben MIT Themenbezug, dann der Themenbreite - die
 // gemeldete Gesamtzahl sagt wenig: ein Verband mit 200 Vorhaben kann keines zu deinen Themen führen.
 // Ohne Themenfilter zaehlt die mitgefuehrte Gesamtzahl, mit Filter nur die gespeicherten Treffer.
 const trefferVorhaben=(e:{projectList?:LobbyProject[];topicProjects?:number})=>
  topic?withTopics(e.projectList??[]).filter(v=>v.topics.includes(topic)).length
       :(e.topicProjects??withTopics(e.projectList??[]).length);
 const lobby=(data.lobby??[]).filter(e=>!topic||e.topics.includes(topic))
  .sort((a,b)=>Number(b.own)-Number(a.own)||trefferVorhaben(b)-trefferVorhaben(a)||b.topics.length-a.topics.length||a.name.localeCompare(b.name,'de'));
 // Das Register meldet Spannen in Zehntausenderschritten. Ohne Nachkommastellen fallen Unter- und
 // Obergrenze in der kompakten Schreibweise zusammen ("6 Mio.–6 Mio.").
 const geld=(e:{spendFrom:number|null;spendTo:number|null})=>{
  if(e.spendFrom===null)return null;
  const f=(n:number)=>new Intl.NumberFormat('de-DE',{notation:'compact',maximumFractionDigits:n>=1e6?2:0}).format(n);
  const von=f(e.spendFrom),bis=f(e.spendTo??e.spendFrom);
  return (von===bis?von:`${von}–${bis}`)+' €';
 };
 const types=[...new Set(data.items.map(i=>i.documentType))].sort((a,b)=>a.localeCompare(b,'de'));
 const inTopic=(i:Item)=>!topic||topicsOf(i).some(m=>m.topic===topic);
 const matches=data.items.filter(i=>i.archived===showArchive&&inTopic(i)&&(!source||i.sourceId===source)&&(!body||i.committees.includes(body)||i.ministries.includes(body))&&(!status||anzeigeStatus(i)===status)&&(!docType||i.documentType===docType)&&(!after||berlinTag(recency(i))>=after)&&(!query||suchtext(i,gremienNamen(i)).includes(query.trim().toLowerCase()))).sort(listenOrdnung(today()));
 // Termine tragen nur einen kurzen Titel und treffen das Themenraster so gut wie nie. Der Filter
 // wuerde den Kalender bei jeder Auswahl leeren, deshalb bleibt er vollstaendig - und sagt das.
 const upcoming=data.items.filter(i=>!i.archived&&isUpcoming(i)).sort((a,b)=>a.publishedAt!.localeCompare(b.publishedAt!));
 const relevant=data.items.filter(i=>!i.archived&&topicsOf(i).length).sort(listenOrdnung(today()));
 const topicCount=(id:string)=>data.items.filter(i=>!i.archived&&topicsOf(i).some(m=>m.topic===id)).length;
 const shown=topic?relevant.filter(inTopic):relevant;
 // Der Themenfilter ist eine Brille auf den Bestand und muss ueberall gelten, wo Dokumente gezaehlt
 // werden. Vorher blieb er in der Gremienansicht wirkungslos, war aber weiter aktiv - die Zahlen dort
 // widersprachen denen im Lagebild.
 // Die Quellenansicht zeigte nur, wie viele Eintraege der letzte Abruf lieferte. Das las sich wie
 // der Beitrag der Quelle zur App, war es aber nicht: die Terminliste meldete 76 und stand mit 7
 // in der App, die Volltextsuche meldete 6 und stand mit 62 darin. Beide Zahlen gehoeren nebeneinander.
 const imBestand=(id:string)=>data.items.filter(i=>!i.archived&&i.sourceId===id).length;
 const activeIn=(id:string)=>data.items.filter(i=>!i.archived&&inTopic(i)&&(i.committees.includes(id)||i.ministries.includes(id)));
 // Die Volltextsuche findet Papiere, die keinem ausgewaehlten Gremium zugewiesen sind. Ohne diesen
 // Hinweis ergaeben die Zahlen auf den Karten weniger als die Gesamtzahl der Dokumente.
 const ohneGremium=data.items.filter(i=>!i.archived&&inTopic(i)&&!i.committees.length&&!i.ministries.length);
 // Frueher hiess es pauschal "aus der Volltextsuche" - drei der Papiere kamen aber aus der
 // Ausfuhrkontrolle. Die Quellen werden deshalb aus dem Bestand abgeleitet statt benannt.
 const quellenOhneGremium=[...new Set(ohneGremium.map(i=>i.sourceId))]
  .map(id=>SOURCES.find(q=>q.id===id)?.name).filter(Boolean)
  .reduce((t,n,i,a)=>i===0?String(n):i===a.length-1?`${t} und ${n}`:`${t}, ${n}`,'');
 async function run(){setBusy(true);setError('');setNotice('Quellen werden geprüft …');try{const r=await request<{briefing:Briefing}>(conn,'run','POST');await refresh();setNotice(r.briefing.summary);}catch(e){setNotice('');setError(e instanceof Error?e.message:'Quellenlauf fehlgeschlagen.');}finally{setBusy(false);}}
 function navigate(to:string){listenPosition.current=0;setSelected(null);setGremium(null);setView(to);setNotice('');scrollen(0);}
 // Ein Klick auf ein Gremium oeffnet dessen eigene Liste, statt gefiltert auf die Startseite zu springen.
 function openBody(id:string){listenPosition.current=0;setGremium(id);setSelected(null);scrollen(0);}
 const gremiumItems=gremium?data.items.filter(i=>!i.archived&&inTopic(i)&&(i.committees.includes(gremium)||i.ministries.includes(gremium))).sort(listenOrdnung(today())):[];
 const gremiumInfo=gremium?committeeById(gremium)??ministryById(gremium):undefined;
 async function saveConnection(){try{const u=new URL(draft.url||window.location.origin);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('Bitte eine gültige Server-Adresse eingeben.');const next={url:u.origin,token:draft.token.trim()};if(!next.token)throw new Error('Verbindungsschlüssel fehlt.');setBusy(true);if(await refresh(next)){localStorage.setItem('policy-connection',JSON.stringify(next));setConn(next);setNotice('Verbindung gespeichert.');}}catch(e){setError(e instanceof Error?e.message:'Verbindung ungültig.');}finally{setBusy(false);}}
 // Die gespeicherte Liste als Text, zum Weitergeben oder Sichern. Dieselben Datumszeilen wie die Dokumentansicht.
 async function exportGespeichert(){
 const eintrag=(i:Item)=>[i.title,`${i.documentType}${i.step&&i.step!==i.documentType?' · '+i.step:''}${i.documentNumber?' · Drucksache '+i.documentNumber:''}`,...datumsZeilen(i).map(([k,v])=>`${k}: ${v}`),i.lead?`${istTermin(i)?'Ausschuss':'Federführend'}: ${committeeById(i.lead)?.name}`:'',bodies(i).length?`Gremien: ${bodies(i).join(', ')}`:'',topicsOf(i).length?`Themen: ${topicsOf(i).map(m=>topicById(m.topic)?.label).filter(Boolean).join(', ')}`:'',i.originator?`Urheber: ${i.originator}`:'',`Quelle: ${i.url}`,i.pdfUrl?`PDF: ${i.pdfUrl}`:''].filter(Boolean).join('\n');
 const text=['POLICY MONITOR · Gespeicherte Dokumente',`Stand ${date(new Date().toISOString(),true)} · ${gespeicherte.length} ${gespeicherte.length===1?'Dokument':'Dokumente'}`,
 ...gespeicherte.map(e=>`${eintrag(e.item)}\nGespeichert am: ${date(e.gespeichertAm,true)}`)].join('\n\n');
 try{if(navigator.share){await navigator.share({title:'Gespeicherte Dokumente',text});}else{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`Gespeichert-${today()}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(e){if((e as Error).name!=='AbortError')setError('Export fehlgeschlagen.');}}
 async function toggleArchive(item:Item){setBusy(true);try{await request(conn,'items/'+item.id,'PATCH',{archived:!item.archived});await refresh();setSelected({...item,archived:!item.archived});setNotice(item.archived?'Dokument wiederhergestellt.':'Dokument archiviert.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function loadHistory(){setTab('history');try{setVersions(await request(conn,'history/'+selected!.id));}catch(e){setError((e as Error).message);}}
 // Eine Leiste, zwei Ansichten: sonst gilt der Filter dort, wo er nicht sichtbar ist.
 const themenleiste=(zaehl:(id:string)=>number)=><div className="topicbar">{TOPICS.map(t=>{const n=zaehl(t.id);return <button key={t.id} className={'topicchip'+(topic===t.id?' chosen':'')+(n?'':' leer')} aria-pressed={topic===t.id} disabled={!n} onClick={()=>setTopic(topic===t.id?'':t.id)} title={t.why}>{t.label}<span>{n}</span></button>;})}{topic&&<button className="topicchip reset" onClick={()=>setTopic('')}>Alle Themen <X size={13}/></button>}</div>;
 const lead=selected?.lead?committeeById(selected.lead):undefined;
 const detailStatus=selected?anzeigeStatus(selected):'unchanged';
 const pdfZustand=selected?pdfAngabe(selected):null;
 const verspaetet=selected?spaeterErschienen(selected):null;
 const nichtImBestand=!!selected&&data.items.length>0&&!data.items.some(i=>i.id===selected.id);
 const luecke=STATIC?abrufLuecke(lastCheck):null;
 return <><Head><title>Policy Monitor · TRUMPF</title><meta name="description" content="Neue Dokumente aus ausgewählten Bundestagsausschüssen und Ressorts"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><meta name="theme-color" content="#173fe2"/><link rel="icon" href="icon.svg" type="image/svg+xml"/><link rel="apple-touch-icon" href="icon-180.png"/><link rel="manifest" href="manifest.webmanifest"/><meta name="apple-mobile-web-app-title" content="Policy Monitor"/><meta name="apple-mobile-web-app-capable" content="yes"/>
 {/* Notgestaltung direkt in der Seite. Faellt das ausgelagerte Stylesheet einmal aus - etwa weil eine
     zwischengespeicherte Seite ein Buendel sucht, das es nicht mehr gibt -, bleibt die App lesbar
     statt als roher Text zu erscheinen. */}
 <style dangerouslySetInnerHTML={{__html:'html,body{margin:0;background:#f4f6f9;color:#18213b;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.55}h1{font-size:32px;letter-spacing:-1px}h2{font-size:20px}a{color:#173fe2}button{font:inherit;cursor:pointer}'}}/></Head>
 <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brandmark"><Radar size={27}/></div><div><strong>TRUMPF</strong><span>PUBLIC POLICY</span></div></div><div className="workspace">MONITORING WORKSPACE</div><nav aria-label="Hauptnavigation">{nav.map(([id,label,Icon])=><button key={id} className={view===id?'active':''} onClick={()=>navigate(id)}><Icon size={20}/><span>{label}</span>{view===id&&<span className="nav-dot"/>}</button>)}</nav><div className="sidebar-bottom"><ShieldCheck size={21}/><div><strong>Amtliche Quellen</strong><span>Anzeigen, nicht bewerten</span></div></div></aside>
 <main ref={mainRef} className="main"><header className="topbar"><div className="mobile-brand"><Radar size={22}/><b>TRUMPF</b><span>Policy Monitor</span></div><div className="breadcrumb">Public Policy <ChevronRight size={14}/> {nav.find(n=>n[0]===view)?.[1]}</div><div className={'connection '+(online?'connected':'')}><span/>{STATIC?(lastCheck?'Stand '+date(lastCheck,true):'Kein Stand geladen'):online?'Verbunden':data.items.length?'Gespeicherter Stand':'Noch nicht verbunden'}</div></header>
 <div className="content">{error&&<div className="notice error" role="alert"><AlertCircle size={19}/><span>{error}</span><button aria-label="Meldung schließen" onClick={()=>setError('')}><X size={17}/></button></div>}{notice&&<div className="notice" role="status"><Check size={19}/><span>{notice}</span></div>}
 {gremium&&!selected?<><button className="back" onClick={()=>setGremium(null)}><ArrowLeft size={18}/> Zurück zur Übersicht</button>
 <div className="detail-heading"><div className="eyebrow">{gremiumInfo&&'institution' in gremiumInfo?gremiumInfo.institution:'Ressort'}</div><h1>{gremiumInfo?.name}</h1><p className="muted">{gremiumInfo?.scope}</p></div>
 <section className="results"><div className="section-heading"><h2>Dokumente <span>{gremiumItems.length}</span></h2><span className="muted">{gremiumItems.some(i=>kommenderTermin(i,today()))?'Angekündigte Termine zuerst, dann nach letzter Bewegung':'Nach letzter Bewegung'} · Bewegungen der letzten 10 Tage</span></div>
 {gremiumItems.length?<div className="item-list">{gremiumItems.map(i=><ItemCard key={i.id} item={i} gemerkt={gemerkt(i.id)} onClick={()=>oeffnen(i)}/>)}</div>:
 <div className="empty"><Landmark size={36}/><h3>Keine Dokumente im Zeitraum</h3><p>Aus diesem Gremium ist in den letzten 10 Tagen nichts eingegangen. Das ist eine Aussage über den Zeitraum, nicht über das Gremium.</p></div>}</section></>:
 selected?<><button className="back" onClick={()=>setSelected(null)}><ArrowLeft size={18}/> Zurück</button><div className="detail-heading"><div className="eyebrow">{lead?lead.name:selected.institution} · {selected.documentType}</div><h1>{selected.title}</h1><div className="tags"><span className={'badge '+detailStatus}>{labels[detailStatus]}</span>{selected.documentNumber&&<span className="badge neutral">Drucksache {selected.documentNumber}</span>}{selected.step&&<span className="badge neutral">{selected.step}</span>}{selected.archived&&<span className="badge neutral">Archiviert</span>}</div><button className={'button merken '+(gemerkt(selected.id)?'secondary':'primary')} aria-pressed={gemerkt(selected.id)} onClick={()=>merkenUmschalten(selected)}>{gemerkt(selected.id)?<><BookmarkCheck size={17}/>Gespeichert</>:<><Bookmark size={17}/>Speichern</>}</button>{nichtImBestand&&<p className="muted">Nicht mehr im aktuellen Bestand – die App löscht nach zehn Tagen. Gezeigt wird der gespeicherte Stand.</p>}</div><div className="detail-tabs"><button className={tab==='detail'?'active':''} onClick={()=>setTab('detail')}>Dokument & Quelle</button>{!STATIC&&<button className={tab==='history'?'active':''} onClick={loadHistory}>Versionen & Änderungen</button>}</div>
 {tab==='detail'?<div className="detail-grid"><section className="panel"><div className="eyebrow">DAS PAPIER</div><h2>{selected.documentType}{selected.step&&selected.step!==selected.documentType?` · ${selected.step}`:''}</h2>{selected.text&&<p className="source-text">{selected.text}</p>}<div className="doc-links">{selected.pdfUrl&&(pdfZustand?.abrufbar===false?<span className="button secondary gesperrt" aria-disabled="true"><FileDown size={17}/>PDF noch nicht online</span>:<a href={selected.pdfUrl} target="_blank" rel="noopener noreferrer" className="button primary"><FileDown size={17}/>Amtliches PDF öffnen</a>)}<a href={selected.url} target="_blank" rel="noopener noreferrer" className="button secondary"><ArrowUpRight size={17}/>{quellenLabel(selected)}</a></div><hr/><dl>{[['Drucksachennummer',selected.documentNumber??(selected.documentType==='Plenarprotokoll'?'Keine – die Fundstelle ist ein Plenarprotokoll':'Nicht in der Quelle angegeben')],['Verfahrensschritt',selected.step??'Nicht in der Quelle angegeben'],['Vorgangstyp',selected.procedure??'Nicht in der Quelle angegeben'],['Urheber',selected.originator??'Nicht in der Quelle angegeben'],...datumsZeilen(selected)].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{verspaetet&&<div className="notice"><Clock size={19}/><span><strong>Warum erst jetzt?</strong> {verspaetet}</span></div>}<span className="muted">Angezeigt werden die Angaben der amtlichen Quelle und, wo ein Thema vorkommt, die Fundstelle im Text. Bewertet wird nichts.</span></section>
 {!!topicsOf(selected).length&&<section className="panel fundstellen"><div className="eyebrow">FUNDSTELLEN</div><h2>Wo die Themen vorkommen</h2><p className="muted">Die Suche hat diese Begriffe im Titel oder Volltext gefunden. Ob der Fund für TRUMPF etwas bedeutet, entscheidet die Lektüre.</p>
 {themenReihenfolge(topicsOf(selected),topic).map(m=><div className="fund" key={m.topic}><div className="fund-kopf"><strong>{topicById(m.topic)?.label}</strong><span>{m.count} {m.count===1?'Fundstelle':'Fundstellen'}{m.inTitle?' · im Titel':''}</span></div><p className="fund-why">{topicById(m.topic)?.why}</p><blockquote className="beleg"><Quote size={13}/><span>{m.snippet}</span></blockquote><span className="muted">Gefunden über: {m.terms.join(', ')}</span></div>)}</section>}
 <aside className="panel"><h2>Gremien</h2>{lead&&<div className="body-block"><span className="badge lead">{istTermin(selected)?'Veranstaltet die Sitzung':'Federführend'}</span><strong>{lead.name}</strong><p>{lead.scope}</p></div>}
 {selected.committees.filter(c=>c!==selected.lead).map(c=>{const k=committeeById(c);return k?<div className="body-block" key={c}><span className="badge neutral">Mitberatend</span><strong>{k.name}</strong><p>{k.scope}</p></div>:null;})}
 {selected.ministries.map(m=>{const k=ministryById(m);return k?<div className="body-block" key={m}><span className="badge channel">Ressort</span><strong>{k.name}</strong><p>{k.scope}</p></div>:null;})}
 {!selected.committees.length&&!selected.ministries.length&&<p className="muted">Diese Quelle liefert keine Gremienzuordnung.</p>}
 {nurMitberatend(selected).length>0&&<p className="muted">Laut DIP beraten außerdem mit: {nurMitberatend(selected).join(', ')}. Querschnittsausschüsse führt die App bei Vorlagen nur federführend; in deren Karten erscheint dieser Vorgang deshalb nicht.</p>}
 <hr/><dl>{[['Zuletzt abgerufen',date(selected.lastSeen,true)],['Version',String(selected.version)]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
 {!STATIC&&<button className="button secondary full" disabled={busy||!online} onClick={()=>toggleArchive(selected)}><Archive size={17}/>{selected.archived?'Wiederherstellen':'Archivieren'}</button>}</aside></div>:
 <section className="panel"><h2>Änderung zur Vorversion</h2>{!versions?<p>Versionsverlauf wird geladen. Bei fehlender Verbindung bitte erneut versuchen.</p>:versions.versions.length<2?<p>{selected.version>1?'Für dieses Dokument liegt nur ein gespeicherter Stand vor. Der Verlauf wurde beim Wiederaufbau der Datenbank gekürzt; ab der nächsten Änderung ist wieder ein Vergleich möglich.':'Es liegt ein Ausgangsstand vor. Ein Vergleich ist ab der zweiten Version möglich.'}</p>:<><div className="diff">{versions.diff.map((part,i)=><span key={i} className={part.added?'added':part.removed?'removed':''}>{part.value}</span>)}</div><p className="muted">Grün: hinzugefügt · Rot: entfernt. Verglichen werden Titel, Dokumenttyp, Verfahrensschritt und Drucksachennummer.</p></>}{versions?.versions.map(v=><details key={v.version}><summary>Version {v.version} · {date(v.changedAt,true)}</summary><p>{v.title}</p><p>{v.documentType}{v.step?' · '+v.step:''}{v.documentNumber?' · Drucksache '+v.documentNumber:''}</p><p>Datum: {date(v.publishedAt)}</p><code>SHA-256: {v.hash}</code></details>)}</section>}</>:
 view==='overview'?<><div className="page-heading"><div><div className="eyebrow">THEMENTREFFER AUS AMTLICHEN QUELLEN</div><h1>Wo TRUMPF-Themen vorkommen.</h1><p>Dokumente, in denen die TRUMPF-Themen vorkommen. Mit Fundstelle und Quelle, ohne Bewertung.</p></div>{STATIC?<button className="button primary" onClick={reload} disabled={busy}><RefreshCw size={17} className={busy?'spin':''}/>{busy?'Wird geladen …':'Stand neu laden'}</button>:<button className="button primary" onClick={run} disabled={busy||!conn.token}><RefreshCw size={17} className={busy?'spin':''}/>{busy?'Prüfung läuft …':'Quellen prüfen'}</button>}</div>
 {luecke!==null&&<div className="notice warnung" role="status"><Clock size={20}/><span><strong>Der letzte Abruf liegt {dauer(luecke)} zurück.</strong> Geplant ist er alle 10 Minuten, GitHub führt geplante Läufe aber nicht zuverlässig aus. Neue Dokumente können deshalb fehlen.{REPO&&<> <a href={`https://github.com/${REPO}/actions/workflows/monitor.yml`} target="_blank" rel="noopener noreferrer">Abruf auf GitHub starten</a></>}</span></div>}
 <section className="briefing-hero"><div className="hero-top"><span className="eyebrow light"><Target size={15}/> THEMENBEZUG</span><span className="hero-time"><Clock size={14}/>{lastCheck?date(lastCheck,true):'Noch kein Quellenlauf'}</span></div>
 <h2>{topic
  ?`${shown.length} ${shown.length===1?'Dokument nennt':'Dokumente nennen'} ${topicById(topic)?.label}.`
  :relevant.length?`${relevant.length} von ${data.items.filter(i=>!i.archived).length} Dokumenten ${relevant.length===1?'nennt':'nennen'} ein TRUMPF-Thema.`
  :'Noch kein Dokument mit einem der Themenbegriffe.'}</h2>
 <p>Durchsucht werden Titel und – wo die Quelle ihn führt – der Volltext. Ein Treffer ist eine Fundstelle, keine Einschätzung: die App zeigt den Begriff und seinen Zusammenhang.</p>
 <div className="hero-bottom"><span>{latest?.summary??'Noch kein Quellenlauf.'}</span><button onClick={()=>navigate('sources')}>Quellen ansehen <ArrowUpRight size={18}/></button></div></section>
 {themenleiste(topicCount)}
 {!showArchive&&<section className="results"><div className="section-heading"><h2><Target size={19}/> Thementreffer <span>{shown.length}</span></h2><span className="muted">{topic?topicById(topic)?.why:`${shown.some(i=>kommenderTermin(i,today()))?'Angekündigte Termine zuerst, dann nach letzter Bewegung':'Nach letzter Bewegung'} · Bewegungen der letzten 10 Tage`}</span></div>
 {shown.length?<><div className="item-list">{(alleTreffer?shown:shown.slice(0,8)).map(item=><TopicCard key={item.id} item={item} thema={topic} gemerkt={gemerkt(item.id)} onClick={()=>oeffnen(item)}/>)}</div>
 {shown.length>8&&<button className="text-button" onClick={()=>setAlleTreffer(!alleTreffer)}>{alleTreffer?'Weniger zeigen':`Alle ${shown.length} Thementreffer zeigen`}</button>}</>:
 <div className="empty"><Target size={36}/><h3>Kein Dokument mit diesen Begriffen</h3><p>{data.items.length?'Im erfassten Zeitraum kam keiner der Suchbegriffe vor. Das ist eine Aussage über die Begriffe, nicht über die Lage.':'Starte den ersten Quellenlauf.'}</p></div>}</section>}
 {!!upcoming.length&&!showArchive&&<section className="upcoming"><div className="section-heading"><h2><CalendarDays size={19}/> Als Nächstes <span>{upcoming.length}</span></h2><span className="muted">Sitzungen und Anhörungen ab heute{topic?' · unabhängig vom Themenfilter':''}</span></div><div className="upcoming-list">{(alleTermine?upcoming:upcoming.slice(0,6)).map(i=><button key={i.id} className="upcoming-card" onClick={()=>oeffnen(i)}><span className="upcoming-date">{new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'short',timeZone:nurTag(i.publishedAt!)?'UTC':'Europe/Berlin'}).format(new Date(i.publishedAt!))}</span><strong>{i.title}</strong><span className="upcoming-body">{i.lead?committeeById(i.lead)?.name:i.institution}</span></button>)}</div>{upcoming.length>6&&<button className="text-button" onClick={()=>setAlleTermine(!alleTermine)}>{alleTermine?'Weniger zeigen':`Alle ${upcoming.length} Termine zeigen`}</button>}</section>}
 <section className="results"><div className="section-heading"><h2>{showArchive?'Archiv':'Alle erfassten Dokumente'} <span>{matches.length}</span></h2>{!STATIC&&<button className="text-button" onClick={()=>{setShowArchive(!showArchive);setStatus('');}}><Archive size={16}/>{showArchive?'Aktive Dokumente':'Archiv'}</button>}</div><div className="search-row"><label className="search"><Search size={18}/><input aria-label="Dokumente durchsuchen" placeholder="Titel, Drucksachennummer, Thema oder Ausschuss suchen" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')} aria-label="Suche löschen"><X size={16}/></button>}</label><button className={'filter-button '+(filters?'selected':'')} onClick={()=>setFilters(!filters)}><SlidersHorizontal size={18}/><span>Filter</span></button></div>
 {filters&&<div className="filters"><label>Ausschuss oder Ressort<select value={body} onChange={e=>setBody(e.target.value)}><option value="">Alle ausgewählten Gremien</option><optgroup label="Ausschüsse">{COMMITTEES.map(c=><option key={c.id} value={c.id}>{c.short}</option>)}</optgroup><optgroup label="Ressorts">{MINISTRIES.map(m=><option key={m.id} value={m.id}>{m.short}</option>)}</optgroup></select></label><label>Dokumenttyp<select value={docType} onChange={e=>setDocType(e.target.value)}><option value="">Alle Dokumenttypen</option>{types.map(t=><option key={t} value={t}>{t}</option>)}</select></label><label>Quelle<select value={source} onChange={e=>setSource(e.target.value)}><option value="">Alle Quellen</option>{data.sources.filter(s=>s.kind!=='lobby').map(s=><option key={s.id} value={s.id}>{s.institution} · {s.name}</option>)}</select></label><label>Status der letzten {STATUS_STUNDEN} Stunden<select value={status} onChange={e=>setStatus(e.target.value as Change|'')}><option value="">Alle Status</option>{(['baseline','new','changed','unchanged'] as Change[]).map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label><label>Thema<select value={topic} onChange={e=>setTopic(e.target.value)}><option value="">Alle Themen</option>{TOPICS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label>Letzte Bewegung ab<input type="date" value={after} onChange={e=>setAfter(e.target.value)}/></label><button className="text-button" onClick={()=>{setSource('');setBody('');setStatus('');setDocType('');setAfter('');setQuery('');setTopic('');}}>Zurücksetzen</button></div>}
 {body&&<button className="active-filter" onClick={()=>setBody('')}>{committeeById(body)?.short??ministryById(body)?.short} <X size={14}/></button>}
 <div className="item-list">{matches.map(item=><ItemCard key={item.id} item={item} gemerkt={gemerkt(item.id)} onClick={()=>oeffnen(item)}/>)}{!matches.length&&<div className="empty"><Radar size={40}/><h3>{data.items.length?'Keine passenden Dokumente':'Noch kein Quellenstand'}</h3><p>{data.items.length?'Passe die Suche oder Filter an.':'Starte den ersten Quellenlauf, um die amtlichen Veröffentlichungen zu laden.'}</p>{!STATIC&&!conn.token&&<button className="button secondary" onClick={()=>navigate('settings')}>Verbindung einrichten</button>}</div>}</div></section><div className="footnote"><ShieldCheck size={16}/><span>Keine Meldung ist kein Entwarnungsnachweis. Die Anzeige gilt nur für die ausgewählten Gremien, die Themensuche in den Drucksachen und die erfolgreich erfassten Quellen.</span></div></>:
 view==='lobby'?<><div className="page-heading"><div><div className="eyebrow">AMTLICHES LOBBYREGISTER</div><h1>Wer sich einsetzt.</h1><p>Registrierte Interessenvertretung zu deinen Themen. Selbstauskunft aus dem Register, ohne Bewertung.</p></div></div>
 <div className="notice"><ShieldCheck size={20}/><span><strong>Wozu diese Seite?</strong> Sie zeigt, an welchen Gesetzesvorhaben registrierte Interessenvertreter nach eigener Angabe arbeiten — Verbände, Unternehmen, Forschungseinrichtungen. Nennt das Register eine Drucksache, ist sie verlinkt; die meisten Vorhaben sind Positionen ohne eigenes Papier. Quelle ist die Selbstauskunft im amtlichen Register: es zeigt, wer sich <strong>registriert</strong> hat, nicht wer tatsächlich Einfluss nimmt.</span></div>
 {themenleiste(id=>(data.lobby??[]).filter(e=>e.topics.includes(id)).length)}
 <section className="results"><div className="section-heading"><h2><Users size={19}/> Akteure <span>{lobby.length}</span></h2><span className="muted">Eigener Eintrag zuerst, dann nach Vorhaben zu deinen Themen und nach Themenbreite</span></div>
 {lobby.length?<div className="item-list">{lobby.map(e=><div key={e.registerNumber} className={'lobby-card'+(e.own?' eigen':'')}>
  <a className="lobby-kopf" href={e.url} target="_blank" rel="noopener noreferrer"><div><strong>{e.name}</strong><span className="lobby-typ">{e.kind}{e.own&&' · eigener Eintrag'}</span></div><ArrowUpRight size={17}/></a>
  <div className="tags">{e.topics.map(id=><span key={id} className="badge topic">{topicById(id)?.label}</span>)}</div>
  <div className="lobby-zahlen">
   <span><FileText size={14}/>{e.projects} Vorhaben gemeldet</span>
   {e.statements>0&&<span><Quote size={14}/>{e.statements} Stellungnahme{e.statements===1?'':'n'}</span>}
   {e.staffFte!==null&&<span><Users size={14}/>{e.staffFte.toLocaleString('de-DE')} Vollzeitstelle{e.staffFte===1?'':'n'}</span>}
   {geld(e)&&<span><Euro size={14}/>{geld(e)}{e.fiscalYear?` (${e.fiscalYear})`:''}</span>}
   {e.updatedAt&&<span><Clock size={14}/>Stand {date(e.updatedAt)}</span>}
  </div>
  {(() => {const vs=withTopics(e.projectList??[]).filter((v:LobbyProject)=>!topic||v.topics.includes(topic));
   // Die Karte zeigt vier und nennt den Rest. Ohne Themenfilter ist "Rest" die gezaehlte Gesamtzahl,
   // die auch die von der Kappung nicht mitgefuehrten Vorhaben einschliesst.
   const gesamt=topic?vs.length:Math.max(vs.length,e.topicProjects??vs.length);
   // Unter Themenfilter hiess es "keines davon zu deinen Themen" - auch auf der Karte von TRUMPF, deren fuenf Vorhaben
   // alle deine Themen beruehren, nur nicht Laser. 52 Karten sagten unter einem Filter so etwas Falsches.
   const andere=withTopics(e.projectList??[]).length;
   if(!vs.length)return e.projects>0?<p className="lobby-felder">{e.projects} Vorhaben gemeldet{topic?<>, keines zum Thema {topicById(topic)?.label}{andere?` – ${andere} zu anderen deiner Themen`:''}.</>:', keines davon zu deinen Themen.'}</p>:null;
   return <div className="vorhaben"><span className="vorhaben-kopf">Arbeitet an diesen Vorhaben zu deinen Themen</span>
    {vs.slice(0,4).map((v:LobbyProject)=>{const ziel=v.documentUrl??v.projectUrl;
     const inhalt=<><strong>{v.title}</strong><span>{v.topics.map(id=>topicById(id)?.label).filter(Boolean).join(' · ')}{v.printingNumber?` · Drucksache ${v.printingNumber}`:''}{ziel?' ':''}{ziel&&<ArrowUpRight size={12}/>}</span></>;
     return ziel
      ? <a className="vorhaben-zeile verlinkt" key={v.number} href={ziel} target="_blank" rel="noopener noreferrer">{inhalt}</a>
      : <div className="vorhaben-zeile" key={v.number}>{inhalt}</div>;})}
    {gesamt>4&&<span className="vorhaben-mehr">und {gesamt-4} weitere{gesamt-4===1?'s':''}</span>}</div>;})()}
  {!!e.fields.length&&<p className="lobby-felder">{e.fields.join(' · ')}</p>}
 </div>)}</div>:
 <div className="empty"><Users size={36}/><h3>Keine Einträge</h3><p>{data.lobby?.length?'Zu diesem Thema ist niemand mit mindestens zwei deiner Themen registriert.':'Noch kein Quellenlauf, oder das Register war nicht erreichbar.'}</p></div>}</section></>:
 view==='committees'?<><div className="page-heading"><div><div className="eyebrow">DIE AUSWAHL</div><h1>Ausschüsse & Ressorts.</h1><p>Nur diese Gremien werden überwacht. Daneben durchsucht die App alle Drucksachen nach den TRUMPF-Themen — diese Treffer kommen unabhängig vom Gremium herein.</p></div></div>
 <div className="notice"><ShieldCheck size={20}/><span>Die Auswahl der Gremien und die Liste der Themenbegriffe sind die einzigen inhaltlichen Entscheidungen des Systems. Einzelne Dokumente werden danach nicht mehr gewichtet.</span></div>
 <div className="notice"><Landmark size={20}/><span><strong>Bei Vorlagen zählen {COMMITTEES.filter(c=>c.leadOnly).length} dieser Gremien nur, wenn sie federführend sind.</strong> Querschnittsausschüsse wie Finanzen, Haushalt oder Recht werden nahezu jeder Vorlage mitberatend zugewiesen; ihre Mitberatung sagt nichts über den Inhalt. Ein Blick ins DIP zeigt deshalb oft mehr Ausschüsse als diese App. Ihre eigenen Sitzungen und Anhörungen erscheinen immer.</span></div>
 {themenleiste(id=>data.items.filter(i=>!i.archived&&topicsOf(i).some(m=>m.topic===id)).length)}
 {!!ohneGremium.length&&<div className="notice"><Target size={20}/><span><strong>{ohneGremium.length} von {data.items.filter(i=>!i.archived&&inTopic(i)).length} Dokumenten</strong> {ohneGremium.length===1?'ist keinem dieser Gremien zugewiesen; es stammt aus':'sind keinem dieser Gremien zugewiesen; sie stammen aus'} {quellenOhneGremium}. {ohneGremium.length===1?'Es erscheint':'Sie erscheinen'} deshalb in keiner der Karten, aber im Lagebild und unter „Alle erfassten Dokumente“.</span></div>}
 {(['Bundestag','Bundesrat'] as const).map(inst=><section className="body-section" key={inst}><h2>{inst}</h2><div className="body-grid">{COMMITTEES.filter(c=>c.institution===inst).map(c=>{const items=activeIn(c.id),stand=kartenDatum(items,today());return <button className="body-card" key={c.id} onClick={()=>openBody(c.id)}><div className="body-top"><Landmark size={19}/><strong>{items.length}</strong></div><h3>{c.name}</h3><p>{c.scope}</p>{c.leadOnly&&<span className="nur-ff">Vorlagen nur federführend</span>}<span className="body-foot">{stand?`${stand.wort} ${date(stand.stamp)}`:'nichts im Zeitraum'} <ChevronRight size={15}/></span></button>;})}</div></section>)}
 <section className="body-section"><h2>Ressorts</h2><div className="body-grid">{MINISTRIES.map(m=>{const items=activeIn(m.id),stand=kartenDatum(items,today());return <button className="body-card" key={m.id} onClick={()=>openBody(m.id)}><div className="body-top"><Building2 size={19}/><strong>{items.length}</strong></div><h3>{m.name}</h3><p>{m.scope}</p><span className="body-foot">{stand?`${stand.wort} ${date(stand.stamp)}`:'nichts im Zeitraum'} <ChevronRight size={15}/></span></button>;})}</div></section></>:
 view==='saved'?<><div className="page-heading"><div><div className="eyebrow">DEINE ABLAGE</div><h1>Gespeichert.</h1><p>Dokumente, die du in der Dokumentansicht gespeichert hast. Sie bleiben, auch wenn die App sie nach zehn Tagen aus dem Lagebild löscht.</p></div>{gespeicherte.length>0&&<button className="button secondary" onClick={exportGespeichert}><Download size={17}/>Liste teilen</button>}</div>
 {gespeicherte.length?<section className="results"><div className="section-heading"><h2><Bookmark size={19}/> Gespeichert <span>{gespeicherte.length}</span></h2><span className="muted">Zuletzt gespeichert zuerst</span></div>
 <div className="item-list">{gespeicherte.map(e=><div key={e.item.id} className="gemerkt-eintrag"><ItemCard item={e.item} gemerkt onClick={()=>oeffnen(e.item)}/><span className="gemerkt-fuss">Gespeichert am {date(e.gespeichertAm,true)} Uhr{e.imBestand?'':' · nicht mehr im aktuellen Bestand, gezeigt wird der gespeicherte Stand'}</span></div>)}</div></section>:
 <div className="empty panel"><Bookmark size={40}/><h3>Noch nichts gespeichert</h3><p>Öffne ein Dokument und tippe auf „Speichern“. Es erscheint dann hier und bleibt, auch wenn es aus dem Lagebild verschwindet.</p></div>}
 <p className="muted">Die Liste liegt nur auf diesem Gerät, in diesem Browser. Auf dem iPhone führt die App auf dem Home-Bildschirm eine eigene Liste, getrennt von Safari. „Liste teilen“ gibt sie als Text weiter, etwa per Mail an dich selbst.</p></>:
 view==='sources'?<><div className="page-heading"><div><div className="eyebrow">TRANSPARENTE ABDECKUNG</div><h1>Die Quellen.</h1><p>Amtliche Veröffentlichungen. Jeder Abruf mit eigenem Status.</p></div>{STATIC?<button className="button primary" onClick={reload} disabled={busy}><RefreshCw size={17} className={busy?'spin':''}/>Stand neu laden</button>:<button className="button primary" onClick={run} disabled={busy||!conn.token}><RefreshCw size={17} className={busy?'spin':''}/>Quellen prüfen</button>}</div>{data.sources.some(s=>s.status==='manual')&&<div className="notice"><ShieldCheck size={20}/><span>„Offen“ bedeutet: Diese Quelle wird noch nicht automatisch überwacht.</span></div>}<div className="source-grid">{data.sources.map(s=><section className="panel source-card" key={s.id}><div className="source-top"><div className="source-symbol"><Radio size={21}/></div><span className={'badge '+quellenStand(s).klasse}>{quellenStand(s).label}</span></div><span className="eyebrow">{s.institution}</span><h2>{s.name}</h2><p>{s.note}</p>{s.error&&<p className="warning-text">{s.error}</p>}<div className="source-meta"><span>{s.checkedAt?`${quellenStand(s).vorsatz}${date(s.checkedAt,true)}`:'Noch kein erfolgreicher Abruf'}</span>{s.count!==undefined&&<span>{s.kind==='lobby'?`${s.count} ${s.count===1?'Akteur':'Akteure'} im Register`:`${s.count} ${quellenStand(s).abruf} · ${imBestand(s.id)} in der App`}</span>}</div><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-link">Amtliche Quelle <ArrowUpRight size={16}/></a></section>)}</div></>:
 <><div className="page-heading"><div><div className="eyebrow">DEIN WORKSPACE</div><h1>Einstellungen.</h1><p>Verbindung, Auswahlgrundlage und Betriebsstatus.</p></div></div><div className="settings-grid">{STATIC?<section className="panel"><h2>Laufend aktualisierte Seite</h2><p>Diese Seite braucht keinen Server und keinen Schlüssel. Ein Zeitplan holt die amtlichen Quellen alle 10 Minuten ab und veröffentlicht den neuen Stand hier: im Sommer von 06:07 bis 22:57 Uhr, im Winter von 05:07 bis 21:57 Uhr Berliner Zeit. GitHub plant in UTC und kennt die Sommerzeit nicht — daher die Verschiebung. GitHub führt geplante Läufe nicht zuverlässig aus; liegt der letzte Abruf über eine Stunde zurück, sagt es das Lagebild. Du öffnest die Seite und liest.</p><div className="action-box"><strong>Als App auf dem Handy</strong><p>Im Browser über „Teilen“ beziehungsweise das Menü „Zum Home-Bildschirm“ wählen. Danach startet die Seite wie eine App, auch ohne Mac.</p></div>
 <div className="action-box"><strong>Sofort neu prüfen</strong><p>„Stand neu laden“ holt den zuletzt veröffentlichten Stand. Einen neuen Abruf der amtlichen Quellen kann diese Seite nicht auslösen — sie hat keinen Server. Der Zeitplan erledigt das alle 10 Minuten; zwischendurch startest du ihn hier von Hand.</p>{REPO&&<a className="button secondary" href={`https://github.com/${REPO}/actions/workflows/monitor.yml`} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={17}/>Quellenlauf auf GitHub starten</a>}</div>
 <p className="muted">Archivieren und der Versionsvergleich brauchen den Server und sind hier ausgeblendet. „Speichern“ funktioniert ohne Server, die Liste liegt auf dem Gerät.</p></section>:<section className="panel"><h2>Monitoring-Server</h2><p>Der Server sammelt die Quellen und speichert ihre Versionen. Bereits geladene Stände bleiben auf diesem Gerät verfügbar.</p><form onSubmit={e=>{e.preventDefault();saveConnection();}}><label>Server-Adresse<input type="url" placeholder="https://monitor.example.org" value={draft.url} onChange={e=>setDraft({...draft,url:e.target.value})}/></label><label>Verbindungsschlüssel<input type="password" autoComplete="off" placeholder="Persönlicher Zugangsschlüssel" value={draft.token} onChange={e=>setDraft({...draft,token:e.target.value})}/></label><button className="button primary" disabled={busy||!ready} type="submit">{busy?'Verbindung wird geprüft …':'Prüfen & speichern'}</button></form><p className="muted">Lokaler Betrieb auf diesem Mac. Auf dem Handy und unterwegs dient die veröffentlichte Seite, die keinen Server braucht.</p></section>}
 <section className="panel"><h2>Betriebsstatus</h2><dl><div><dt>Letzter Datenstand</dt><dd>{data.serverTime?date(data.serverTime,true):'Noch nicht geladen'}</dd></div><div><dt>Zeitplan</dt><dd>{STATIC?'Alle 10 Minuten · Sommer 06:07–22:57, Winter 05:07–21:57 Uhr, soweit GitHub die Läufe ausführt':data.scheduleEnabled?'Serverseitiger Zeitplan als eingerichtet gemeldet':'Zeitplan vorbereitet, noch nicht aktiviert'}</dd></div><div><dt>Überwachte Gremien</dt><dd>{COMMITTEES.length} Ausschüsse, {MINISTRIES.length} Ressorts</dd></div><div><dt>Arbeitsweise</dt><dd>Anzeigen mit Quellenverweis. Keine Relevanzbewertung, keine KI-Zusammenfassung.</dd></div></dl><div className="action-box"><strong>Auswahl statt Bewertung</strong><p>Zwei Wege führen in die App: Papiere aus der Zuständigkeit der ausgewählten Gremien und Drucksachen, in denen ein TRUMPF-Thema vorkommt. Drucksachennummer und PDF erscheinen, soweit die Quelle sie führt; Termine und Behördenmeldungen haben meist keine.</p><button className="button secondary" onClick={()=>navigate('committees')}>Auswahl ansehen</button></div></section></div></>}
 </div><footer className="footer">POLICY MONITOR <span>Public Policy · Persönlicher Prototyp</span></footer></main><nav className="bottom-nav" aria-label="Mobile Navigation">{nav.map(([id,label,Icon])=><button className={view===id?'active':''} key={id} onClick={()=>navigate(id)}><Icon size={21}/><span>{label}</span></button>)}</nav></div></>;
}
// Zeigt den Fund, nicht ein Urteil: welches Thema, welcher Begriff, wie oft, und der Satz drumherum.
function TopicCard({item,onClick,thema,gemerkt}:{item:Item;onClick:()=>void;thema?:string;gemerkt?:boolean}){
 const m=themenReihenfolge(topicsOf(item),thema);
 const k=kartenDaten(item);
 const beleg=m[0];
 return <button className="topic-card" onClick={onClick}>
  <div className="topic-tags">{m.map(x=><span key={x.topic} className={'badge topic'+(x.inTitle?' im-titel':'')}>{topicById(x.topic)?.label}<b>{x.count}</b>{x.inTitle&&<i>im Titel</i>}</span>)}</div>
  <h3>{item.title}</h3>
  {beleg&&<blockquote className="beleg"><Quote size={13}/><span>{beleg.snippet}</span></blockquote>}
  <div className="item-meta"><span>{item.documentType}</span>{item.documentNumber&&<><span>·</span><span>Drs. {item.documentNumber}</span></>}<span>·</span><span>{k.wort} {k.gefuehrt}</span>{k.zusatz&&<><span>·</span><span className="moved">{k.zusatz}</span></>}{item.lead&&<><span>·</span><span>{committeeById(item.lead)?.short}</span></>}{item.pdfUrl&&<span className="badge neutral">PDF</span>}{gemerkt&&<span className="badge gemerkt"><BookmarkCheck size={11}/>Gespeichert</span>}</div>
 </button>;
}
function ItemCard({item,onClick,gemerkt}:{item:Item;onClick:()=>void;gemerkt?:boolean}){
 const lead=item.lead?committeeById(item.lead):undefined;
 const stand=anzeigeStatus(item);
 const k=kartenDaten(item);
 return <button className="item-card" onClick={onClick}><div className={'item-stripe '+stand}/><div className="item-content"><div className="item-meta"><span>{item.documentType}</span>{item.documentNumber&&<><span>·</span><span>Drs. {item.documentNumber}</span></>}<span>·</span><span>{k.wort} {k.gefuehrt}</span>{k.zusatz&&<><span>·</span><span className="moved">{k.zusatz}</span></>}<span className="change-label">{labels[stand]}</span></div><h3>{item.title}</h3><div className="tags">{lead&&<span className="badge lead">{lead.short}{istTermin(item)?'':' · federführend'}</span>}{item.committees.filter(c=>c!==item.lead).map(c=><span className="badge channel" key={c}>{committeeById(c)?.short}</span>)}{item.ministries.map(m=><span className="badge channel" key={m}>{ministryById(m)?.short}</span>)}{topicsOf(item).map(x=><span key={x.topic} className="badge topic">{topicById(x.topic)?.label}</span>)}{item.step&&item.step!==item.documentType&&<span className="badge neutral">{item.step}</span>}{item.pdfUrl&&<span className="badge neutral">PDF</span>}{gemerkt&&<span className="badge gemerkt"><BookmarkCheck size={11}/>Gespeichert</span>}</div></div><ChevronRight className="item-arrow" size={19}/></button>;
}
