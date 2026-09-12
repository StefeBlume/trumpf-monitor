import {test} from 'node:test';import assert from 'node:assert/strict';
import {TOPICS,scanTopics,topicById} from '../src/server/topics';

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

// Die Liste ordnet nach dem Datum der Quelle. Innerhalb eines Tages entscheidet der Zeitstempel,
// den das DIP sekundengenau liefert - eine zusaetzliche Gewichtung gaebe es nicht her und waere
// auch keine Tatsache mehr, sondern ein Urteil.
test('Fundstellen werden nach Themen gruppiert, nicht gewichtet',()=>{
 const m=scanTopics('Halbleiter und Lasertechnik','Halbleiter mehrfach. Halbleiter erneut. Laser einmal.');
 assert.deepEqual(m.map(x=>x.topic).sort(),['halbleiter','laser']);
 // Innerhalb des Ergebnisses stehen Titeltreffer vorn, damit der Beleg oben passt.
 assert.equal(m[0].inTitle,true);
 assert.ok(m.every(x=>x.count>0));
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

// Jeder Gesetzentwurf muss die Kosten fuer die Wirtschaft "einschliesslich mittelstaendischer Unternehmen"
// darstellen. Der Pflichtsatz machte 4 von 16 Mittelstand-Treffern aus, darunter das
// Einkommensteuerreformgesetz.
test('Die Kostenformel eines Gesetzentwurfs ist keine Mittelstand-Fundstelle',()=>{
 const familie=(text:string)=>scanTopics('Entwurf eines Gesetzes',text).some(m=>m.topic==='familie');
 assert.equal(familie('F. Weitere Kosten Der Wirtschaft, einschließlich mittelständischer Unternehmen, entstehen keine direkten sonstigen Kosten.'),false);
 assert.equal(familie('Weitere direkte oder indirekte Kosten für die Wirtschaft und insbesondere für mittelständische Unternehmen sind nicht zu erwarten.'),false);
 assert.equal(familie('Unternehmen, insbesondere kleinen und mittelständischen Unternehmen, entstehen durch dieses Gesetz keine unmittelbaren direkten Kosten.'),false);
 assert.equal(familie('Die hohen Energiekosten belasten mittelständische Unternehmen besonders.'),true,'eine inhaltliche Aussage bleibt ein Treffer');
 assert.equal(familie('F. Weitere Kosten Keine. Die Reform stärkt mittelständische Unternehmen bei der Nachfolge.'),true,'nur der Formelsatz fällt weg, nicht das ganze Dokument');
 assert.equal(familie('Die Erbschaftsteuer für Familienunternehmen wird reformiert.'),true);
});

// Das BAFA verwaltet auch Energie- und Wirtschaftsfoerderung sowie das Lieferkettengesetz. Als Dual-Use-
// Begriff machte "BAFA" den "BAFA Energietag" und 11 von 16 Meldungen zum Lieferkettengesetz zu Treffern.
test('Die Behörde allein ist kein Exportkontroll-Thema',()=>{
 const dual=(t:string,b='')=>scanTopics(t,b).some(m=>m.topic==='dualuse');
 assert.equal(dual('BAFA Energietag 2026 – Letzte Chance zur Anmeldung!'),false);
 assert.equal(dual('Lieferkettensorgfaltspflichtengesetz: Das BAFA veröffentlicht eine Handreichung'),false);
 assert.equal(dual('Anpassung der Muster zu Endverbleibserklärungen für Ausfuhren'),true,'der Endverbleib ist Exportkontrolle');
 assert.equal(dual('Änderung des AWG'),true,'Abkürzungen des Außenwirtschaftsrechts bleiben');
});

// Der Behoerdenname enthaelt das Wort "Ausfuhrkontrolle". Die "Bundesfoerderung fuer effiziente Gebaeude"
// wurde dadurch zum Dual-Use-Treffer, und beim EEG stand der Name als Beleg statt des Aussenwirtschaftsgesetzes.
test('Der Name des Bundesamtes ist keine Exportkontroll-Fundstelle',()=>{
 const dual=(b:string)=>scanTopics('Kleine Anfrage',b).find(m=>m.topic==='dualuse');
 assert.equal(dual('Nach den Mitteilungen des BMWE und des Bundesamtes für Wirtschaft und Ausfuhrkontrolle (BAFA) fand die Antragsphase statt.'),undefined);
 assert.equal(dual('Das Bundesamt für Wirtschaft und Ausfuhrkontrolle prüft die Anträge.'),undefined);
 const eeg=dual('Dem Bundesamt für Wirtschaft und Ausfuhrkontrolle sind die Angaben mitzuteilen. Ein Bieter, der Unionsfremder im Sinn des § 2 Absatz 19 des Außenwirtschaftsgesetzes ist, wird ausgeschlossen.');
 assert.ok(eeg,'eine echte Fundstelle im selben Text bleibt');
 assert.deepEqual(eeg!.terms,['außenwirtschaftsgesetz'],'gezählt wird nur die echte Fundstelle');
 assert.match(eeg!.snippet,/Außenwirtschaftsgesetzes/,'und sie ist der Beleg');
 assert.ok(dual('Die neue Regel zur Ausfuhrkontrolle von Laserquellen gilt ab Januar.'),'das Wort selbst bleibt ein Treffer');
});

// Ein Industriewort irgendwo im Dokument genuegte. In 265 Drucksachen betrafen dadurch 9 von 15 Treffern
// fuer "Industrielle KI" KI-Schriftsaetze vor Gericht, Cyberangriffe, Foerderbilanzen oder die
// Verwaltungsautomatisierung der Bundesagentur fuer Arbeit.
test('Industrielle KI verlangt den Industriebezug im selben Satz',()=>{
 const ki=(t:string,b:string)=>scanTopics(t,b).some(m=>m.topic==='ki');
 assert.equal(ki('Entwurf eines Gesetzes zur Änderung der Verwaltungsgerichtsordnung','Der Einsatz künstlicher Intelligenz zur Erstellung von Schriftsätzen nimmt zu. Die Industrie begrüßt die Digitalisierung der Justiz.'),false,'das Industriewort im Nachbarsatz genügt nicht');
 assert.equal(ki('Arbeitsförderung','Die Bundesagentur setzt bei der Automatisierung ihrer Verwaltungsabläufe verstärkt KI-Systeme ein.'),false,'Verwaltungsautomatisierung ist keine Industrie');
 assert.equal(ki('Forschung','Maschinelles Lernen verändert die Wissenschaft.'),false,'der Fundbegriff erfüllt seinen Kontext nicht selbst');
 assert.equal(ki('Bericht','In der Fertigung erkennt ein KI-System Fehler an Werkstücken.'),true);
 assert.equal(ki('Bericht','Maschinelles Lernen optimiert die Produktion von Blechteilen.'),true);
 assert.equal(ki('Stellungnahme','Die KI-Verordnung erfasst Hochrisiko-Systeme.'),true,'Regulierungsbegriffe gelten weiter ohne Kontext');
});

// Die Satzregel gilt nur fuer KI. Beim Standort haette sie die regionale Wirtschaftsfoerderung und das
// Haushaltsbegleitgesetz verloren - "Fachkraeftemangel" ist von sich aus wirtschaftlich.
test('Beim Wirtschaftsstandort genügt der Bezug im Dokument',()=>{
 assert.ok(scanTopics('Neuaufstellung der Gemeinschaftsaufgabe','Der Fachkräftemangel verschärft sich. Viele Unternehmen in der Region suchen Personal.').some(m=>m.topic==='standort'));
});
