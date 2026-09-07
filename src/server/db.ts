import {createClient,type Client} from '@libsql/client';
import {mkdirSync} from 'node:fs';
let client:Client|undefined;
export async function db():Promise<Client>{
 if(client)return client;
 if(process.env.VERCEL&&!process.env.DATABASE_URL)throw new Error('Persistente DATABASE_URL für Hosting fehlt');
 if(!process.env.DATABASE_URL)mkdirSync('data',{recursive:true});
 const c=createClient({url:process.env.DATABASE_URL||'file:data/monitor.db',authToken:process.env.DATABASE_AUTH_TOKEN});
 await c.batch([
 'CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, data TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS versions (item_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(item_id,version))',
 'CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, data TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS briefings (id TEXT PRIMARY KEY, day TEXT NOT NULL, data TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS source_state (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS locks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS cron_days (day TEXT PRIMARY KEY, completed_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS items_source ON items(source_id)'
 ],'write');
 client=c;return c;
}
export async function resetDBForTests(){client?.close();client=undefined;}
