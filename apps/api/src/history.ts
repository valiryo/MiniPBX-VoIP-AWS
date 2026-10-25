import { DatabaseSync } from 'node:sqlite';
import type { Call } from './calls.js';
import { active } from './calls.js';

export class History {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA auto_vacuum=FULL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, document TEXT NOT NULL);`);
    for (const call of this.list()) {
      if (active(call)) {
        call.state = 'unknown'; call.reason = 'api_restarted'; call.durationMs = null;
        call.updatedAt = new Date().toISOString();
        call.events.push({ kind: 'local', observedAt: call.updatedAt, fields: { Event: 'Observation', Reason: 'api_restarted' } });
        call.events = call.events.slice(-120);
        this.save(call);
      }
    }
  }
  save(call: Call): void {
    this.db.prepare('INSERT INTO calls(id,created_at,document) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document')
      .run(call.id, call.createdAt, JSON.stringify(call));
    this.db.exec('DELETE FROM calls WHERE id IN (SELECT id FROM calls ORDER BY created_at DESC LIMIT -1 OFFSET 100)');
  }
  list(): Call[] {
    return this.db.prepare('SELECT document FROM calls ORDER BY created_at DESC LIMIT 100').all()
      .map(row => JSON.parse(String(row.document)) as Call);
  }
  get(id: string): Call | undefined {
    const row = this.db.prepare('SELECT document FROM calls WHERE id=?').get(id);
    return row ? JSON.parse(String(row.document)) as Call : undefined;
  }
  close(): void { this.db.close(); }
}
