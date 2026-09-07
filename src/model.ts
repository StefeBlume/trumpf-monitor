export const CHANNELS: Record<string,string> = {
 K1:'Produkt / Marktzugang', K2:'Export / Dual-Use', K3:'Außenhandel / Geopolitik', K4:'Standort / Energie', K5:'Lieferkette / Rohstoffe', K6:'Berichtspflichten / Steuern', K7:'Personal / Qualifizierung', K8:'Kundenbranchen', K9:'Forschung / Förderung', K10:'Reputation'
};
export type Category = 'relevant' | 'watch' | 'irrelevant';
export type Change = 'baseline'|'new'|'changed'|'unchanged';
export interface Source {id:string; name:string; institution:string; url:string; feed?:string; env?:string; kind:'rss'|'dip'|'manual'; note:string; status?:string; checkedAt?:string; error?:string; count?:number;}
export interface DocumentInput {externalId:string; title:string; url:string; text:string; publishedAt:string|null; procedure:string|null; documentType:string;}
export interface Evaluation {category:Category; score:number; triage:'hoch'|'mittel'|'gering'|'nicht relevant'; channels:string[]; summary:string; reason:string; evidence:string[]; action:string; owner:string; materiality:string; window:string; actors:string; stage:string; method:string;}
export interface Item extends DocumentInput {id:string; sourceId:string; institution:string; evaluation:Evaluation; hash:string; version:number; change:Change; firstSeen:string; lastSeen:string; changedAt:string; archived:boolean;}
export interface Event {id:string; itemId:string; title:string; at:string; change:Change; sourceId:string; version:number;}
export interface Briefing {id:string; createdAt:string; day:string; baseline:boolean; summary:string; items:Item[]; coverage:{ok:number; failed:number; manual:number}; errors:string[];}
export interface Dashboard {items:Item[]; sources:Source[]; briefings:Briefing[]; events:Event[]; serverTime:string; aiEnabled:boolean; scheduleEnabled:boolean;}
export const SOURCES:Source[] = [
 {id:'bt-agenda',name:'Ausschuss-Tagesordnungen',institution:'Bundestag',url:'https://www.bundestag.de/services/rss/feeds_allgemein-249014',feed:'https://www.bundestag.de/static/appdata/includes/rss/tagesordnungen.rss',kind:'rss',note:'RSS-Metadaten und Feed-Text. Verlinkte Tagesordnungs-PDFs werden nicht automatisch ausgewertet.'},
 {id:'bt-current',name:'Aktuelle Themen & Anhörungen',institution:'Bundestag',url:'https://www.bundestag.de/services/rss/feeds_allgemein-249014',feed:'https://www.bundestag.de/static/appdata/includes/rss/aktuellethemen.rss',kind:'rss',note:'Auswahl im offiziellen RSS-Feed, keine vollständige Abdeckung aller Anhörungen.'},
 {id:'bt-hib',name:'Heute im Bundestag',institution:'Bundestag',url:'https://www.bundestag.de/services/rss/feeds_allgemein-249014',feed:'https://www.bundestag.de/static/appdata/includes/rss/hib.rss',kind:'rss',note:'Amtliche Kurzmeldungen. Ein Treffer ist noch kein Nachweis einer Gesetzesänderung.'},
 {id:'dip',name:'DIP / parlamentarische Vorgänge',institution:'Bundestag / Bundesrat',url:'https://dip.bundestag.de/',kind:'dip',env:'DIP_API_KEY',note:'API benötigt einen gültigen Schlüssel. Erfasst Metadaten und Verfahrensstände; keine PDF-Volltexte.'},
 {id:'bundesrat',name:'Drucksachen & Empfehlungen',institution:'Bundesrat',url:'https://www.bundesrat.de/',kind:'manual',env:'BUNDESRAT_FEED_URL',note:'Manuelle Ergänzung bis ein geprüfter amtlicher RSS-/Atom-Feed konfiguriert ist.'},
 {id:'bmwe',name:'Entwürfe & Anhörungen',institution:'BMWE',url:'https://www.bundeswirtschaftsministerium.de/',kind:'manual',env:'BMWE_FEED_URL',note:'Ein allgemeiner Pressefeed ersetzt kein vollständiges Monitoring von Referentenentwürfen.'},
 {id:'bmftr',name:'Forschung & Technologieförderung',institution:'BMFTR',url:'https://www.bmftr.bund.de/',kind:'manual',env:'BMFTR_FEED_URL',note:'Manuelle Ergänzung; geprüften amtlichen Feed konfigurieren.'},
 {id:'bmf',name:'Finanzen & Steuern',institution:'BMF',url:'https://www.bundesfinanzministerium.de/',kind:'manual',env:'BMF_FEED_URL',note:'Manuelle Ergänzung; geprüften amtlichen Feed konfigurieren.'},
 {id:'aa',name:'Außenwirtschaft & Außenpolitik',institution:'Auswärtiges Amt',url:'https://www.auswaertiges-amt.de/',kind:'manual',env:'AA_FEED_URL',note:'Manuelle Ergänzung; geprüften amtlichen Feed konfigurieren.'},
 {id:'bafa',name:'Exportkontrolle & Außenwirtschaft',institution:'BAFA',url:'https://www.bafa.de/',kind:'rss',feed:'https://www.bafa.de/DE/Service/RSSNewsfeed/_functions/rssnewsfeed.xml',env:'BAFA_FEED_URL',note:'Allgemeiner amtlicher BAFA-Newsfeed. Kein vollständiger Ersatz für Merkblatt- und Rechtsänderungsmonitoring.'},
 {id:'eurlex',name:'EU-Recht & Legislativvorschläge',institution:'EUR-Lex',url:'https://eur-lex.europa.eu/',kind:'manual',env:'EURLEX_FEED_URL',note:'Gespeicherte amtliche RSS-Suche konfigurieren; Umfang hängt von der Suchdefinition ab.'},
 {id:'hys',name:'Konsultationen & Initiativen',institution:'Have Your Say',url:'https://ec.europa.eu/info/law/better-regulation/have-your-say',kind:'manual',env:'HYS_FEED_URL',note:'Manuelle Ergänzung; noch keine validierte automatische Schnittstelle.'}
];
