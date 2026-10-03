// Fluxo cliente -> fila do atendente com D1 real em memória (Node 22.13+).
import assert from 'node:assert/strict';
import { criarD1 } from './d1-shim.mjs';
import worker from '../src/index.js';

console.warn = () => {}; console.log = ((log) => (...a) => { if (!String(a[0]).startsWith('[BALCAO]')) log(...a); })(console.log);
const DB = criarD1();
const CEPS = { '60055974': { uf: 'CE', localidade: 'Fortaleza' }, '01001000': { uf: 'SP', localidade: 'São Paulo' }, '60115170': { uf: 'CE', localidade: 'Fortaleza' } };
const chamadas = [];
globalThis.fetch = async (url, op) => {
  url = String(url); chamadas.push(url);
  const r = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('script.google.com')) return r({ ok: true, user: { username: 'helena', displayName: 'Helena', role: 'user', apps: ['balcao'] } });
  if (url.endsWith('/autentica/cartaopostagem')) return r({ token: 't', expiraEm: new Date(Date.now() + 864e5).toISOString() });
  let m = url.match(/\/cep\/v2\/enderecos\/(\d{8})$/); if (m) return CEPS[m[1]] ? r({ cep: m[1], ...CEPS[m[1]] }) : r({}, 404);
  m = url.match(/\/prazo\/v1\/nacional\/(\d{5})/); if (m) return r({ prazoEntrega: m[1] === '04014' ? 1 : 6, dataMaxima: '2026-10-06T23:59:59' });
  if (url.includes('viacep')) return r({ erro: true });
  throw new Error('URL inesperada ' + url);
};
const env = { DB, CORREIOS_USUARIO: 'u', CORREIOS_CODIGO_ACESSO: 'c', CORREIOS_CARTAO: '1', CEP_ORIGEM_PADRAO: '60055974', AGF_AUTH_API_URL: 'https://script.google.com/x', ALLOWED_ORIGINS: '' };
const ctx = { waitUntil: () => {} };
const req = (metodo, rota, body, token) => worker.fetch(new Request('https://x' + rota, {
  method: metodo, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  body: body ? JSON.stringify(body) : undefined }), env, ctx).then(async (r) => ({ status: r.status, ...(await r.json()) }));

const remetente = { documento: '529.982.247-25', nome: 'José da Conceição', celular: '(85) 99999-1234', email: 'Jose@Mail.com', cep: '60115-170', endereco: 'Rua Barão de Aracati', numero: '100', complemento: 'apto 2º', bairro: 'Aldeota', cidade: 'Fortaleza', uf: 'ce' };
const destinatario = { documento: '', nome: 'Maria Ângela', cep: '01001-000', endereco: 'Praça da Sé', numero: 's/n', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' };
const cotacao = { cepDestino: '01001000', pesoG: 680 };

// 1. cotação pública sem medidas
const c = await req('POST', '/api/balcao/publico/cotar', cotacao);
assert.equal(c.status, 200); assert.equal(c.data.opcoes.find((o) => o.codigoServico === '04014').total, 97.3);

// 2. validação: CPF inválido e sem aceite
let s = await req('POST', '/api/balcao/publico/etiquetas', { local: 'AGF', servico: '04014', cotacao, remetente: { ...remetente, documento: '111.111.111-11' }, destinatario, aceite: true });
assert.equal(s.status, 422); assert.ok(s.campos['remetente.documento']);
s = await req('POST', '/api/balcao/publico/etiquetas', { local: 'AGF', servico: '04014', cotacao, remetente, destinatario, aceite: false });
assert.equal(s.status, 422);
s = await req('POST', '/api/balcao/publico/etiquetas', { local: 'AGF', servico: '04014', cotacao: { ...cotacao, cepDestino: '60115170' }, remetente, destinatario, aceite: true });
assert.equal(s.status, 422, 'CEP do destinatário diferente da cotação');

// 3. salva e padroniza
s = await req('POST', '/api/balcao/publico/etiquetas', { local: 'agf', servico: '04014', cotacao, remetente, destinatario, aceite: true });
assert.equal(s.status, 200, JSON.stringify(s)); assert.match(s.data.codigo, /^A-\d{4}$/); assert.equal(s.data.total, 97.3);
const s2 = await req('POST', '/api/balcao/publico/etiquetas', { local: 'METRO', servico: '04510', cotacao, remetente, destinatario, aceite: true });
assert.match(s2.data.codigo, /^M-\d{4}$/);

// 4. fila do atendente
assert.equal((await req('GET', '/api/balcao/etiquetas?local=AGF')).status, 401, 'fila exige login');
let f = await req('GET', '/api/balcao/etiquetas?local=AGF', null, 'tk');
assert.equal(f.data.pendentes, 1); assert.equal(f.data.etiquetas.length, 1, 'fila separada por local');
const e = f.data.etiquetas[0];
assert.equal(e.remetente.nome, 'JOSE DA CONCEICAO'); assert.equal(e.remetente.endereco, 'RUA BARAO DE ARACATI');
assert.equal(e.remetente.complemento, 'APTO 2'); assert.equal(e.remetente.email, 'jose@mail.com'); assert.equal(e.remetente.documento, '52998224725');
assert.equal(e.destinatario.numero, 'S/N'); assert.equal(e.destinatario.nome, 'MARIA ANGELA');

// 5. status: atender, concorrência, concluir com SRO
let st = await req('POST', '/api/balcao/etiquetas/status', { id: e.id, status: 'EM_ATENDIMENTO' }, 'tk');
assert.equal(st.data.status, 'EM_ATENDIMENTO'); assert.equal(st.data.atendente, 'Helena');
st = await req('POST', '/api/balcao/etiquetas/status', { id: e.id, status: 'EM_ATENDIMENTO' }, 'tk');
assert.equal(st.status, 409, 'não assume duas vezes');
st = await req('POST', '/api/balcao/etiquetas/status', { id: e.id, status: 'CONCLUIDA', sro: 'ab123' }, 'tk');
assert.equal(st.status, 422, 'SRO inválido');
st = await req('POST', '/api/balcao/etiquetas/status', { id: e.id, status: 'CONCLUIDA', sro: 'ab123456789br' }, 'tk');
assert.equal(st.data.status, 'CONCLUIDA'); assert.equal(st.data.sro, 'AB123456789BR');
f = await req('GET', '/api/balcao/etiquetas?local=AGF', null, 'tk'); assert.equal(f.data.pendentes, 0);

// 6. limpeza: etiqueta de ontem expira; com 31 dias é apagada
DB._db.exec(`UPDATE balcao_etiquetas SET dia='2000-01-01' WHERE local='METRO'`);
await (await import('../src/etiqueta/etiquetas.js')).limpezaDiaria(env);
assert.equal(DB._db.prepare(`SELECT status FROM balcao_etiquetas WHERE local='METRO'`).get().status, 'EXPIRADA');
DB._db.exec(`UPDATE balcao_etiquetas SET criada_em=datetime('now','-31 days')`);
await (await import('../src/etiqueta/etiquetas.js')).limpezaDiaria(env);
assert.equal(DB._db.prepare('SELECT COUNT(*) n FROM balcao_etiquetas').get().n, 0, 'dados apagados após 30 dias');

assert.ok(chamadas.every((u) => !/preco/i.test(u)), 'chamada a preco');
console.log('etiquetas OK: cliente salva, fila por local, status, limpeza de 30 dias');
