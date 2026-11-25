import { DurableObject } from "cloudflare:workers";

const HOUR_MS = 60 * 60 * 1000;

export class TrialQuota extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS scans (used_at INTEGER NOT NULL)");
    });
  }

  consume(limit: number) {
    const now = Date.now();
    const { sql } = this.ctx.storage;
    return this.ctx.storage.transactionSync(() => {
      sql.exec("DELETE FROM scans WHERE used_at <= ?", now - HOUR_MS);
      const { used } = sql.exec<{ used: number }>("SELECT COUNT(*) AS used FROM scans").one();
      if (used >= limit) {
        const next = sql.exec<{ used_at: number }>("SELECT used_at FROM scans ORDER BY used_at LIMIT 1 OFFSET ?", used - limit).one();
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((next.used_at + HOUR_MS - now) / 1000)) };
      }
      sql.exec("INSERT INTO scans (used_at) VALUES (?)", now);
      return { allowed: true, retryAfter: 0 };
    });
  }
}
