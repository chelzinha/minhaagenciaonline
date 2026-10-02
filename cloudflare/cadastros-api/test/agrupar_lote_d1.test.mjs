// Agrupar em lote (cartões de sugestão da página): contra SQLite em memória com as migrações reais.
// Precisa do Node 22.13 ou mais novo (node:sqlite). Roda em: npm run test:crm
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';
import { executarMotorD1, hashId } from '../src/persistencia.js';
import { analisarNome } from '../src/motor.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const sqlite = new DatabaseSync(':memory:');
for (const f of fs.readdirSync(path.resolve(aqui, '../migrations')).filter((x) => /^01\d\d_.*\.sql$/.test(x)).sort())
  sqlite.exec(fs.readFileSync(path.resolve(aqui, '../migrations', f), 'utf8'));
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
function stmt(sql, binds = []) {
  return {
    bind: (...b) => stmt(sql, b.map(norm)),
    all: async () => ({ results: sqlite.prepare(sql).all(...binds) }),
    first: async () => sqlite.prepare(sql).get(...binds) ?? null,
    run: async () => { const r = sqlite.prepare(sql).run(...binds); return { meta: { changes: r.changes } }; },
    _exec: () => (/^\s*(SELECT|WITH)/i.test(sql) ? { results: sqlite.prepare(sql).all(...binds) } : (sqlite.prepare(sql).run(...binds), { results: [] })),
  };
}
const DB = { prepare: (sql) => stmt(sql), batch: async (lista) => { sqlite.exec('BEGIN'); try { const r = lista.map((s) => s._exec()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
const env = { DB, AGF_AUTH_API_URL: 'https://auth.teste/validar' };
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, user: { username: 'rachel', role: 'admin' } }), { headers: { 'content-type': 'application/json' } });
const chamar = async (caminho, corpo) => {
  const r = await worker.fetch(new Request('https://api.teste' + caminho, { method: corpo ? 'POST' : 'GET', headers: { Authorization: 'Bearer tok', 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }), env, { waitUntil() {} });
  return { status: r.status, ...(await r.json()) };
};

let raw = 1;
const post = (grafia, origem, n = 1, data = '2026-09-10', local = 'BALCAO') => {
  for (let i = 0; i < n; i++) sqlite.prepare(`INSERT INTO cid_postagens(raw_id, origem, grafia, cliente_portal, local_codigo, contrato, cartao, data_postagem, valor, impressao) VALUES (?,?,?,?,?,?,?,?,?, 'x')`)
    .run(raw++, origem, grafia, origem === 'PORTAL' ? grafia : '', local, '', '', data, 10);
};
post('ISABEL MARIA PINHEIRO ARRUDA', 'BALCAO', 1); post('ISABEL PINHEIRO', 'BALCAO', 3);
post('VERA LUCIA DE ANDRADE GOMES', 'BALCAO', 2); post('VERA GOMES', 'BALCAO', 1);
post('CLEO MAR REBOUCAS', 'BALCAO', 1); post('CLEO REBOUCAS', 'BALCAO', 1);
post('EMPRESA ALFA SERVICOS LTDA', 'PORTAL', 5, '2026-09-10', 'AGF'); post('BETA COMERCIO DE ROUPAS', 'PORTAL', 2, '2026-09-11', 'AGF');
post('NAO MEXER FULANO DE TAL', 'BALCAO', 2);

let ok = 0; const t = async (nome, fn) => { await fn(); ok++; console.log('ok -', nome); };
await executarMotorD1(env, 'TESTE');
const idDe = async (grafia) => (await DB.prepare(`SELECT n.cliente_id id FROM cid_grafias g JOIN cid_nos n ON n.chave=g.no_chave WHERE g.grafia=?`).bind(grafia).first()).id;
const nomeDe = async (id) => (await DB.prepare(`SELECT nome FROM cid_clientes WHERE id=?`).bind(id).first())?.nome;
const [isa1, isa2, vera1, vera2, cleo1, cleo2, alfa1, alfa2, nao] = await Promise.all(['ISABEL MARIA PINHEIRO ARRUDA', 'ISABEL PINHEIRO', 'VERA LUCIA DE ANDRADE GOMES', 'VERA GOMES',
  'CLEO MAR REBOUCAS', 'CLEO REBOUCAS', 'EMPRESA ALFA SERVICOS LTDA', 'BETA COMERCIO DE ROUPAS', 'NAO MEXER FULANO DE TAL'].map(idDe));
const decisoesAntes = (await DB.prepare(`SELECT COUNT(*) n FROM cid_decisoes`).first()).n;

await t('antes: cadastros separados', async () => {
  assert.notEqual(isa1, isa2); assert.notEqual(vera1, vera2); assert.notEqual(cleo1, cleo2);
});
await t('lote vazio é recusado', async () => {
  const r = await chamar('/api/v2/agrupar-lote', { itens: [] });
  assert.equal(r.status, 400);
});
let r;
await t('lote: agrupa os cartões válidos, aplica o nome final de cada um e pula os que precisam de confirmação', async () => {
  r = await chamar('/api/v2/agrupar-lote', { itens: [
    { clientes: [isa1, isa2], nome: 'isabel maria pinheiro arruda', destino: isa2 },
    { clientes: [vera1, vera2], nome: 'VERA LUCIA GOMES', destino: vera1 },
    { clientes: [cleo1, cleo2], nome: 'CLEO MAR REBOUCAS', destino: cleo1 },
    { clientes: [alfa1, alfa2], nome: '', destino: alfa1 },                 // 2 clientes do Portal: precisa do cartão
    { clientes: [cleo2, nao], nome: 'X', destino: nao },                    // cadastro repetido no lote
    { clientes: [nao], nome: 'X', destino: nao },                           // só 1 marcado
  ] });
  assert.equal(r.ok, true);
  assert.equal(r.agrupados, 3);
  assert.deepEqual(r.pulados.map((p) => p.indice), [3, 4, 5]);
  assert.match(r.pulados[0].motivo, /Portal/);
  assert.match(r.pulados[1].motivo, /outro cartão/);
});
await t('resultado igual ao agrupar individual (mesmo ID e nome final)', async () => {
  assert.equal(await idDe('ISABEL MARIA PINHEIRO ARRUDA'), await idDe('ISABEL PINHEIRO'));
  assert.equal(await nomeDe(await idDe('ISABEL PINHEIRO')), 'ISABEL MARIA PINHEIRO ARRUDA');
  assert.equal(await nomeDe(await idDe('VERA GOMES')), 'VERA LUCIA GOMES');
  assert.equal(await idDe('CLEO MAR REBOUCAS'), await idDe('CLEO REBOUCAS'));
  assert.equal(r.itens.length, 3);
  assert.equal(r.itens.find((x) => x.indice === 1).clienteId, await idDe('VERA GOMES'));
});
await t('cartões pulados não mudam nada', async () => {
  assert.notEqual(await idDe('EMPRESA ALFA SERVICOS LTDA'), await idDe('BETA COMERCIO DE ROUPAS'));
  assert.notEqual(await idDe('NAO MEXER FULANO DE TAL'), await idDe('CLEO REBOUCAS'));
});
await t('decisões gravadas como manuais (a limpeza lembra delas)', async () => {
  const d = await DB.prepare(`SELECT tipo, COUNT(*) n FROM cid_decisoes WHERE autor='rachel' AND ativo=1 GROUP BY tipo`).all();
  const m = Object.fromEntries(d.results.map((x) => [x.tipo, x.n]));
  assert.equal(m.UNIR, 3); assert.equal(m.NOME, 3);
  assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM cid_decisoes`).first()).n, decisoesAntes + 6);
  await executarMotorD1(env, 'TESTE');
  assert.equal(await nomeDe(await idDe('VERA GOMES')), 'VERA LUCIA GOMES');
});
await t('agrupar individual continua igual', async () => {
  const x = await chamar('/api/v2/agrupar', { clientes: [await idDe('NAO MEXER FULANO DE TAL'), await idDe('CLEO REBOUCAS')], nome: 'CLEO MAR REBOUCAS' });
  assert.equal(x.ok, true);
  assert.equal(await idDe('NAO MEXER FULANO DE TAL'), await idDe('CLEO REBOUCAS'));
});
await t('só cartões inválidos: nada é gravado', async () => {
  const antes = (await DB.prepare(`SELECT COUNT(*) n FROM cid_decisoes`).first()).n;
  const x = await chamar('/api/v2/agrupar-lote', { itens: [{ clientes: [alfa1, alfa2] }] });
  assert.equal(x.agrupados, 0); assert.equal(x.pulados.length, 1);
  assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM cid_decisoes`).first()).n, antes);
});

console.log(`\n${ok} testes do agrupar em lote passaram`);
