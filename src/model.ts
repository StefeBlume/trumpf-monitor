export interface Committee {id:string; name:string; short:string; kuerzel:string[]; institution:'Bundestag'|'Bundesrat'; scope:string; leadOnly:boolean;}
// leadOnly: Querschnittsausschüsse werden nahezu jeder Vorlage mitberatend zugewiesen. Dort zählt nur die Federführung,
// sonst schlägt Routine-Mitberatung als vermeintlicher Treffer durch. Fachlich eng zugeschnittene Ausschüsse zählen auch mitberatend.
// Kuratierte Auswahl: nur Ausschüsse, deren Zuständigkeit TRUMPF-Themen berührt. Die Auswahl ist die Filterentscheidung;
// einzelne Dokumente werden danach nicht mehr bewertet, sondern nur mit Quelle angezeigt.
export const COMMITTEES:Committee[] = [
 {id:'we',institution:'Bundestag',short:'Wirtschaft und Energie',name:'Ausschuss für Wirtschaft und Energie',kuerzel:['AfWE'],scope:'Außenwirtschaftsrecht, Energierecht, Industriestrompreis, Industriepolitik',leadOnly:false},
 {id:'ftr',institution:'Bundestag',short:'Forschung und Technologie',name:'Ausschuss für Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung',kuerzel:['AfFTRT'],scope:'Photonik-, Halbleiter- und Hochtechnologieförderung',leadOnly:false},
 {id:'aa',institution:'Bundestag',short:'Auswärtiges',name:'Auswärtiger Ausschuss',kuerzel:['AuswA'],scope:'Exportkontrolle, Sanktionen, Dual-Use, Außenwirtschaftsbeziehungen',leadOnly:false},
 {id:'fi',institution:'Bundestag',short:'Finanzen',name:'Finanzausschuss',kuerzel:['FinanzA'],scope:'Zoll, Forschungszulage, Unternehmensbesteuerung, Investitionsprüfung',leadOnly:true},
 {id:'eu',institution:'Bundestag',short:'Europäische Union',name:'Ausschuss für die Angelegenheiten der Europäischen Union',kuerzel:['AfEU'],scope:'Maschinenverordnung, Chips Act, Binnenmarkt- und Produktrecht der EU',leadOnly:true},
 {id:'di',institution:'Bundestag',short:'Digitales',name:'Ausschuss für Digitales und Staatsmodernisierung',kuerzel:['ADi','DS'],scope:'KI-Verordnung, NIS-2, Cyber Resilience Act, Datenrecht',leadOnly:false},
 {id:'um',institution:'Bundestag',short:'Umwelt und Klima',name:'Ausschuss für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit',kuerzel:['AfU'],scope:'Emissionshandel, Ökodesign, Kreislaufwirtschaft, Stoffrecht',leadOnly:false},
 {id:'as',institution:'Bundestag',short:'Arbeit und Soziales',name:'Ausschuss für Arbeit und Soziales',kuerzel:['AfArbSoz'],scope:'Fachkräfteeinwanderung, Arbeitszeit- und Qualifizierungsrecht',leadOnly:true},
 {id:'ha',institution:'Bundestag',short:'Haushalt',name:'Haushaltsausschuss',kuerzel:['HaushA'],scope:'Etats von BMWE und BMFTR, Förderprogramme, Investitionsmittel',leadOnly:true},
 {id:'rv',institution:'Bundestag',short:'Recht',name:'Ausschuss für Recht und Verbraucherschutz',kuerzel:['AfRechtVer'],scope:'Produkthaftung, Lieferkettenrecht, Vertrags- und Wettbewerbsrecht',leadOnly:true},
 {id:'vt',institution:'Bundestag',short:'Verteidigung',name:'Verteidigungsausschuss',kuerzel:['VgA'],scope:'Sicherheitsrelevante Technologie und Dual-Use-Bezüge',leadOnly:false},
 {id:'br-wi',institution:'Bundesrat',short:'Wirtschaft (BR)',name:'Wirtschaftsausschuss des Bundesrates',kuerzel:['Wi'],scope:'Länderstellungnahmen zu Wirtschafts- und Energievorlagen',leadOnly:true},
 {id:'br-eu',institution:'Bundesrat',short:'Europäische Union (BR)',name:'Ausschuss für Fragen der Europäischen Union des Bundesrates',kuerzel:['EU'],scope:'Länderstellungnahmen zu EU-Vorlagen',leadOnly:true},
 {id:'br-fz',institution:'Bundesrat',short:'Finanzen (BR)',name:'Finanzausschuss des Bundesrates',kuerzel:['Fz'],scope:'Länderstellungnahmen zu Steuer- und Zollvorlagen',leadOnly:true},
 {id:'br-u',institution:'Bundesrat',short:'Umwelt (BR)',name:'Ausschuss für Umwelt, Naturschutz und nukleare Sicherheit des Bundesrates',kuerzel:['U'],scope:'Länderstellungnahmen zu Umwelt- und Stoffrecht',leadOnly:true},
 {id:'br-r',institution:'Bundesrat',short:'Recht (BR)',name:'Rechtsausschuss des Bundesrates',kuerzel:['R'],scope:'Länderstellungnahmen zu Produkt- und Haftungsrecht',leadOnly:true}
];
export interface Ministry {id:string; short:string; name:string; match:string[]; scope:string;}
// Ministerien werden über das Urheberfeld amtlicher Drucksachen erkannt, nicht über Pressemitteilungen.
export const MINISTRIES:Ministry[] = [
 {id:'bmwe',short:'BMWE',name:'Bundesministerium für Wirtschaft und Energie',match:['wirtschaft und energie'],scope:'Außenwirtschaft, Energie, Industriepolitik'},
 {id:'bmftr',short:'BMFTR',name:'Bundesministerium für Forschung, Technologie und Raumfahrt',match:['forschung, technologie und raumfahrt'],scope:'Forschungs- und Technologieförderung'},
 {id:'bmf',short:'BMF',name:'Bundesministerium der Finanzen',match:['ministerium der finanzen'],scope:'Steuern, Zoll, Investitionsprüfung'},
 {id:'aamt',short:'AA',name:'Auswärtiges Amt',match:['auswärtiges amt'],scope:'Exportkontrolle, Sanktionsrecht'},
 {id:'bmds',short:'BMDS',name:'Bundesministerium für Digitales und Staatsmodernisierung',match:['digitales und staatsmodernisierung'],scope:'Digital- und Datenrecht'},
 {id:'bmukn',short:'BMUKN',name:'Bundesministerium für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit',match:['umwelt, klimaschutz'],scope:'Umwelt-, Stoff- und Kreislaufrecht'}
];
export const committeeById=(id:string)=>COMMITTEES.find(c=>c.id===id);
export const committeeByKuerzel=(k:string)=>COMMITTEES.find(c=>c.kuerzel.includes(k));
export type Change = 'baseline'|'new'|'changed'|'unchanged';
export interface Source {id:string; name:string; institution:string; url:string; feed?:string; env?:string; kind:'committee-dip'|'ministry-dip'|'committee-agenda'|'rss'|'manual'; note:string; status?:string; checkedAt?:string; error?:string; count?:number;}
export interface DocumentInput {
 externalId:string; title:string; url:string; text:string; publishedAt:string|null;
 documentType:string;          // Drucksachentyp, z. B. Gesetzentwurf, Unterrichtung, Beschlussempfehlung
 step:string|null;             // Verfahrensschritt, z. B. Gesetzentwurf, 1. Beratung, Beschlussempfehlung und Bericht
 procedure:string|null;        // Beratungsstand laut DIP
 documentNumber:string|null;   // Drucksachennummer
 pdfUrl:string|null;           // amtliches PDF
 committees:string[];          // ids aus COMMITTEES
 lead:string|null;             // id des federführenden Ausschusses
 ministries:string[];          // ids aus MINISTRIES
 originator:string|null;       // Urheber laut Fundstelle
}
export interface Item extends DocumentInput {id:string; sourceId:string; institution:string; hash:string; version:number; change:Change; firstSeen:string; lastSeen:string; changedAt:string; archived:boolean;}
export interface Event {id:string; itemId:string; title:string; at:string; change:Change; sourceId:string; version:number;}
export interface Briefing {id:string; createdAt:string; day:string; baseline:boolean; summary:string; items:Item[]; coverage:{ok:number; failed:number; manual:number}; errors:string[];}
export interface Dashboard {items:Item[]; sources:Source[]; briefings:Briefing[]; events:Event[]; serverTime:string; scheduleEnabled:boolean;}
export const SOURCES:Source[] = [
 {id:'dip-committees',name:'Überweisungen und Beratungsschritte',institution:'Bundestag / Bundesrat',url:'https://dip.bundestag.de/',kind:'committee-dip',env:'DIP_API_KEY',note:'DIP-Vorgangspositionen, gefiltert auf die ausgewählten Ausschüsse. Erfasst Metadaten und Drucksachenlinks, keine PDF-Volltexte.'},
 {id:'dip-ministries',name:'Drucksachen der ausgewählten Ressorts',institution:'Bundesregierung',url:'https://dip.bundestag.de/',kind:'ministry-dip',env:'DIP_API_KEY',note:'DIP-Drucksachen, gefiltert auf das amtliche Urheberfeld der ausgewählten Ministerien. Referentenentwürfe vor der Zuleitung sind nicht enthalten.'},
 {id:'bt-agenda',name:'Tagesordnungen der ausgewählten Ausschüsse',institution:'Bundestag',url:'https://www.bundestag.de/services/rss/feeds_allgemein-249014',feed:'https://www.bundestag.de/static/appdata/includes/rss/tagesordnungen.rss',kind:'committee-agenda',note:'Amtlicher RSS-Feed, gefiltert auf die ausgewählten Ausschüsse. Verlinkte Tagesordnungs-PDFs werden nicht ausgewertet.'},
 {id:'bafa',name:'Exportkontrolle und Außenwirtschaft',institution:'BAFA',url:'https://www.bafa.de/',feed:'https://www.bafa.de/DE/Service/RSSNewsfeed/_functions/rssnewsfeed.xml',env:'BAFA_FEED_URL',kind:'rss',note:'Allgemeiner amtlicher BAFA-Newsfeed. Kein Ausschussbezug und kein vollständiges Merkblatt-Monitoring.'}
];
