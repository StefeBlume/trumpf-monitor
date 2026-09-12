import {test} from 'node:test';import assert from 'node:assert/strict';
import {TOPICS,scanTopics,topicRank,topicById} from '../src/server/topics';

test('Themenraster bleibt in sich stimmig',()=>{
 const ids=TOPICS.map(t=>t.id);
 assert.equal(ids.length,new Set(ids).size);
 for(const t of TOPICS){
  assert.ok(t.terms.length,`${t.id} ohne Begriffe`);
  assert.ok(t.why.length>30,`${t.id} ohne Begründung der Auswahl`);
  const alle=[...t.terms,...(t.strict??[]),...(t.context?.terms??[])];
  assert.equal(alle.length,new Set(alle).size,`${t.id} mit doppelten Begriffen`);
  // Kürzere Begriffe treffen Silben in fremden Wörtern. Fünf Zeichen sind die Untergrenze,
  // und auch die nur für fachlich eindeutige Wörter wie "laser".
  for(const term of t.terms)assert.ok(term.length>=5,`${t.id}: "${term}" ist zu kurz für eine verlässliche Fundstelle`);
  for(const term of t.strict??[])assert.equal(term,term.toUpperCase(),`${t.id}: "${term}" ist keine Abkürzung`);
 }
});

test('Kernthemen von TRUMPF werden erkannt',()=>{
 const f=(s:string)=>scanTopics(s).map(m=>m.topic);
 assert.ok(f('Entwurf eines Gesetzes zur Änderung des Außenwirtschaftsgesetzes').includes('dualuse'));
 assert.ok(f('Förderung der EUV-Lithografie').includes('halbleiter'));
 assert.ok(f('Halbleiterfertigung in Dresden').includes('halbleiter'));
 assert.ok(f('Normung in der Lasertechnik').includes('laser'));
 assert.ok(f('Pflichten der Laserschutzbeauftragten').includes('laser'),'Laserschutz ist Betriebsrecht für TRUMPF');
 assert.ok(f('Beschaffung einer Laserstrahlquelle').includes('laser'));
 // Kein Treffer, wo "laser" nur als Silbe steckt.
 assert.equal(scanTopics('Blasenbildung im Werkstoff').length,0);
 assert.ok(f('Novelle der Maschinenverordnung').includes('maschinen'));
 assert.ok(f('Hightech Agenda Deutschland').includes('hightech'));
 assert.ok(f('Industriestrompreis für energieintensive Betriebe').includes('standort'));
 assert.ok(f('Reform der Erbschaftsteuer für Familienunternehmen').includes('familie'));
 assert.ok(f('Versorgung mit seltenen Erden').includes('lieferkette'));
 // Deutsche Beugung mitten im Mehrwortbegriff und Zeilenumbruch aus dem PDF-Volltext.
 assert.ok(f('Bedarf an kritischen Rohstoffen').includes('lieferkette'));
 assert.ok(scanTopics('Bericht','Der Einsatz künstlicher\nIntelligenz in der Fertigung nimmt zu.').some(m=>m.topic==='ki'));
 assert.ok(f('Stärkung der additiven Fertigung').includes('maschinen'));
});

test('Abkürzungen treffen nur in Großschreibung, nicht als Silbe',()=>{
 assert.ok(scanTopics('Änderung des AWG und der AWV').some(m=>m.topic==='dualuse'));
 assert.ok(scanTopics('EUV-Quellen für die Chipfertigung').some(m=>m.topic==='halbleiter'));
 // "euv" steckt in Neuverschuldung, "awg" in Bauwagen - beides darf nicht treffen.
 for(const harmlos of ['Neuverschuldung des Bundes','Zulassung von Bauwagen','Steuerung der Abwasserentsorgung'])
  assert.equal(scanTopics(harmlos).length,0,harmlos);
});

