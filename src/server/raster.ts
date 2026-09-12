import {createHash} from 'node:crypto';
import {TOPICS} from './topics';
// Fingerabdruck des Themenrasters: Begriffe, Ausnahmen, Kontextregeln. Dokumente wie Vorhaben aus dem
// Lobbyregister tragen die Themen ihres Eingangs. Aendert sich das Raster, muessen beide neu gescannt
// werden - fuer Dokumente vergass ich das einmal von Hand, fuer Vorhaben war es gar nicht vorgesehen.
export function rasterFingerabdruck(topics:unknown=TOPICS):string{
 const raster=JSON.stringify(topics,(_k,v)=>v instanceof RegExp?`/${v.source}/${v.flags}`:v);
 return createHash('sha256').update(raster).digest('hex').slice(0,12);
}
export const RASTER=rasterFingerabdruck();
