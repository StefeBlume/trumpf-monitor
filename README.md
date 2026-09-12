# TRUMPF Policy Monitor

Durchsucht amtliche Drucksachen im Volltext nach den Themen von TRUMPF SE + Co. KG und zeigt die Treffer mit Fundstelle, Drucksachennummer und Link auf das amtliche PDF. Zusätzlich überwacht die App ausgewählte Ausschüsse und Ressorts auf neue Papiere und kommende Anhörungen.

**Die App bewertet nicht.** Es gibt keinen Relevanzscore, keine Priorisierung, keine Triage und keine KI-Zusammenfassung. Ein Thementreffer ist eine Fundstelle: die App nennt den Begriff, zählt seine Vorkommen, vermerkt ob er im Titel steht, und zeigt den Satz drumherum. Ob der Fund etwas bedeutet, entscheidet die Lektüre.

## Die Themen

Das Raster in `src/server/topics.ts` folgt dem Geschäft von TRUMPF: Familienunternehmen seit 1923 in Ditzingen, rund 18.000 Beschäftigte, Werkzeugmaschinen und Lasertechnik, Leistungselektronik, additive Fertigung — und als weltweit einziger Lieferant der Laserverstärker für die EUV-Lithografie unmittelbar an der Halbleiterfertigung beteiligt.

| Thema | Warum |
|---|---|
| Export & Dual-Use | Ausfuhrrecht und Güterlisten entscheiden über Lieferwege |
| Halbleiter & EUV | Laserverstärker für die EUV-Lithografie |
| Lasertechnik & Photonik | Kerngeschäft samt Laserschutzrecht |
| Werkzeugmaschinen & Fertigung | Zweites Kerngeschäft, Maschinen- und Produktsicherheitsrecht |
| Industrielle KI | KI in Fertigung und Maschinensteuerung |
| Hochtechnologie & Förderung | Forschungsförderung und Schlüsseltechnologien |
| Wirtschaftsstandort Deutschland | Energiepreise, Bürokratie, Fachkräfte |
| Lieferketten & Rohstoffe | Seltene Erden, Vorprodukte, Zölle |
| Familienunternehmen & Mittelstand | Erbschaft- und Unternehmensteuer |

**Wie gesucht wird.** Begriffe werden mit eigenen Wortgrenzen gesucht, weil `\b` bei Umlauten unzuverlässig ist. Deutsche Beugung wird berücksichtigt, auch mitten in Mehrwortbegriffen („seltene Erden" findet „seltenen Erden"), und zwischen den Wörtern steht `\s+`, damit ein Zeilenumbruch aus dem PDF-Volltext nicht trennt. Abkürzungen wie `AWG`, `AWV` oder `EUV` treffen nur in Großschreibung, sonst würden sie Silben in fremden Wörtern erwischen.

**Kontextbedingung.** Zu breite Begriffe zählen nur, wenn im selben Dokument auch ein Fertigungs- oder Industriebegriff steht. „Künstliche Intelligenz" allein trifft sonst KI-generierte Musik, „Bürokratieabbau" das Vereinssteuerrecht. Beide Fundstellen werden als Beleg angezeigt.

**Reihenfolge.** Sortiert wird nach Fundstellen im Titel, dann nach Zahl der berührten Themen, dann nach Häufigkeit — alles drei abzählbare Eigenschaften des Textes, keine Gewichtung.

## Die Auswahl