test('Industrielle KI zählt nur mit Fertigungsbezug',()=>{
 // Genau der Fehltreffer aus der Kalibrierung: KI-generierte Musik ist kein TRUMPF-Thema.
 assert.equal(scanTopics('Musikveranstaltungen der extremen Rechten','Zunehmend wird durch künstliche Intelligenz generierte Musik verbreitet.').length,0);
 const industriell=scanTopics('Bericht zur Digitalisierung','Künstliche Intelligenz steuert die Fertigung in der Produktion zunehmend selbst.');
 assert.ok(industriell.some(m=>m.topic==='ki'),'mit Fertigungsbezug muss es treffen');
 // Regulierungsbegriffe gelten auch ohne Kontext, weil sie Maschinen unmittelbar erfassen.
 assert.ok(scanTopics('Umsetzung der KI-Verordnung').some(m=>m.topic==='ki'));
});

test('Breite Standortbegriffe brauchen ebenfalls industriellen Bezug',()=>{
 assert.equal(scanTopics('Bürokratieabbau im Vereinssteuerrecht','Entlastung für Vereine und Ehrenamt.').length,0);
 assert.ok(scanTopics('Bürokratieabbau für die Industrie','Entlastung produzierender Unternehmen.').some(m=>m.topic==='standort'));
 // Eindeutige Begriffe zählen weiterhin allein.
 assert.ok(scanTopics('Einführung eines Industriestrompreises').some(m=>m.topic==='standort'));
});

test('Fundstellen werden gezählt und der Titel gesondert vermerkt',()=>{
 const m=scanTopics('Halbleiterförderung','Der Halbleiter ist zentral. Halbleiter brauchen Halbleiterfabriken.');
 const h=m.find(x=>x.topic==='halbleiter')!;
 assert.equal(h.inTitle,true);
 assert.ok(h.count>=4,`erwartet mindestens 4 Fundstellen, gezählt ${h.count}`);
 assert.ok(h.snippet.includes('Halbleiter'));
 // Der Beleg soll den Fliesstext zeigen, nicht die Ueberschrift wiederholen - die steht daneben.
 assert.ok(h.snippet.includes('zentral')||h.snippet.includes('brauchen'),`Beleg wiederholt nur den Titel: ${h.snippet}`);
 const nurTitel=scanTopics('Gesetz über Lasertechnik','Ohne weiteren Bezug.').find(x=>x.topic==='laser')!;
 assert.ok(nurTitel.snippet.includes('Lasertechnik'),'ohne Fundstelle im Text bleibt der Titel als Beleg');
 const nurText=scanTopics('Allgemeiner Bericht','Am Rande wird der Halbleiter erwähnt.').find(x=>x.topic==='halbleiter')!;
 assert.equal(nurText.inTitle,false);
 assert.equal(nurText.count,1);
});

test('Reihenfolge stellt Titeltreffer und Themenbreite voran',()=>{
 const stark=scanTopics('Halbleiterstrategie','Halbleiter, Lasertechnik und Ausfuhrkontrolle über viele Seiten. Halbleiter erneut.');
 const schwach=scanTopics('Bericht zur Schweinehaltung','Die Lieferkette der Betriebe ist betroffen.');
 assert.ok(topicRank(stark)>topicRank(schwach));
 assert.equal(topicRank([]),0);
 // Ein Titeltreffer wiegt schwerer als viele Fundstellen tief im Text.
 const titel=scanTopics('Lasertechnik im Mittelstand','');
 const tief=scanTopics('Allgemeiner Bericht','laserschneiden '.repeat(30));
 assert.ok(topicRank(titel)>topicRank(tief));
});

test('Beleg nennt Begriff und Zusammenhang, nicht nur ein Etikett',()=>{
 const m=scanTopics('Gesetzentwurf','Die Regelung betrifft die Ausfuhrkontrolle von Gütern mit doppeltem Verwendungszweck erheblich.');
 const h=m.find(x=>x.topic==='dualuse')!;
 assert.ok(h.terms.includes('ausfuhrkontrolle'));
 assert.ok(h.snippet.includes('Ausfuhrkontrolle'));
 assert.ok(h.snippet.length>30,'der Beleg muss den Satzzusammenhang zeigen');
 assert.ok(topicById('dualuse')?.label);
});

test('Leerer Text liefert keine Treffer',()=>{
 for(const leer of ['','   ','\n'])assert.deepEqual(scanTopics(leer,''),[]);
});
