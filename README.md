# TRUMPF Policy Monitor

Zeigt an, was in ausgewählten Bundestags- und Bundesratsausschüssen sowie ausgewählten Ressorts an neuen amtlichen Papieren eingegangen ist — mit Drucksachennummer, Verfahrensschritt und Link auf das amtliche PDF.

**Die App bewertet nicht.** Es gibt keinen Relevanzscore, keine Priorisierung, keine Triage und keine KI-Zusammenfassung. Die einzige inhaltliche Entscheidung ist die Auswahl der Gremien. Was dort eingeht, wird unverändert angezeigt.

## Die Auswahl

Überwacht werden 11 Bundestags- und 5 Bundesratsausschüsse sowie 6 Ressorts (siehe `src/model.ts`, sichtbar in der App unter „Ausschüsse"). Nicht ausgewählt sind unter anderem Inneres, Verkehr, Gesundheit, Landwirtschaft, Kultur, Bau und Wohnen, Familie und Menschenrechte.

**Regel `leadOnly`:** Querschnittsausschüsse — Finanzen, Haushalt, Recht, Arbeit und Soziales, EU sowie sämtliche Bundesratsausschüsse — werden nahezu jeder Vorlage mitberatend zugewiesen. Dort zählt nur die Federführung. Fachlich eng zugeschnittene Ausschüsse (Wirtschaft und Energie, Forschung und Technologie, Auswärtiges, Digitales, Umwelt, Verteidigung) zählen auch mitberatend. Ohne diese Regel steigt das Rauschen im 14-Tage-Fenster von 30 auf 41 Dokumente, überwiegend durch Routine-Mitberatungen im Bundesrat.

Auswahl und Regel ändern: `COMMITTEES` und `MINISTRIES` in `src/model.ts`. Die Tests prüfen, dass Ids kollisionsfrei bleiben.

## Quellen

| Quelle | Abruf | Filter |
|---|---|---|
| DIP `vorgangsposition` | API | `ueberweisung[].ausschuss_kuerzel` gegen die Auswahl, `leadOnly` beachtet |
| DIP `drucksache` | API | amtliches Urheberfeld `fundstelle.urheber` gegen die Ressortauswahl |
| Ausschuss-Tagesordnungen | RSS | Ausschusspräfix im Titel gegen die Bundestagsauswahl |
| BAFA-Newsfeed | RSS | ungefiltert, ohne Gremienbezug |

Abgerufen wird inkrementell über `f.aktualisiert.start`: ab dem letzten erfolgreichen Lauf mit zwei Tagen Überlappung, höchstens 30 Tage zurück, beim Erstlauf 14 Tage.

Nur freigegebene amtliche HTTPS-Domains werden abgerufen (`officialURL` in `src/server/parsing.ts`). PDF-Adressen aus der API werden gegen dieselbe Liste geprüft, bevor sie in der Oberfläche als Quelle erscheinen.

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
| `APP_TOKEN` | ja | Zugangsschlüssel der API, wird in der App unter Einstellungen hinterlegt |
| `CRON_SECRET` | ja | Schützt `/api/cron` |
| `DATABASE_URL` | Hosting | Lokal `file:data/monitor.db`; beim Hosting persistente libsql-URL |
| `SCHEDULE_ENABLED` | nein | Nur auf `true` setzen, wenn ein echter Scheduler eingerichtet ist |
| `DIP_WAHLPERIODE` | nein | Standard 21 |
| `BAFA_FEED_URL` | nein | Abweichende amtliche Feed-URL |

### Morgenlauf

`vercel.json` ruft `/api/cron` auf; `runMonitor({cron:true})` läuft nur zur 6. Stunde Europe/Berlin und höchstens einmal pro Kalendertag (`cron_days`). Der Cron-Aufruf braucht `Authorization: Bearer $CRON_SECRET`.

## Änderungserkennung

Pro Dokument wird ein SHA-256 über Titel, Dokumenttyp, Verfahrensschritt, Drucksachennummer, PDF-Adresse, Gremienzuordnung, Urheber und Datum gebildet. Statuswerte: `baseline` (Erstimport), `new`, `changed`, `unchanged`. Jede Änderung schreibt eine Version; die Detailansicht zeigt den Wortdiff zur Vorversion.

Ein Erstimport ist kein Fund. Die Zusammenfassung sagt das ausdrücklich.

## Grenzen

- **Referentenentwürfe vor der Zuleitung an das Parlament sind nicht erfasst.** Ministerien werden über das Urheberfeld amtlicher Drucksachen erkannt, nicht über Pressemitteilungen oder Verbändeanhörungen. Für die frühe Phase existiert keine maschinell zuverlässige amtliche Schnittstelle.
- **Keine PDF-Volltexte.** Erfasst werden Metadaten und der Link; der Inhalt der Drucksachen wird nicht ausgewertet.
- **Der BAFA-Feed liefert kein Veröffentlichungsdatum.** Die App zeigt dort „Kein Datum in der Quelle" statt ein Datum aus der URL zu raten.
- **EUR-Lex und Have Your Say sind nicht angebunden.** Beides liegt außerhalb der Ausschuss- und Ressortauswahl; EU-Vorlagen erscheinen nur, soweit sie an einen ausgewählten Ausschuss überwiesen wurden.
- **Keine Meldung ist kein Entwarnungsnachweis.** Die Anzeige gilt nur für die ausgewählten Gremien und die erfolgreich abgerufenen Quellen. Fehlgeschlagene Abrufe werden pro Quelle mit Fehlertext ausgewiesen.

## Tests

```bash
npm test
```

Geprüft werden Feed-Parsing und Domain-Allowlist, die Ausschuss- und Ressortzuordnung samt `leadOnly`-Regel, die Kollisionsfreiheit der Auswahl, das Abruffenster, die Hash-Bildung und ein vollständiger Lauf über baseline/unchanged/new/changed inklusive Quellenfehler und leerem Ergebnis.
