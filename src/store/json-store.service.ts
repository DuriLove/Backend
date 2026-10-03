import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Database } from '../types';

export function emptyDb(): Database {
  return { users: [], boards: [], cards: [], dates: [], shares: [], resolutions: [] };
}

function validateDb(value: unknown): Database {
  if (!value || typeof value !== 'object') throw new Error('INVALID_LEGACY_DATABASE');
  const db = value as Database;
  for (const key of ['users', 'boards', 'cards', 'dates', 'shares'] as const) {
    if (!Array.isArray(db[key]) || db[key].some(item => !item || typeof item.id !== 'string')) {
      throw new Error('INVALID_LEGACY_DATABASE');
    }
    if (new Set(db[key].map(item => item.id)).size !== db[key].length) throw new Error('DUPLICATE_LEGACY_ID');
  }
  if (db.resolutions !== undefined && !Array.isArray(db.resolutions)) throw new Error('INVALID_LEGACY_DATABASE');
  return { ...db, resolutions: db.resolutions ?? [] };
}

/** Compatibility name retained for existing board services. SQLite is the durable store. */
@Injectable()
export class JsonStoreService implements OnModuleInit, OnApplicationShutdown {
  private connection!: DatabaseSync;
  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const file = this.config.get<string>('DATABASE_FILE', 'data/store.sqlite');
    const target = file === ':memory:' ? file : resolve(file);
    if (target !== ':memory:') mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    this.connection = new DatabaseSync(target);
    this.connection.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    try {
      this.connection.exec('BEGIN IMMEDIATE');
      this.connection.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
        INSERT OR IGNORE INTO schema_migrations VALUES (1, datetime('now'));
      `);
      if (!this.connection.prepare('SELECT id FROM app_state WHERE id=1').get()) {
        let initial = emptyDb();
        const legacy = this.config.get<string>('LEGACY_DATA_FILE') ?? this.config.get<string>('DATA_FILE');
        if (legacy && existsSync(resolve(legacy))) initial = validateDb(JSON.parse(readFileSync(resolve(legacy), 'utf8')));
        this.connection.prepare('INSERT INTO app_state VALUES(1,?)').run(JSON.stringify(initial));
      }
      const current=this.snapshot();
      if (this.config.get('NODE_ENV')==='production' && current.users.some(user=>['sumin@duri.local','duri@duri.local'].includes(user.email))) {
        throw new Error('DEMO_ACCOUNTS_FORBIDDEN_IN_PRODUCTION');
      }
      this.connection.exec('COMMIT');
      if (target !== ':memory:') chmodSync(target, 0o600);
    } catch (error) {
      try { this.connection.exec('ROLLBACK'); } catch { /* already rolled back */ }
      this.connection.close();
      throw error;
    }
  }

  snapshot(): Database {
    const row = this.connection.prepare('SELECT payload FROM app_state WHERE id=1').get() as { payload: string };
    return JSON.parse(row.payload) as Database;
  }

  async mutate<T>(fn: (db: Database) => T): Promise<T> {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const draft = this.snapshot();
      const value = fn(draft);
      if (value && typeof (value as { then?: unknown }).then === 'function') throw new Error('ASYNC_TRANSACTION_CALLBACK');
      this.connection.prepare('UPDATE app_state SET payload=? WHERE id=1').run(JSON.stringify(draft));
      this.connection.exec('COMMIT');
      return structuredClone(value);
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  consumeLimit(key: string, max: number, windowMs: number): number {
    const now = Date.now();
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      this.connection.prepare('DELETE FROM request_limits WHERE resets_at<=?').run(now);
      const old = this.connection.prepare('SELECT count,resets_at FROM request_limits WHERE key=?').get(key) as
        { count: number; resets_at: number } | undefined;
      if (old && old.count >= max) { this.connection.exec('COMMIT'); return old.resets_at - now; }
      this.connection.prepare(`INSERT INTO request_limits VALUES(?,1,?)
        ON CONFLICT(key) DO UPDATE SET count=count+1`).run(key, now + windowMs);
      this.connection.exec('COMMIT');
      return 0;
    } catch (error) { this.connection.exec('ROLLBACK'); throw error; }
  }

  healthy() { return Boolean(this.connection.prepare('SELECT 1').get()); }
  close() { this.connection?.close(); }
  onApplicationShutdown() { this.close(); }
}
