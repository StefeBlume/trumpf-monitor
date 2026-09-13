// Startet die Entwicklungsfassung auf Port 4180. Laeuft sie bereits - etwa aus einem anderen Terminal-Tab -,
// brach "npm run dev" frueher mit "EADDRINUSE: address already in use" ab, obwohl die App erreichbar war.
import net from 'node:net';
import {spawn} from 'node:child_process';

const PORT = 4180;
const belegt = await new Promise(fertig => {
  const probe = net.createServer();
  probe.once('error', e => fertig(e.code === 'EADDRINUSE'));
  probe.once('listening', () => probe.close(() => fertig(false)));
  probe.listen(PORT, '0.0.0.0');
});

if (belegt) {
  let antwortet = false;
  try { antwortet = (await fetch(`http://localhost:${PORT}/`, {signal: AbortSignal.timeout(8000)})).ok; } catch {}
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

const kind = spawn('next', ['dev', '--hostname', '0.0.0.0', '--port', String(PORT)], {stdio: 'inherit'});
kind.on('exit', code => process.exit(code ?? 0));
