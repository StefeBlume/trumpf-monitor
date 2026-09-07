import {SOURCES,type Source,type DocumentInput} from '../model';
import {parseFeed,officialURL,clean} from './parsing';
export function configuredSources():Source[]{return SOURCES.map(s=>({...s,...(s.kind!=='dip'&&s.env&&process.env[s.env]?{kind:'rss' as const,feed:process.env[s.env]}:{})}));}
export async function fetchOfficial(url:string,headers:Record<string,string>={}):Promise<string>{
 if(!officialURL(url))throw new Error('Nur freigegebene amtliche HTTPS-Domains erlaubt');
 for(let attempt=0;attempt<3;attempt++){
 try{
 let next=url;
 for(let hop=0;hop<4;hop++){
 const r=await fetch(next,{redirect:'manual',headers:{'User-Agent':'PolicyMonitor/1.0 (public-source monitoring)',...headers},signal:AbortSignal.timeout(10000)});
 if([301,302,303,307,308].includes(r.status)){
 const loc=r.headers.get('location'); if(!loc)throw new Error('Leere Weiterleitung');
 const target=new URL(loc,next).href;
 if(!officialURL(target)||new URL(target).origin!==new URL(url).origin&&Object.keys(headers).length)throw new Error('Weiterleitung nicht freigegeben'); next=target;continue;
 }
 if(!r.ok)throw new Error(`Quellenabruf HTTP ${r.status}`);
 if(Number(r.headers.get('content-length')??0)>4000000)throw new Error('Quelle überschreitet 4 MB');
 const reader=r.body?.getReader();if(!reader)throw new Error('Leere Antwort');
 let size=0; const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4000000){await reader.cancel();throw new Error('Quelle überschreitet 4 MB');}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
 }
 throw new Error('Zu viele Weiterleitungen');
 }catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,500*2**attempt));}
 }throw new Error('Abruf fehlgeschlagen');
}
export async function ingest(source:Source):Promise<DocumentInput[]>{
 if(source.kind==='rss'&&source.feed)return parseFeed(await fetchOfficial(source.feed),source.feed);
 if(source.kind==='dip'){
 if(!process.env.DIP_API_KEY)throw new Error('DIP_API_KEY fehlt');
 const docs:DocumentInput[]=[];let cursor:string|undefined;
 // Bounded lookback with explicit pagination; completeness outside this window is not claimed.
 const since=new Date(Date.now()-14*86400000).toISOString().slice(0,10);
 for(let page=0;page<20;page++){
 const u=new URL('https://search.dip.bundestag.de/api/v1/vorgang');u.searchParams.set('f.aktualisiert.start',since);if(cursor)u.searchParams.set('cursor',cursor);
 const p=JSON.parse(await fetchOfficial(u.href,{Authorization:`ApiKey ${process.env.DIP_API_KEY}`}));
 if(!Array.isArray(p.documents))throw new Error('Unerwartetes DIP-Format');
 for(const d of p.documents){if(!d.id||!d.titel)continue;docs.push({externalId:String(d.id),title:clean(d.titel),url:`https://dip.bundestag.de/vorgang/${d.id}`,text:clean(d.abstract??''),publishedAt:d.datum&&!isNaN(Date.parse(d.datum))?new Date(d.datum).toISOString():null,procedure:d.beratungsstand??null,documentType:d.vorgangstyp??'Vorgang'});}
 if(!p.documents.length||!p.cursor||p.cursor===cursor)return docs;
 cursor=p.cursor;
 }throw new Error('DIP-Seitenlimit erreicht; kein vollständiger Abruf für das 14-Tage-Fenster');
 }
 throw new Error('Manuelle Ergänzung erforderlich');
}
