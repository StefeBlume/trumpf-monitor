import {sqliteTable,text,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';
export const items=sqliteTable('items',{id:text('id').primaryKey(),sourceId:text('source_id').notNull(),data:text('data').notNull()},t=>[index('items_source').on(t.sourceId)]);
export const versions=sqliteTable('versions',{itemId:text('item_id').notNull(),version:integer('version').notNull(),data:text('data').notNull()},t=>[primaryKey({columns:[t.itemId,t.version]})]);
export const events=sqliteTable('events',{id:text('id').primaryKey(),runId:text('run_id').notNull(),data:text('data').notNull()});
export const briefings=sqliteTable('briefings',{id:text('id').primaryKey(),day:text('day').notNull(),data:text('data').notNull()});
export const sourceState=sqliteTable('source_state',{id:text('id').primaryKey(),data:text('data').notNull()});
export const locks=sqliteTable('locks',{id:text('id').primaryKey(),owner:text('owner').notNull(),expires:integer('expires').notNull()});
export const cronDays=sqliteTable('cron_days',{day:text('day').primaryKey(),completedAt:text('completed_at').notNull()});
