// Startet die Entwicklungsfassung auf Port 4180, nur fuer diesen Mac. Auf 0.0.0.0 war sie im ganzen WLAN erreichbar
// und lieferte dort unter /connection.json den Verbindungsschluessel aus; das Handy nutzt die veroeffentlichte Seite.
// Laeuft sie bereits - etwa aus einem anderen Terminal-Tab -,
// brach "npm run dev" frueher mit "EADDRINUSE: address already in use" ab, obwohl die App erreichbar war.
import net from 'node:net';
import {spawn} from 'node:child_process';

const PORT = 4180;
const HOST = '127.0.0.1';
// Gefragt wird per Verbindung, nicht per Belegungsversuch: Lauscht eine aeltere Fassung auf allen Adressen,
// liess sich 127.0.0.1:4180 trotzdem belegen - und es waere ein zweiter Server gestartet.
const belegt = await new Promise(fertig => {
  const probe = net.connect(PORT, HOST);
  probe.once('connect', () => { probe.destroy(); fertig(true); });
  probe.once('error', () => fertig(false));
});

if (belegt) {
  let antwortet = false;
  try { antwortet = (await fetch(`http://${HOST}:${PORT}/`, {signal: AbortSignal.timeout(8000)})).ok; } catch {}
  if (antwortet) {
    console.log(`\nDie App läuft bereits: http://localhost:${PORT}\n` +
      `Einfach diese Adresse im Browser öffnen. Codeänderungen übernimmt sie von selbst.\n` +
      `Neu starten: im Terminal-Fenster, in dem sie läuft, Strg + C drücken und danach erneut "npm run dev" ausführen.\n`);
    process.exit(0);
  }
  console.error(`\nPort ${PORT} ist belegt, aber dort antwortet nicht diese App.\n` +
    `Welches Programm ihn belegt, zeigt: lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n`);
  process.exit(1);
}

const kind = spawn('next', ['dev', '--hostname', HOST, '--port', String(PORT)], {stdio: 'inherit'});
kind.on('exit', code => process.exit(code ?? 0));
