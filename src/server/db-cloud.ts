import {env} from 'cloudflare:workers';
type Statement=string|{sql:string;args?:unknown[]};
const connection=()=> (env as unknown as {DB:D1Database}).DB;
function prepare(query:Statement){const q=typeof query==='string'?{sql:query,args:[]}:query;return connection().prepare(q.sql).bind(...(q.args??[]));}
function normalized(r:D1Result){return {rows:r.results??[],rowsAffected:r.meta.changes??0};}
export async function db(){return {execute:async(q:Statement)=>normalized(await prepare(q).all()),batch:async(q:Statement[],_mode?:string)=>(await connection().batch(q.map(prepare))).map(normalized)};}
export async function resetDBForTests(){}
