# Prompt für ChatGPT Codex: TRUMPF Public-Policy Monitoring-App

Du bist ein erfahrener Full-Stack-Engineer, Produktdesigner und AI-Architect. Baue eine produktionsreife Monitoring-App für TRUMPF Public Policy mit Fokus auf regulatorisches Frühwarn-Monitoring.

## Ziel

Die App soll jeden Morgen um 06:00 Uhr automatisch ein fertiges Briefing erzeugen, das zeigt, ob es seit dem letzten Lauf relevante Änderungen in amtlichen, öffentlich zugänglichen Quellen gab, die für TRUMPF politisch, regulatorisch oder strategisch relevant sein könnten. Die App soll Änderungen erkennen, einordnen, priorisieren und in einer klaren, lesbaren Oberfläche darstellen. Das Ergebnis muss so gut sein, dass Public Policy es als tägliches Lagebild verwenden kann.

## Wichtige Leitplanken

- TRUMPF ist ein globaler Hochtechnologie-Konzern mit Maschinenbau, Lasertechnik, Halbleiter-/EUV-Bezug, Additive Manufacturing, Laserdioden, internationalem Handel und starker Deutschland-/EU-Verankerung.
- Relevanz ist nicht „alles, was Industrie sagt“, sondern nur das, was für TRUMPF wirklich Frühwarnwert oder Hebel hat.
- Der Bewertungsmodus muss sich am TRUMPF-Screening orientieren:
  - Kanäle K1 bis K10
  - Stufen A bis E
  - besonders wichtig: Betroffenheit, Materialität, Einflussfenster, Hebel/Akteure, Zuständigkeit Public Policy vs. Linie
- Das System darf keine internen TRUMPF-Daten erfinden. Wenn etwas nicht bekannt ist, als Annahme kennzeichnen.
- Bei Unsicherheit lieber „nicht relevant / Monitoring“ als Relevanz aufblasen.

## Zielnutzer

- TRUMPF Public Policy / Regulatory Affairs
- sekundär: angrenzende Funktionen wie Legal, Exportkontrolle, Nachhaltigkeit, Technik, ggf. Standort-/Energieverantwortliche

## Technikvorgaben

- Frontend: Next.js + TypeScript
- Deployment: Vercel
- Scheduler: Vercel Cron oder gleichwertig, täglich 06:00 Uhr lokale Zeit
- Datenhaltung: persistente Datenbank für Quellenstände, Treffer, Briefings, Änderungsvergleiche
- Ingestion: modular, quellenbasiert, mit sauber getrennten Konnektoren
- LLM: OpenAI API, konfigurierbar über Umgebungsvariable
- Fokus: robust, wartbar, beobachtbar, keine Spielerei

## Kernfunktionalität

### 1. Quellenmonitoring

Überwache mindestens diese Quellenklassen:

- Deutscher Bundestag:
  - DIP / Vorgänge / Drucksachen / Plenarprotokolle / Aktivitäten
  - Ausschusstermine und öffentliche Anhörungen
  - Tagesordnungen und Sitzungskalender
- Bundesrat:
  - Drucksachen
  - Ausschussempfehlungen
  - Plenartermine / Tagesordnungen
- Bundesministerien:
  - Referentenentwürfe / Verbändeanhörungen / Veröffentlichungen, mindestens für:
    - BMWE
    - BMFTR
    - BMF
    - Auswärtiges Amt
  - BAFA:
    - Exportkontrolle
    - Außenwirtschaft
    - Investitionsprüfung
    - Merkblätter / Bekanntmachungen / Auslegungshinweise
- EU:
  - EUR-Lex
  - Have Your Say / öffentliche Konsultationen
  - Legislativvorschläge
  - ggf. Trilog-/Verfahrensstände, wenn maschinell zuverlässig verfügbar
- Optional erweiterbar:
  - weitere amtliche Behörden, später zuschaltbar
- Wichtig:
  - Offizielle Quellen priorisieren
  - Sekundärquellen nur als Ergänzung, nie als Primärquelle

### 2. Änderungsdetektion

- Vergleiche jeden Lauf mit dem vorherigen Stand.
- Erkenne:
  - neue Dokumente
  - geänderte Dokumente
  - neue Termine
  - Friständerungen
  - Statuswechsel im Verfahren
  - neue Ausschussberatungen
  - neue Anhörungen
  - neue Gesetzesentwürfe / Änderungsanträge
