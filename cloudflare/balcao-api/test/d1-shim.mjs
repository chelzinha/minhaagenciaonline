// D1 em memória para testes (node:sqlite, Node 22.13+). Aplica as migrations reais.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

export function criarD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
  const norm = (sql) => sql.replace(/\?(\d+)/g, '?');               // D1 aceita ?1; aqui reordena pelos índices
  function stmt(sql, args = []) {
    const ordem = [...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1]) - 1);
    const vals = () => (ordem.length ? ordem.map((i) => args[i]) : args).map((v) => (v === undefined ? null : v));
    const s = () => db.prepare(norm(sql));
    return {
      sql,
      bind: (...a) => stmt(sql, a),
      first: async () => s().get(...vals()) ?? null,
      all: async () => ({ results: s().all(...vals()) }),
      run: async () => { const r = s().run(...vals()); return { meta: { changes: Number(r.changes) } }; },
      _exec: () => (/^\s*(SELECT|WITH)/i.test(sql) || /RETURNING/i.test(sql) ? { results: s().all(...vals()) } : { results: [], meta: { changes: Number(s().run(...vals()).changes) } }),
    };
  }
  return { prepare: (sql) => stmt(sql), batch: async (lista) => lista.map((x) => x._exec()), _db: db };
}