Neben der Volltextsuche überwacht die App gezielt 11 Bundestags- und 5 Bundesratsausschüsse sowie 4 Ressorts (siehe `src/model.ts`, sichtbar in der App unter „Ausschüsse"). Nicht ausgewählt sind unter anderem Inneres, Verkehr, Gesundheit, Landwirtschaft, Kultur, Bau und Wohnen, Familie und Menschenrechte.

**Regel `leadOnly`:** Querschnittsausschüsse — Finanzen, Haushalt, Recht, Arbeit und Soziales, EU sowie sämtliche Bundesratsausschüsse — werden nahezu jeder Vorlage mitberatend zugewiesen. Dort zählt nur die Federführung. Fachlich eng zugeschnittene Ausschüsse (Wirtschaft und Energie, Forschung und Technologie, Auswärtiges, Digitales, Umwelt, Verteidigung) zählen auch mitberatend. Ohne diese Regel steigt das Rauschen im 14-Tage-Fenster von 30 auf 41 Dokumente, überwiegend durch Routine-Mitberatungen im Bundesrat.

Auswahl und Regel ändern: `COMMITTEES` und `MINISTRIES` in `src/model.ts`. Die Tests prüfen, dass Ids kollisionsfrei bleiben.

## Quellen

| Quelle | Abruf | Filter |
|---|---|---|
| DIP `vorgangsposition` | API | `ueberweisung[].ausschuss_kuerzel` gegen die Auswahl, `leadOnly` beachtet |
| DIP `drucksache-text` | API | Volltext aller Drucksachen gegen das Themenraster; zusätzlich alles aus den ausgewählten Ressorts |
| Anhörungen und öffentliche Sitzungen | Terminlisten der Ausschüsse | je ausgewähltem Bundestagsausschuss eine eigene amtliche Liste |
| Tagesordnungen | ausschussübergreifende Liste | Ausschussspalte gegen die Bundestagsauswahl |
| BAFA-Newsfeed | RSS | ungefiltert, ohne Gremienbezug |

Die Termin- und Tagesordnungslisten sind HTML-Listen der Ausschussseiten, keine dokumentierte Schnittstelle. Bricht das CMS die Struktur, meldet die Terminquelle einen Fehler, statt still nichts zu liefern. Der frühere RSS-Feed war auf 15 Einträge über alle Ausschüsse gedeckelt und lieferte deshalb nur einen Bruchteil der Termine.

Abgerufen wird inkrementell über `f.aktualisiert.start`: ab dem letzten erfolgreichen Lauf mit zwei Tagen Überlappung, höchstens 30 Tage zurück, beim Erstlauf 14 Tage.

**Adressen.** Nur freigegebene amtliche HTTPS-Domains werden abgerufen (`officialURL` in `src/server/parsing.ts`). Jede Adresse, die als Quelle in der Oberfläche erscheint, läuft vorher durch `sourceURL` — syntaktisch gültig reicht nicht, sie muss auf einer Behördendomain liegen. Das gilt auch für Verweise aus fremdem Markup (Termin- und Tagesordnungslisten) und aus RSS-Feeds. Weiterleitungen über Domaingrenzen hinweg werden abgebrochen, statt den API-Schlüssel mitzusenden.

**Formatbrüche.** Terminlisten melden einen Fehler, wenn ein Ausschuss gar keine Einträge im erwarteten Format liefert; brechen mehr als die Hälfte, scheitert die Quelle ganz. Die Tagesordnungstabelle meldet einen Fehler, wenn Zeilen vorhanden sind, aber keine Verweise enthalten. Eine leere Liste in sitzungsfreien Wochen ist dagegen gültig. Diese Prüfungen gibt es, weil der Tagesordnungs-Parser nach einem Spaltenwechsel schon einmal still auf null lief.

**Aufbewahrung.** `RETENTION_DAYS` (Standard 180) entfernt nach jedem erfolgreichen Lauf nicht archivierte Dokumente, die so lange nicht mehr in einer Quelle aufgetaucht sind, samt ihrer Versionen und Ereignisse. Ohne diese Grenze wüchsen Datenbank und veröffentlichter Stand unbegrenzt.

## Setup

```bash
npm install
cp .env.example .env.local   # DIP_API_KEY und APP_TOKEN eintragen
npm run monitor              # erster Quellenlauf, schreibt public/bootstrap.json
npm run dev                  # http://localhost:4180
```

### Umgebungsvariablen

| Variable | Pflicht | Zweck |
|---|---|---|
| `DIP_API_KEY` | ja | Ohne Schlüssel bleiben beide DIP-Quellen auf „Schlüssel fehlt". Öffentlicher Schlüssel und Bezugsweg: https://dip.bundestag.de/über-dip/hilfe/api |
| `APP_TOKEN` | lokal | Zugangsschlüssel der API im lokalen Serverbetrieb; die veröffentlichte Seite braucht ihn nicht |
| `CRON_SECRET` | lokal | Schützt `/api/cron` im lokalen Serverbetrieb |
| `DATABASE_URL` | nein | Standard `file:data/monitor.db` |
| `SCHEDULE_ENABLED` | nein | Nur auf `true` setzen, wenn ein echter Scheduler eingerichtet ist |
| `DIP_WAHLPERIODE` | nein | Standard 21 |
| `RETENTION_DAYS` | nein | Standard 180; `0` schaltet die Aufbewahrungsgrenze ab |
| `BAFA_FEED_URL` | nein | Abweichende amtliche Feed-URL |

### Zeitplan

Die Zeitsteuerung liegt beim Scheduler, nicht im Code: `runMonitor()` läuft, wann immer es aufgerufen wird, und schützt sich nur über eine Sperre gegen parallele Läufe. Im Betrieb ruft der GitHub-Workflow `npm run monitor` auf. Lokal gibt es zusätzlich `/api/cron`, abgesichert über `Authorization: Bearer $CRON_SECRET`.

## Änderungserkennung

Pro Dokument wird ein SHA-256 über Titel, Dokumenttyp, Verfahrensschritt, Drucksachennummer, PDF-Adresse, Gremienzuordnung, Urheber und Datum gebildet. Statuswerte: `baseline` (Erstimport), `new`, `changed`, `unchanged`. Jede Änderung schreibt eine Version; die Detailansicht zeigt den Wortdiff zur Vorversion.

Ein Erstimport ist kein Fund. Die Zusammenfassung sagt das ausdrücklich.

## Grenzen

- **Referentenentwürfe vor der Zuleitung an das Parlament sind nicht erfasst.** Ministerien werden über das Urheberfeld amtlicher Drucksachen erkannt, nicht über Pressemitteilungen oder Verbändeanhörungen. Für die frühe Phase existiert keine maschinell zuverlässige amtliche Schnittstelle.
- **Nicht jede Drucksache führt einen Volltext.** Wo die Quelle keinen Text liefert, wird nur der Titel durchsucht. Für Ausschusstermine, Tagesordnungen und den BAFA-Feed gibt es ohnehin nur Titel.
- **Ein Thementreffer ist kein Sachzusammenhang.** Die Suche findet Begriffe, nicht Bedeutung. Ein Dokument über Vereinssteuerrecht kann „Bürokratieabbau" im Titel führen und erscheint dann zu Recht in der Liste — die Einschätzung bleibt bei der Leserin.
- **Der BAFA-Feed liefert kein Veröffentlichungsdatum.** Die App zeigt dort „Kein Datum in der Quelle" statt ein Datum aus der URL zu raten.
- **Der Auswärtige Ausschuss führt keine öffentliche Terminliste.** Er tagt überwiegend nicht öffentlich; seine Sitzungen erscheinen nur über die Tagesordnungsliste.
- **Die Datenbank wächst unbegrenzt.** Erfasste Dokumente werden nicht automatisch entfernt. Bei Bedarf `data/monitor.db` und `public/bootstrap.json` löschen; der nächste Lauf legt einen frischen Ausgangsstand an.
- **EUR-Lex und Have Your Say sind nicht angebunden.** Beides liegt außerhalb der Ausschuss- und Ressortauswahl; EU-Vorlagen erscheinen nur, soweit sie an einen ausgewählten Ausschuss überwiesen wurden.
- **Keine Meldung ist kein Entwarnungsnachweis.** Die Anzeige gilt nur für die ausgewählten Gremien und die erfolgreich abgerufenen Quellen. Fehlgeschlagene Abrufe werden pro Quelle mit Fehlertext ausgewiesen.

## Betrieb auf GitHub Pages

Für die Nutzung auf dem Handy ohne laufenden Mac baut `.github/workflows/monitor.yml` die App als statische Seite:

1. Repository auf GitHub anlegen und pushen.
2. Unter **Settings → Secrets and variables → Actions** das Secret `DIP_API_KEY` setzen.
3. Unter **Settings → Pages** als Quelle **GitHub Actions** wählen.

Der Workflow läuft alle 30 Minuten von 04:00 bis 20:00 UTC, also 06:00 bis 22:00 Berliner Zeit im Sommer und 05:00 bis 21:00 im Winter. Kürzere Abstände bringen nichts, da GitHub geplante Läufe unter Last verzögert.

**Was versioniert wird und was nicht.** `data/monitor.db` ist ableitbarer Zwischenstand und steht in `.gitignore`; bei halbstündlichen Läufen würde die Binärdatei das Repository um mehrere hundert MB im Jahr aufblähen. Zwischen den Läufen hält `actions/cache` sie vor. Versioniert wird nur `public/bootstrap.json`, und zwar ausschließlich, wenn der Lauf neue oder geänderte Dokumente gefunden hat. Fehlt die Datenbank — etwa nach Ablauf des Zwischenspeichers —, baut `seedFromSnapshot` sie aus `public/bootstrap.json` wieder auf, damit bereits bekannte Dokumente nicht erneut als neu gemeldet werden.

**Briefings.** Jeder Lauf schreibt ein Briefing, damit das Lagebild immer den jüngsten Lauf beschreibt. Damit die Liste bei halbstündlichen Läufen nicht zuläuft, ersetzt ein Lauf ohne Änderung den vorherigen Leerlauf desselben Tages. Briefings und Änderungslog werden nach Zeit sortiert ausgeliefert — nach einem Wiederaufbau folgen die Zeilen sonst der Einfügereihenfolge.

Die veröffentlichte Seite ist **nur lesend**. „Stand neu laden" holt `bootstrap.json` erneut, löst aber keinen Quellenabruf aus — dafür fehlt der Server. Einen echten Lauf startet der Link „Quellenlauf auf GitHub starten" über `workflow_dispatch`. Ein Knopf, der direkt aus der Seite heraus abruft, bräuchte einen hinterlegten Zugangsschlüssel und ist auf einer öffentlichen statischen Seite deshalb ausgeschlossen. Archivieren und Versionsvergleich brauchen ebenfalls den Server und sind ausgeblendet. Sie ist außerdem **öffentlich erreichbar** — die angezeigten Dokumente sind amtlich und öffentlich, die Auswahl der Gremien ist es damit auch.

Lokal prüfen:

```bash
NEXT_PUBLIC_BASE_PATH=/<repo-name> npm run build:pages
```

## Tests

```bash
npm test
```

46 Tests in drei Dateien. `tests/core.test.ts` deckt den Regelbetrieb ab: Feed-Parsing, Ausschuss- und Ressortzuordnung samt `leadOnly`-Regel, Sortierung nach Quellenbewegung, Abruffenster, Hash-Bildung, Wiederherstellung aus dem veröffentlichten Stand samt Vergleichsstand, chronologische Reihenfolge nach Wiederaufbau und ein vollständiger Lauf über baseline/unchanged/new/changed inklusive Quellenfehler und leerem Ergebnis.

`tests/topics.test.ts` deckt die Themensuche ab: Stimmigkeit des Rasters, Erkennung aller TRUMPF-Kernthemen, Abkürzungen nur in Großschreibung, industrieller Kontext für KI und die breiten Standortbegriffe, deutsche Beugung samt Zeilenumbruch, Zählung und Titelvermerk, Reihenfolge und die Belegqualität.

`tests/hardening.test.ts` deckt die Randfälle ab, die im Audit aufgefallen sind: fremde Adressen aus fremdem Markup, unsichtbare Trennzeichen, Formatbrüche gegen legitime Leerergebnisse, keine Wiederholung dauerhafter Fehler, Datumsüberlauf (der 31. Februar wurde zum 3. März), Namensabgleich über alle 24 echten Ausschussbezeichnungen, Aufbewahrung, sichtbare Teilausfälle und unvollständige API-Antworten.

## Was die App ausmacht

Der laufende Betrieb besteht aus dem Code in `src`, `pages` und `scripts`, dem Zeitplan in `.github/workflows/monitor.yml` und dem veröffentlichten Stand in `public/bootstrap.json`. Alles andere im Ordner ist Werkzeug: `node_modules` lässt sich per `npm install` jederzeit neu laden, `data/` und `out/` entstehen beim Lauf.

Aus dem ursprünglichen Codex-Bau stammten außerdem ein iPhone-Wrapper (Capacitor), ein Cloudflare-Worker, eine Vercel-Konfiguration und Drizzle-Migrationen. Keines davon war am Betrieb beteiligt; alles wurde entfernt. Die Historie liegt in Git, falls es je gebraucht wird.
