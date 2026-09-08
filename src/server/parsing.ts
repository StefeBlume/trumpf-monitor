import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {load} from 'cheerio/slim';
import {createHash} from 'node:crypto';
import type {DocumentInput} from '../model';
export const clean = (x:unknown):string => load(typeof x === 'string' ? x : String(x ?? ''),null,false).text().replace(/\s+/g,' ').trim();
export function safeURL(value:string,base?:string):string|null {try {const u=new URL(value,base); return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function officialURL(value:string):boolean {try {const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && (!u.port||u.port==='443') && ['bundestag.de','bundesrat.de','bafa.de','bundeswirtschaftsministerium.de','bmwe.bund.de','bmwk.de','bmftr.bund.de','bmbf.de','bundesfinanzministerium.de','auswaertiges-amt.de','europa.eu'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d));}catch{return false;}}
const arr = <T>(x:T|T[]|undefined):T[] => x===undefined?[]:Array.isArray(x)?x:[x];
export function parseFeed(xml:string,base:string):DocumentInput[] {
 if(XMLValidator.validate(xml)!==true || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Ungültiges oder nicht unterstütztes XML');
 const p=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false}).parse(xml);
 const raw= p.rss?.channel ? arr(p.rss.channel.item) : p.feed ? arr(p.feed.entry) : null;
 if(!raw)throw new Error('Antwort ist kein RSS-/Atom-Feed');
 return raw.map((entry:Record<string,any>):DocumentInput|null=>{
  const link=typeof entry.link==='string'?entry.link:arr<Record<string,any>>(entry.link).find(l=>!l['@_rel']||l['@_rel']==='alternate')?.['@_href'];
  const url=safeURL(link??'',base); const title=clean(entry.title?.['#text']??entry.title);
  if(!url||!title)return null;
  const date=entry.pubDate??entry.published??null;
  return {externalId:String(entry.guid?.['#text']??entry.guid??entry.id??url),title,url,text:clean(entry['content:encoded']??entry.content?.['#text']??entry.content??entry.description??entry.summary?.['#text']??entry.summary??''),publishedAt:date&&!isNaN(Date.parse(date))?new Date(date).toISOString():null,updatedAt:date&&!isNaN(Date.parse(date))?new Date(date).toISOString():null,documentType:'RSS-Meldung',step:null,procedure:null,documentNumber:null,pdfUrl:null,committees:[],lead:null,ministries:[],originator:null};
 }).filter((x:DocumentInput|null):x is DocumentInput=>!!x);
}
export function contentHash(doc:DocumentInput):string {
 return createHash('sha256').update(JSON.stringify({title:clean(doc.title),text:clean(doc.text),url:doc.url,publishedAt:doc.publishedAt,procedure:doc.procedure,documentType:doc.documentType,step:doc.step,documentNumber:doc.documentNumber,pdfUrl:doc.pdfUrl,committees:[...doc.committees].sort(),lead:doc.lead,ministries:[...doc.ministries].sort(),originator:doc.originator})).digest('hex');
}

const MONTHS=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember'];
// "8. September 2026" -> ISO. Gibt null zurueck, statt ein Datum zu raten.
export function germanDate(value:string):string|null{
 const m=/(\d{1,2})\.\s*([A-Za-zä]+)\s+(\d{4})/.exec(clean(value));
 if(!m)return null;
 const month=MONTHS.indexOf(m[2].toLowerCase());
 if(month<0)return null;
 const d=new Date(Date.UTC(Number(m[3]),month,Number(m[1])));
 return isNaN(d.getTime())?null:d.toISOString();
}
// Termin- und Anhoerungslisten der Ausschuesse: h4 traegt das Datum, die folgende Linkliste die Termine.
export function parseCommitteeEvents(html:string,base:string):{title:string;url:string;date:string|null}[]{
 const $=load(html);const out:{title:string;url:string;date:string|null}[]=[];
 $('.bt-listenteaser').each((_,teaser)=>{
  let date:string|null=null;
  $(teaser).children().each((__,child)=>{
   const el=$(child);
   if(child.tagName==='h4'){date=germanDate(el.text());return;}
   el.find('a[href]').each((___,a)=>{
    const url=safeURL($(a).attr('href')??'',base),title=clean($(a).attr('title')??$(a).text());
    if(url&&title)out.push({title,url,date});
   });
  });
 });
 return out;
}
// Ausschussuebergreifende Tagesordnungsliste. Spaltenzahl variiert; Datum und Ausschuss stehen vorn,
// der Link kann in einer beliebigen spaeteren Spalte stehen.
export function parseAgendaTable(html:string,base:string):{committee:string;title:string;url:string;date:string|null}[]{
 const $=load(html);const out:{committee:string;title:string;url:string;date:string|null}[]=[];
 $('tr').each((_,row)=>{
  const cells=$(row).find('td');
  if(cells.length<3)return;
  const link=$(row).find('td a[href]').first();
  const url=safeURL(link.attr('href')??'',base),title=clean(link.attr('title')??link.text());
  if(!url||!title)return;
  out.push({committee:clean($(cells[1]).text()),title,url,date:germanDate($(cells[0]).text())});
 });
 return out;
}