- Speichere Versionen und Diffs.
- Zeige klar, was neu ist und was nur unverändert erneut gefunden wurde.

### 3. KI-Bewertung / Relevanzlogik

Baue eine Bewertungsschicht ein, die jeden Treffer einordnet:

- Erst Triage:
  - hoch
  - mittel
  - gering
  - nicht relevant
- Dann optional vertiefte Bewertung nach dem TRUMPF-Screening:
  - betroffene Kanäle K1–K10
  - Materialität
  - Einflussfenster
  - Hebel / Akteure
  - Zuständigkeit
  - Eskalationsschwellen
- Die KI soll zu jedem Treffer ausgeben:
  - Kurzfazit
  - Relevanzscore
  - warum relevant oder nicht relevant
  - welche TRUMPF-Kanäle betroffen sind
  - ob Public Policy zuständig ist oder die Linie
  - ob nur Monitoring oder aktive Befassung nötig ist
- Vermeide Halluzinationen:
  - keine erfundenen Fristen
  - keine erfundenen Zuständigkeiten
  - keine erfundenen Inhalte
- Wenn die Datenlage dünn ist, muss die KI das offen sagen.

### 4. Morgenbriefing um 06:00 Uhr

- Jeden Morgen automatisch erzeugen
- Inhalt:
  - Executive Summary
  - wichtigste neue oder geänderte Vorgänge
  - pro Vorgang:
    - Quelle
    - Datum
    - Art der Änderung
    - Relevanz
    - Kurzbegründung
    - empfohlene nächste Aktion
  - separate Liste:
    - „Relevante Änderungen“
    - „Beobachten“
    - „Nicht relevant“
- Wenn es keine relevanten Änderungen gab:
  - trotzdem Briefing erzeugen
  - klar sagen, dass nichts Relevantes neu war
- Das Briefing muss so aufgebaut sein, dass es in 1–3 Minuten lesbar ist.

### 5. TRUMPF-spezifische Themenlogik

Implementiere eine saubere Themenzuordnung, damit das System nicht beliebig filtert:

- K1 Produkt / Marktzugang
- K2 Export / Dual-Use / Technologiekontrolle
- K3 Außenhandel / Geopolitik
- K4 Standort / Betrieb Deutschland
- K5 Lieferkette / Rohstoffe
- K6 Berichtspflichten / Finanzierung / Steuern
- K7 Personal / Qualifizierung
- K8 Nachfrage der Kundenbranchen
- K9 Forschung / Förderung
- K10 Reputation / öffentliche Rolle

Das System soll bei jedem Treffer diese Kanäle als Tags verwenden, wenn passend.

### 6. Relevanz für TRUMPF – Quellenpriorisierung

Die App soll nicht nur sammeln, sondern priorisieren. Für die erste Version soll das System besonders stark auf diese Quellen achten:

- Bundestag-Ausschüsse und Anhörungen
- Bundestags-DIP
- Referentenentwürfe der relevanten Ressorts
- Bundesrat-Ausschussempfehlungen
- EU-Konsultationen / Vorhaben früh im Verfahren
- BAFA-Veröffentlichungen
- EUR-Lex
- Have Your Say

Weniger wichtig:

- reine Plenarreden ohne substanzielle Neuigkeit
- spät im Verfahren liegende Formalien
- unklare oder rein politische Nachrichten ohne formellen Vorgang
- Quellen ohne amtlichen Charakter, sofern nicht als Ergänzung gebraucht

### 7. UX / Design

Die Oberfläche soll professionell und ruhig wirken, eher „Executive Monitoring Cockpit“ als Dashboard-Spielerei.

Anforderungen:

- klare Startseite mit heutiger Lage
- oben die drei Hauptkategorien:
  - Relevante Änderungen
  - Beobachten
  - Nicht relevant
- pro Treffer eine kompakte Card
- Filter nach:
  - Quelle
  - Datum
  - Relevanz
  - TRUMPF-Kanal
  - Behörde / Institution
- Detailansicht pro Vorgang
- Diff-Ansicht bei geänderten Dokumenten
- Status für jeden Treffer:
  - neu
  - geändert
  - unverändert
  - archiviert
- Suchfunktion
- Responsive
- barrierearm
- sauberes, vertrauenswürdiges Corporate-Style-Design

### 8. Datenmodell

Entwirf ein sauberes Schema für:

