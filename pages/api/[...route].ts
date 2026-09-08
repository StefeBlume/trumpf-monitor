import type {NextApiRequest,NextApiResponse} from 'next';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {dashboard,runMonitor,history,archive} from '../../src/server/monitor';
export const config={api:{bodyParser:{sizeLimit:'32kb'}},maxDuration:300};
function authorized(req:NextApiRequest,secret:string|undefined){if(!secret)return false;const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(req.headers.authorization??'');return expected.length===actual.length&&timingSafeEqual(expected,actual);}
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const origin=req.headers.origin;
 if(origin==='capacitor://localhost'){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');}
 if(req.method==='OPTIONS'){res.status(204).end();return;}
 const route=(req.query.route as string[]??[]).join('/');
 if(route==='health'&&req.method==='GET'){res.json({ok:true,service:'Policy Monitor',authenticationRequired:true});return;}
 if(!authorized(req,route==='cron'?process.env.CRON_SECRET:process.env.APP_TOKEN)){res.status(401).json({error:'Verbindungsschlüssel fehlt oder ist ungültig. Bitte Verbindung prüfen.'});return;}
 try{
 if(route==='dashboard'&&req.method==='GET'){res.json(await dashboard());return;}
 if(route==='run'&&req.method==='POST'){res.json({briefing:await runMonitor()});return;}
 if(route==='cron'&&req.method==='GET'){res.json({briefing:await runMonitor()});return;}
 if(route.startsWith('history/')&&req.method==='GET'){res.json(await history(z.string().regex(/^[a-f0-9]{24}$/).parse(route.split('/')[1])));return;}
 if(route.startsWith('items/')&&req.method==='PATCH'){const body=z.object({archived:z.boolean()}).strict().parse(req.body);await archive(z.string().regex(/^[a-f0-9]{24}$/).parse(route.split('/')[1]),body.archived);res.json({ok:true});return;}
 res.status(404).json({error:'Nicht gefunden'});
 }catch(e){const message=e instanceof Error?e.message:'Unbekannter Fehler';const status=message.includes('bereits aktiv')?409:e instanceof z.ZodError?400:500;console.error(JSON.stringify({event:'api_error',route,message:status===500?'internal_error':message}));res.status(status).json({error:status===500?'Der Vorgang ist fehlgeschlagen. Bitte Serverkonfiguration und Quellenstatus prüfen.':message});}
}
