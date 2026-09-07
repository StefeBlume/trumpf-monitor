# TRUMPF Policy Monitor

## Aktueller Stand: Online-Version für das iPhone

Die App verwendet jetzt den privaten Online-Dienst unter https://policy-monitor-stefeblume.stefeblume42.chatgpt.site und eine persistente Cloud-D1-Datenbank. Der Mac wird für die Nutzung und Quellenabrufe nicht mehr benötigt. Die iOS-App öffnet den privaten Dienst; gegebenenfalls einmalig mit demselben ChatGPT-Konto anmelden. Keine lokale Server-Adresse und kein APP_TOKEN in der neuen App nötig.

Bei Verbindungsabbruch zeigt die iOS-Hülle eine lokale Offline-Ansicht. Erfolgreich geladene Daten werden zusätzlich über das native OfflineCache-Plugin als geschützte Datei auf dem Gerät gespeichert. Noch nicht vollständig durch einen physischen Offline-Test bestätigt. Das Cloud-Backend hat einen vollständigen Quellenlauf mit 48 Einträgen aus vier Quellen ohne Abruffehler abgeschlossen.

Die nachfolgenden lokalen Startanweisungen beschreiben den optionalen Entwicklungsbetrieb. Sie sind KEINE Voraussetzung für die Handy-Nutzung.

### Cloud-Wartung

`npm run build:cloud` erstellt einen Cloudflare-kompatiblen Worker und die statische Next.js-Oberfläche. `.openai/hosting.json` enthält die bestehende Site-ID und D1-Bindung; nicht erneut registrieren. Migrationen unter `drizzle/` sind nach Veröffentlichung unveränderlich. Die Site ist ausschließlich für das Eigentümerkonto veröffentlicht. Keine öffentliche Freigabe vorgenommen.

`npm run sync:ios` erhält die lokale Capacitor-Einbindung. Root-Konfiguration und native Hülle zeigen auf die Cloud-Adresse. HTTP-Ausnahmen und der Mac-Verbindungsschlüssel wurden aus der neuen iOS-Version entfernt. Der lokale Offline-Einstieg ist `public/offline.html`. Das native Plugin befindet sich in `ios/App/App/AppDelegate.swift`.

Weiterhin offen: acht zusätzliche Quellenanbindungen, optionale KI-Zugangsdaten und ein garantierter serverseitiger 06:00-Zeitplan. Der aktuelle Sites-Deploy aktiviert die mitgelieferte Vercel-Crondatei NICHT. Quellenabrufe funktionieren manuell im Online-Dienst.

---

Lauffähige erste Kernversion: Next.js/TypeScript mit lokal installierbarer iOS-App (Capacitor/Xcode). Die Software ist ein persönlicher Prototyp, keine offiziell freigegebene TRUMPF-Anwendung und noch kein vollständiges Produktionsmonitoring.

## Aktueller Funktionsumfang

- Responsive Lagebild, Suche, Filter (Quelle/Institution, Veröffentlichungsdatum, Kanal, Status, Relevanz), Trefferdetails und Archiv.
- Vier tatsächlich angebundene amtliche RSS-Quellen: Bundestag-Tagesordnungen, aktuelle Themen, hib und BAFA.
- Persistente SQLite-Datenbank lokal; libSQL/Turso für dauerhaftes Hosting konfigurierbar.
- Quellenstände mit SHA-256-Hashes, unveränderlichen Versionen, Wort-Diffs, Änderungslog und Briefings. Erstimport wird ausdrücklich als Ausgangsstand geführt.
- Briefing-Export als Textdatei bzw. über die iOS-Teilen-Funktion. Bereits geladene Daten bleiben lokal lesbar.
- Konservative Regel-Triage entlang K1–K10. Optionale OpenAI-Responses-Anbindung mit strukturierten Ausgaben und Prüfung wortwörtlicher Belege. KI-Ausgaben sind ausdrücklich ungeprüfte Vorschläge.
- API-Zugriffsschlüssel, separater Cron-Schlüssel, Eingabevalidierung, HTTPS-Domainfreigabe für Quellen, Abrufgrößenlimit, Timeout, begrenzte Wiederholungen, transaktionale Schreibvorgänge pro Quelle und Datenbanksperre gegen parallele Läufe.

## Start auf dem Mac

Voraussetzung: Node.js 22 oder neuer.

```sh
npm ci
cp .env.example .env.local
# APP_TOKEN und CRON_SECRET mit zwei verschiedenen zufälligen Schlüsseln setzen.
npm run build -- --webpack
npm start
```

Server: http://localhost:4180. Im Browser unter Einstellungen Adresse und APP_TOKEN eingeben. Auf dem iPhone ist für diese private Installation die lokale Verbindung vorkonfiguriert. Der Mac muss laufen und vom iPhone erreichbar sein. Außerhalb des lokalen Netzes ist ein eigener HTTPS-Server nötig.

