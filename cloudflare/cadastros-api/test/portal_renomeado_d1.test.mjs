// Portal renomeado: fluxo completo contra SQLite em memória com as migrações reais.
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

// ---- dados: nome antigo e novo do Portal (mesmo contrato + cartão), um terceiro Portal que divide o cartão sem ser o mesmo
let raw = 1;
const post = (grafia, data, cartao, n = 1, valor = 10, local = 'METRO', origem = 'PORTAL') => {
  for (let i = 0; i < n; i++) sqlite.prepare(`INSERT INTO cid_postagens(raw_id, origem, grafia, cliente_portal, local_codigo, contrato, cartao, data_postagem, valor, impressao) VALUES (?,?,?,?,?,?,?,?,?, 'x')`)
    .run(raw++, origem, grafia, origem === 'PORTAL' ? grafia : '', local, cartao ? '9912582374' : '', cartao, data, valor);
};
const ANTIGO = 'FUNDAÇÃO PARA O DESENVOLVIMENTO CIENTÍFICO E TECNOLÓGICO EM', NOVO = 'FIOTEC FUND DESENV CIENT E TECN SAUDE';
post(ANTIGO, '2026-05-04', '79041604', 30); post(ANTIGO, '2026-09-09', '79041604', 5);
post(NOVO, '2026-09-10', '79041604', 8); post(NOVO, '2026-09-28', '79041604', 2);
post('OUTRA EMPRESA DE SERVICOS LTDA', '2026-06-01', '79041604', 20); post('OUTRA EMPRESA DE SERVICOS LTDA', '2026-09-27', '79041604', 20);   // divide o cartão, mas posta junto
post('SEM RELACAO NENHUMA COMERCIO', '2026-09-20', '11111111', 6);

let ok = 0; const t = async (nome, fn) => { await fn(); ok++; console.log('ok -', nome); };
await executarMotorD1(env, 'TESTE');
const idDe = async (grafia) => (await DB.prepare(`SELECT n.cliente_id id FROM cid_grafias g JOIN cid_nos n ON n.chave=g.no_chave WHERE g.origem='PORTAL' AND g.grafia=?`).bind(grafia).first()).id;
const idAntigo = await idDe(ANTIGO), idNovo = await idDe(NOVO);
// CRM tinha uma tratativa no ID antigo
sqlite.prepare(`INSERT INTO crm_tratativas(TRATATIVA_ID, TIPO_ENTIDADE, ENTIDADE_ID, FUNIL_ID, ETAPA_ID, STATUS_TRATATIVA) VALUES ('T1','CLIENTE',?,'FUNIL_CLIENTES','C_TRATATIVA','ABERTA')`).run(idAntigo);

await t('antes: dois cadastros do Portal separados', async () => {
  assert.notEqual(idAntigo, idNovo);
});
await t('ficha mostra o nome antigo como candidato (mesmo cartão, um parou quando o outro começou)', async () => {
  const f = await chamar('/api/v2/clientes/' + idNovo);
  assert.equal(f.portalRenomeado.length, 1);
  assert.equal(f.portalRenomeado[0].id, idAntigo);
  assert.equal(f.portalRenomeado[0].papel, 'ANTIGO');
  assert.match(f.portalRenomeado[0].cartoes, /79041604/);
});
await t('agrupar dois Portais sem confirmar a renomeação é recusado', async () => {
  const r = await chamar('/api/v2/agrupar', { clientes: [idNovo, idAntigo] });
  assert.equal(r.status, 409); assert.equal(r.codigo, 'DOIS_PORTAIS');
});
await t('sem cartão em comum pede confirmação extra', async () => {
  const outro = await idDe('SEM RELACAO NENHUMA COMERCIO');
  const r = await chamar('/api/v2/agrupar', { clientes: [idNovo, outro], portalRenomeado: true });
  assert.equal(r.status, 409); assert.equal(r.codigo, 'SEM_CARTAO_COMUM');
});
await t('Portal renomeado: junta, usa o nome mais recente e o ID do nome atual', async () => {
  const r = await chamar('/api/v2/agrupar', { clientes: [idNovo, idAntigo], portalRenomeado: true, destino: idNovo });
  assert.equal(r.ok, true);
  assert.equal(await idDe(ANTIGO), await idDe(NOVO));
  const c = await DB.prepare(`SELECT * FROM cid_clientes WHERE id=?`).bind(r.clienteId).first();
  assert.equal(c.nome, NOVO); assert.equal(c.fonte_nome, 'PORTAL');
  assert.equal(r.clienteId, await hashId('CLI_P', 'P:' + analisarNome(NOVO).core));
  assert.equal(await DB.prepare(`SELECT COUNT(*) n FROM cid_clientes WHERE id=?`).bind(idAntigo).first().then((x) => x.n), 0);
});
await t('CRM acompanha: tratativa do ID antigo vai para o ID que ficou; ID antigo redireciona', async () => {
  const tr = await DB.prepare(`SELECT ENTIDADE_ID FROM crm_tratativas WHERE TRATATIVA_ID='T1'`).first();
  assert.equal(tr.ENTIDADE_ID, idNovo);
  const f = await chamar('/api/v2/clientes/' + idAntigo);
  assert.equal(f.redirecionar, idNovo);
});
await t('ficha do cliente junto: 2 grafias do Portal, histórico somado, sem candidato repetido', async () => {
  const f = await chamar('/api/v2/clientes/' + idNovo);
  assert.equal(f.grafias.filter((g) => g.origem === 'PORTAL').length, 2);
  assert.equal(f.locais.reduce((s, l) => s + l.postagens, 0), 45);
  assert.equal(f.portalRenomeado.length, 0);
});
await t('motor de novo (cron) mantém a junção', async () => {
  await executarMotorD1(env, 'SISTEMA');
  assert.equal(await idDe(ANTIGO), idNovo);
});
await t('desfazer: tirar a grafia antiga separa de novo', async () => {
  const chave = 'P:' + analisarNome(ANTIGO).core;
  const r = await chamar('/api/v2/tirar-grafia', { clienteId: idNovo, chave });
  assert.equal(r.ok, true);
  assert.notEqual(await idDe(ANTIGO), await idDe(NOVO));
  const f = await chamar('/api/v2/clientes/' + idNovo);
  assert.equal(f.portalRenomeado.length, 0, 'separado manualmente não volta como candidato');
});
console.log(`\n${ok} testes do Portal renomeado passaram`);
