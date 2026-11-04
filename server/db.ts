import { createClient, type Client } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export async function migrate(db: Client) {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('learner','educator')), password_hash TEXT, guest INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), slug TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS progress (user_id TEXT NOT NULL REFERENCES users(id), slug TEXT NOT NULL, missions TEXT NOT NULL DEFAULT '{}', predict TEXT, quiz_best INTEGER, quiz_last INTEGER, answers TEXT NOT NULL DEFAULT '{}', seconds REAL NOT NULL DEFAULT 0, runs INTEGER NOT NULL DEFAULT 0, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(user_id,slug))`,
    `CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS class_members (class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(class_id,user_id))`,
    `CREATE INDEX IF NOT EXISTS events_user_at ON events(user_id,at)`,
    `CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)`,
  ], 'write');
}

export async function openDatabase() {
  const url = process.env.DATABASE_URL || 'file:./data/inside-ai.db';
  if (url.startsWith('file:') && !url.includes(':memory:')) mkdirSync(dirname(resolve(url.slice(5))), { recursive: true });
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  await migrate(db);
  return db;
}