Ersten Quellenlauf ausführen und einen Offline-Stand vorbereiten:

```sh
npm run monitor
```

`data/` enthält die lokale Datenbank. Regelmäßige Backups außerhalb der laufenden SQLite-Schreibvorgänge vorsehen. Für den Produktivbetrieb externen libSQL-Dienst und dessen Backupmechanismus nutzen.

## Xcode / iPhone

Das erzeugte Projekt liegt unter `ios/App/App.xcodeproj`, Scheme `App`, Bundle-ID `de.stefeblume.trumpfmonitor`, Anzeigename **Policy Monitor**.

```sh
npm run build:ios
npm run sync:ios
open ios/App/App.xcodeproj
```

Die nativen Capacitor-Bibliotheken sind lokal eingebunden und gegen die offiziellen SHA-256-Prüfwerte geprüft. Dafür ist keine GitHub-Anmeldung erforderlich. `npm run sync:ios` erhält diese lokale Einbindung.

In Xcode das eigene Signing-Team und das angeschlossene iPhone auswählen, dann Run. Apple-Entwicklersignatur und Gerätemodus werden von Xcode verwaltet. Gültigkeit und Verlängerung der Entwicklungssignatur richten sich nach dem Apple-Konto.

Die private iPhone-Version enthält ausschließlich im installierten Bundle einen lokalen Verbindungsschlüssel und den letzten vorbereiteten Offline-Stand. Dieses Bundle nicht öffentlich verteilen. `.env.local`, `data/`, `out/` und generierte iOS-Web-Assets nicht in ein öffentliches Repository übernehmen. Für mehrere Nutzer individuelle Geräte-Token und Widerruf ergänzen. Zugangsschlüssel auf dem Gerät liegen derzeit in WebView-Speicher; für einen produktiven Rollout Keychain verwenden.

Die iOS-Transportkonfiguration erlaubt HTTP für den lokalen Mac-Server. Für externes Hosting HTTPS verwenden und `NSAllowsArbitraryLoads` aus `ios/App/App/Info.plist` entfernen. Die App fragt für den lokalen Betrieb nach Zugriff auf das lokale Netzwerk.

## Umgebungsvariablen

- `APP_TOKEN`: verpflichtender API-Schlüssel für diese einzelne private Installation.
- `CRON_SECRET`: separater, zufälliger Schlüssel ausschließlich für den Scheduler.
- `DATABASE_URL`: lokal optional (`file:data/monitor.db`); bei Vercel verpflichtend und persistent, z. B. `libsql://…`.
- `DATABASE_AUTH_TOKEN`: Authentifizierung für den externen libSQL-Dienst.
- `OPENAI_API_KEY` und `OPENAI_MODEL`: beide optional; kein Modell wird stillschweigend ausgewählt. Ohne beide Werte keine API-Kosten und keine KI-Bewertung.
- `DIP_API_KEY`: optionaler gültiger DIP-Schlüssel; API-Dokumentation unten.
- `*_FEED_URL`: optionale geprüfte RSS-/Atom-Feeds für die offenen Quellen, Namen in `.env.example`. Nur freigegebene amtliche HTTPS-Domains, keine frei konfigurierbaren privaten URLs.
- `MOBILE_SERVER_URL`: erreichbare Adresse des eigenen Servers, nur für das lokale mobile Bundle.
- `SCHEDULE_ENABLED`: reine Betriebsanzeige, erst nach tatsächlicher Scheduler-Einrichtung auf `true` setzen; aktiviert allein keinen Zeitplan.

## Vercel und 06:00 Uhr

Das Next.js-Projekt ist für Vercel vorbereitet, aber hier **nicht veröffentlicht**. Es sind keine Hosting- oder Datenbankkonten eingerichtet worden.

`vercel.json` enthält zwei UTC-Kandidaten (04:00 und 05:00); der Endpunkt prüft `Europe/Berlin` und arbeitet nur im lokalen 06-Uhr-Fenster. Ein persistenter Tagesschlüssel verhindert doppelte Tagesläufe. So wird Sommer-/Winterzeit berücksichtigt. Die Konfiguration setzt einen passenden Vercel-Tarif voraus; Hobby bietet laut Dokumentation keine passende garantierte minutengenaue Mehrfachausführung. Alternativ einen externen Scheduler verwenden.

Wichtig: 06:00 ist in dieser Kernversion der **Startzeitpunkt**, nicht die garantierte Fertigstellung des Briefings. Für ein garantiert vor 06:00 fertiges Lagebild sind ein früherer, überwachter Ingestionslauf, ein Produktionsscheduler mit Wiederholungen sowie ein Abschlusslauf um 06:00 nötig. iOS-Hintergrundausführung ersetzt keinen Server-Scheduler.