- sources
- items / events / documents
- snapshots / versions
- diffs
- briefings
- relevance labels
- actions / assignments
- user preferences
- schedules / cron metadata

Mindestens speichern:

- Quelle
- Titel
- URL
- Veröffentlichung / Änderungsdatum
- Institution
- Dokumenttyp
- Verfahrensstand
- extrahierter Text
- Hash / Version
- Differenz zur Vorversion
- Relevanzscore
- TRUMPF-Kanäle
- Summary
- empfohlene Aktion

### 9. Quellenarchitektur

Baue die Ingestion so, dass jede Quelle als eigener Connector implementiert ist.

Jeder Connector soll:

- die Quelle abrufen
- neue oder geänderte Einträge erkennen
- Text extrahieren
- Metadaten normalisieren
- Fehler sauber loggen
- mit Retry-Mechanismus arbeiten
- robuste Rate-Limits respektieren
- reproduzierbar testbar sein

Wenn eine Quelle API-Zugriff bietet, nutze API statt Scraping.
Wenn nur HTML/PDF verfügbar ist, baue parsende Fallbacks.
Wenn eine Quelle nicht zuverlässig automatisierbar ist, markiere sie klar als manuelle Ergänzung.

### 10. Qualität / Robustheit

- Schreibe produktionsnahen Code.
- Verwende TypeScript strikt.
- Baue saubere Fehlerbehandlung ein.
- Nutze sinnvolle Ordnerstruktur.
- Trenne:
  - ingestion
  - parsing
  - evaluation
  - briefing generation
  - UI
  - scheduling
  - persistence
- Lege Testbarkeit an:
  - Unit-Tests für Parser und Relevanzlogik
  - Mock-Daten
  - Beispielbriefing
- Falls nötig, implementiere initial nur eine funktionsfähige Kernversion, aber so, dass neue Quellen leicht ergänzt werden können.

### 11. Spezielle Regel für Relevanz

Wenn ein Vorgang nur allgemeine Industriewirkung hat, aber keinen klaren TRUMPF-Bezug, soll das System ihn eher als „Beobachten“ oder „Nicht relevant“ behandeln.

Wenn ein Vorgang TRUMPF-Kernthemen berührt, z. B.:

- Exportkontrolle
- Dual-Use
- Laser-/Maschinenregulierung
- Halbleiter-/EUV-Bezug
- Maschinenverordnung / Produktsicherheit
- Energie / Industriestrompreis
- Förderpolitik für Forschung / Halbleiter / Photonik
- Lieferketten / Rohstoffe

soll er deutlich höher priorisieren.

BMFTR ist ausdrücklich relevant, wenn Forschung, Technologie, Halbleiter, Photonik, Raumfahrt oder High-Tech-Förderung betroffen sind.

### 12. Output der App

Die App soll folgendes liefern:

- Dashboard
- tägliches Briefing
- Änderungslog
- Trefferdetailseite
- Exportfunktion für Briefings
- optional E-Mail/Teams später als Erweiterung
- keine unnötigen Extras

## Implementierungsanweisung

- Baue die App vollständig und lauffähig.
- Wenn externe API-Keys benötigt werden, verwende Umgebungsvariablen und dokumentiere sie sauber.
- Wenn für einzelne amtliche Quellen keine stabile API existiert, verwende den besten robusten verfügbaren Ansatz und kennzeichne ihn.
- Falls eine Quelle nur bedingt automatisierbar ist, trotzdem die Architektur dafür vorsehen.
- Achte auf sauberen, wartbaren Code und gute Struktur.
- Wenn du Annahmen treffen musst, liste sie explizit auf.
- Erstelle am Ende ein kurzes README mit:
  - Setup
  - benötigte Environment-Variablen
  - Cron-Setup
  - Quellenübersicht
  - Hinweise zu Grenzen und Annahmen

## Wichtig

- Das Ziel ist nicht eine allgemeine News-App.
- Das Ziel ist ein TRUMPF-spezifisches regulatorisches Frühwarnsystem für Public Policy.
- Die App soll den Morgenbericht automatisch um 06:00 Uhr erzeugen.
- Sie soll relevante Veränderungen erkennen, priorisieren und knapp erläutern.
- Sie soll die relevanten amtlichen Quellen sauber priorisieren, nicht alles gleich behandeln.

Bitte jetzt die komplette App bauen.
