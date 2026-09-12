import type {TopicMatch} from './server/topics';
export interface Committee {id:string; name:string; short:string; kuerzel:string[]; institution:'Bundestag'|'Bundesrat'; scope:string; leadOnly:boolean; events?:string;}
// events: Pfad der amtlichen Termin- bzw. Anhörungsliste des Ausschusses hinter /ajax/filterlist/de/ausschuesse/.
// Die Benennung ist je Ausschuss unterschiedlich (Anhoerungen / anhoerungen / sitzungen); der Auswärtige Ausschuss
// tagt überwiegend nicht öffentlich und veröffentlicht keine solche Liste.
// leadOnly: Querschnittsausschüsse werden nahezu jeder Vorlage mitberatend zugewiesen. Dort zählt nur die Federführung,
// sonst schlägt Routine-Mitberatung als vermeintlicher Treffer durch. Fachlich eng zugeschnittene Ausschüsse zählen auch mitberatend.
// Kuratierte Auswahl: nur Ausschüsse, deren Zuständigkeit TRUMPF-Themen berührt. Die Auswahl ist die Filterentscheidung;
// einzelne Dokumente werden danach nicht mehr bewertet, sondern nur mit Quelle angezeigt.
export const COMMITTEES:Committee[] = [
 {id:'we',institution:'Bundestag',short:'Wirtschaft und Energie',name:'Ausschuss für Wirtschaft und Energie',kuerzel:['AfWE'],scope:'Außenwirtschaftsrecht, Energierecht, Industriestrompreis, Industriepolitik',leadOnly:false,events:'a09_wirtschaft/wp21_a09_Anhoerungen/1057552-1057552'},
 {id:'ftr',institution:'Bundestag',short:'Forschung und Technologie',name:'Ausschuss für Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung',kuerzel:['AfFTRT'],scope:'Photonik-, Halbleiter- und Hochtechnologieförderung',leadOnly:false,events:'forschung/sitzungen/1075190-1075190'},
 {id:'aa',institution:'Bundestag',short:'Auswärtiges',name:'Auswärtiger Ausschuss',kuerzel:['AuswA'],scope:'Exportkontrolle, Sanktionen, Dual-Use, Außenwirtschaftsbeziehungen',leadOnly:false},
 {id:'fi',institution:'Bundestag',short:'Finanzen',name:'Finanzausschuss',kuerzel:['FinanzA'],scope:'Zoll, Forschungszulage, Unternehmensbesteuerung, Investitionsprüfung',leadOnly:true,events:'a07_finanzen/wp21_a07_Anhoerungen/1056440-1056440'},
 {id:'eu',institution:'Bundestag',short:'Europäische Union',name:'Ausschuss für die Angelegenheiten der Europäischen Union',kuerzel:['AfEU'],scope:'Maschinenverordnung, Chips Act, Binnenmarkt- und Produktrecht der EU',leadOnly:true,events:'europa/sitzungen/1075196-1075196'},
 {id:'di',institution:'Bundestag',short:'Digitales',name:'Ausschuss für Digitales und Staatsmodernisierung',kuerzel:['ADi','DS'],scope:'KI-Verordnung, NIS-2, Cyber Resilience Act, Datenrecht',leadOnly:false,events:'a23_digitales_staatsmodernisierung/anhoerungen/1074496-1074496'},
 {id:'um',institution:'Bundestag',short:'Umwelt und Klima',name:'Ausschuss für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit',kuerzel:['AfU'],scope:'Emissionshandel, Ökodesign, Kreislaufwirtschaft, Stoffrecht',leadOnly:false,events:'umwelt/sitzungen/1075184-1075184'},
 {id:'as',institution:'Bundestag',short:'Arbeit und Soziales',name:'Ausschuss für Arbeit und Soziales',kuerzel:['AfArbSoz'],scope:'Fachkräfteeinwanderung, Arbeitszeit- und Qualifizierungsrecht',leadOnly:true,events:'a11_arbeit_soziales/anhoerungen/1067034-1067034'},
 {id:'ha',institution:'Bundestag',short:'Haushalt',name:'Haushaltsausschuss',kuerzel:['HaushA'],scope:'Etats von BMWE und BMFTR, Förderprogramme, Investitionsmittel',leadOnly:true,events:'a08_haushalt/anhoerungen/1069562-1069562'},
 {id:'rv',institution:'Bundestag',short:'Recht',name:'Ausschuss für Recht und Verbraucherschutz',kuerzel:['AfRechtVer'],scope:'Produkthaftung, Lieferkettenrecht, Vertrags- und Wettbewerbsrecht',leadOnly:true,events:'recht-verbraucherschutz/sitzungen/1075166-1075166'},
 {id:'vt',institution:'Bundestag',short:'Verteidigung',name:'Verteidigungsausschuss',kuerzel:['VgA'],scope:'Sicherheitsrelevante Technologie und Dual-Use-Bezüge',leadOnly:false,events:'verteidigung/sitzungen/1075172-1075172'},
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
 {id:'aamt',short:'AA',name:'Auswärtiges Amt',match:['auswärtiges amt'],scope:'Exportkontrolle, Sanktionsrecht'}
];
export const committeeById=(id:string)=>COMMITTEES.find(c=>c.id===id);
export const committeeByKuerzel=(k:string)=>COMMITTEES.find(c=>c.kuerzel.includes(k));
export type Change = 'baseline'|'new'|'changed'|'unchanged';
export interface Source {id:string; name:string; institution:string; url:string; feed?:string; env?:string; kind:'committee-dip'|'fulltext-dip'|'committee-agenda'|'committee-events'|'rss'|'manual'; note:string; status?:string; checkedAt?:string; error?:string; count?:number;}
export interface DocumentInput {
 externalId:string; title:string; url:string; text:string; publishedAt:string|null;      // Datum des Dokuments bzw. des Termins
 updatedAt:string|null;        // Zeitpunkt der letzten Bewegung laut Quelle; treibt die Sortierung
 documentType:string;          // Drucksachentyp, z. B. Gesetzentwurf, Unterrichtung, Beschlussempfehlung
 step:string|null;             // Verfahrensschritt, z. B. Gesetzentwurf, 1. Beratung, Beschlussempfehlung und Bericht
 procedure:string|null;        // Beratungsstand laut DIP
 documentNumber:string|null;   // Drucksachennummer
 pdfUrl:string|null;           // amtliches PDF
 committees:string[];          // ids aus COMMITTEES
 lead:string|null;             // id des federführenden Ausschusses
 ministries:string[];          // ids aus MINISTRIES
 originator:string|null;       // Urheber laut Fundstelle
 topics:TopicMatch[];          // Fundstellen der TRUMPF-Themen, mit Beleg
}
export interface Item extends DocumentInput {id:string; sourceId:string; institution:string; hash:string; version:number; change:Change; firstSeen:string; lastSeen:string; changedAt:string; archived:boolean;}
export interface Event {id:string; itemId:string; title:string; at:string; change:Change; sourceId:string; version:number;}
export interface Briefing {id:string; createdAt:string; day:string; baseline:boolean; summary:string; items:Item[]; coverage:{ok:number; failed:number; manual:number}; errors:string[];}
export interface Dashboard {items:Item[]; sources:Source[]; briefings:Briefing[]; events:Event[]; serverTime:string; scheduleEnabled:boolean;}
export const SOURCES:Source[] = [
 {id:'dip-committees',name:'Überweisungen und Beratungsschritte',institution:'Bundestag / Bundesrat',url:'https://dip.bundestag.de/',kind:'committee-dip',env:'DIP_API_KEY',note:'DIP-Vorgangspositionen, gefiltert auf die ausgewählten Ausschüsse. Erfasst Metadaten und Drucksachenlinks, keine PDF-Volltexte.'},
 {id:'dip-drucksachen',name:'Volltextsuche in allen Drucksachen',institution:'Bundestag / Bundesrat',url:'https://dip.bundestag.de/',kind:'fulltext-dip',env:'DIP_API_KEY',note:'Durchsucht die Volltexte aller Drucksachen der Wahlperiode nach den TRUMPF-Themen und behält zusätzlich alles aus den ausgewählten Ressorts. Nicht jede Drucksache führt einen Volltext mit.'},
 {id:'bt-events',name:'Anhörungen und öffentliche Sitzungen',institution:'Bundestag',url:'https://www.bundestag.de/ausschuesse',kind:'committee-events',note:'Amtliche Termin- und Anhörungslisten der ausgewählten Ausschüsse. Der Auswärtige Ausschuss tagt überwiegend nicht öffentlich und führt keine solche Liste.'},
 {id:'bt-agenda',name:'Tagesordnungen der ausgewählten Ausschüsse',institution:'Bundestag',url:'https://www.bundestag.de/ausschuesse',kind:'committee-agenda',note:'Amtliche Tagesordnungsliste mit Ausschussspalte. Der frühere RSS-Feed war auf 15 Einträge über alle Ausschüsse gedeckelt.'},
 {id:'bafa',name:'Exportkontrolle und Außenwirtschaft',institution:'BAFA',url:'https://www.bafa.de/',feed:'https://www.bafa.de/DE/Service/RSSNewsfeed/_functions/rssnewsfeed.xml',env:'BAFA_FEED_URL',kind:'rss',note:'Allgemeiner amtlicher BAFA-Newsfeed. Kein Ausschussbezug und kein vollständiges Merkblatt-Monitoring.'}
];
