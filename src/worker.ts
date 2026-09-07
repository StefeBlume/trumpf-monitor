import {dashboard,runMonitor,history,archive} from './server/monitor';
interface Bindings {DB:D1Database;ASSETS:Fetcher;}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
 async fetch(req:Request,env:Bindings):Promise<Response>{
  const u=new URL(req.url),path=u.pathname;
  if(path==='/api/health')return json({ok:true,service:'Policy Monitor',mode:'cloud'});
  if(path.startsWith('/api/')){
   // Private Sites gateway authenticates and restricts access to the sole owner.
   if(!req.headers.get('oai-authenticated-user-id'))return json({error:'Bitte mit deinem ChatGPT-Konto anmelden.',signInRequired:true},401);
   if(!['GET','HEAD'].includes(req.method)&&req.headers.get('Origin')&&req.headers.get('Origin')!==u.origin)return json({error:'Ungültiger Ursprung'},403);
   try{
    if(path==='/api/dashboard'&&req.method==='GET')return json({...await dashboard(),hostingMode:'cloud'});
    if(path==='/api/run'&&req.method==='POST')return json({briefing:await runMonitor()});
    if(/^\/api\/history\/[a-f0-9]{24}$/.test(path)&&req.method==='GET')return json(await history(path.split('/').at(-1)!));
    if(/^\/api\/items\/[a-f0-9]{24}$/.test(path)&&req.method==='PATCH'){
     const body=await req.json() as {archived?:unknown};if(typeof body.archived!=='boolean')return json({error:'Ungültiger Status'},400);
     await archive(path.split('/').at(-1)!,body.archived);return json({ok:true});
    }
    return json({error:'Nicht gefunden'},404);
   }catch(e){const message=e instanceof Error?e.message:'';console.error('monitor_api_error',path,message);return json({error:message.includes('bereits aktiv')?'Ein Quellenlauf läuft bereits. Bitte in Kürze aktualisieren.':'Die Online-Prüfung ist fehlgeschlagen. Dein letzter Stand bleibt erhalten.'},message.includes('bereits aktiv')?409:500);}
  }
  const response=await env.ASSETS.fetch(req);
  const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');
  return new Response(response.body,{status:response.status,headers});
 }
};