Vor Veröffentlichung: externe persistente Datenbank, Secrets, echten Scheduler, Betriebsüberwachung und individuelle Zugriffe einrichten. API: `GET /api/dashboard`, `POST /api/run`, `GET /api/history/:id`, `PATCH /api/items/:id`, `GET /api/cron`. Alle bis auf `GET /api/health` benötigen den jeweiligen Bearer-Schlüssel. Keine Schlüssel in `NEXT_PUBLIC_*` setzen.

## Quellen und Grenzen

| Quelle | Implementierter Stand |
|---|---|
| Bundestag Tagesordnungen | Offizieller Feed, Metadaten/Feed-Text; keine verlinkten PDF-Volltexte |
| Bundestag aktuelle Themen | Offizieller Feed, begrenzte Auswahl; keine vollständige Anhörungsabdeckung |
| Bundestag hib | Offizieller Feed; Meldungen sind kein Nachweis einer Gesetzesänderung |
| BAFA | Allgemeiner offizieller Newsfeed; keine vollständige Merkblattabdeckung |
| DIP | Konfigurierbarer API-Konnektor, noch nicht live mit Schlüssel geprüft; 14 Tage Aktualisierungsfenster, höchstens 20 Seiten; Limitüberschreitung gilt als Fehler |
| Bundesrat | Manuell/offen; RSS-Konnektor konfigurierbar |
| BMWE, BMFTR, BMF, Auswärtiges Amt | Manuell/offen; amtliche Feed-Adressen konfigurierbar |
| EUR-Lex | Manuell/offen; amtliche RSS-Suche konfigurierbar |
| Have Your Say | Manuell/offen; keine validierte automatische Anbindung |

Feed-Inhalte sind Ausschnitte. Ein außerhalb des Feed-Fensters geändertes Dokument kann übersehen werden. Veröffentlichungsdatum wird nur übernommen, wenn die Quelle es liefert. Aus Abrufdatum oder Atom-`updated` wird kein Veröffentlichungsdatum erfunden. Die Details führen separate Abruf- und Änderungszeiten. Verlinkte HTML/PDF-Dokumente, Fristsemantik und Termine werden noch nicht als vollständige eigene Dokument-/Eventmodelle extrahiert. Daher kann keine flächendeckende regulatorische Frühwarnabdeckung behauptet werden.

Ein leeres oder fehlgeschlagenes Feed-Ergebnis gilt nicht als Entwarnung. Bestehende Befunde bleiben bei Ausfall erhalten. Datenänderungen außerhalb des erfassten Titel-/Text-/Metadatenstands werden nicht erkannt.

Die Stufen A–E, interne Eskalationsschwellen, Zuständigkeiten, Materialität und interne Hebel sind in der übergebenen Spezifikation nicht definiert. Sie werden nicht erfunden. Das Modell bildet zunächst Quellen, Einträge, Versionen, Ereignisse, Briefings, Quellenstatus und Cron-Metadaten ab; serverseitige Mehrnutzer-Präferenzen, Zuweisungen und Workflows sind noch nicht umgesetzt. Die Regel-Triage ist bewusst konservativ, kann semantische Zusammenhänge übersehen und ist keine juristische oder fachlich freigegebene Bewertung. KI-Belegprüfung prüft Zitatvorkommen, nicht die logische Richtigkeit einer Schlussfolgerung.

## Prüfungen

```sh
npm test
npm run typecheck
npm run build -- --webpack
npm run build:ios
```

Tests prüfen RSS/Atom-Parsing, sichere URLs, Hashänderungen, vorsichtige Triage, Sommer-/Winterzeit, persistente Erstimporte, neue/geänderte/unveränderte Einträge, unveränderliche Briefings und Datenbestand bei Quellenausfall. UI-Funktionalität auf dem physischen Gerät ist zusätzlich im tatsächlichen Nutzungsablauf zu prüfen.

## Technische Quellen

- Offizielle Bundestags-Feeds: https://www.bundestag.de/services/rss/feeds_allgemein-249014
- BAFA-Feed (auf der amtlichen Homepage verlinkt): https://www.bafa.de/DE/Service/RSSNewsfeed/_functions/rssnewsfeed.xml
- DIP-API: https://search.dip.bundestag.de/api/v1/swagger-ui/
- Next.js-Export: https://nextjs.org/docs/app/guides/static-exports
- Capacitor: https://capacitorjs.com/docs
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- Vercel Cron: https://vercel.com/docs/cron-jobs und https://vercel.com/docs/cron-jobs/manage-cron-jobs
