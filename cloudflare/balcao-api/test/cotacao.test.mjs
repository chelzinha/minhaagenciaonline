// Fluxo completo com D1 e Correios simulados: preco da tabela, prazo da API, nenhuma chamada a preco.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { cotar } from '../src/cotacao.js';
console.warn = () => {};

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/base.json', import.meta.url)));
const DB = {
  batch: async (stmts) => stmts.map((s) => ({ results:
    s.sql.includes('balcao_servicos') ? fx.servicos : s.sql.includes('balcao_tarifas') ? fx.tarifas :
    s.sql.includes('balcao_coluna_uf') ? fx.colunaUf : s.sql.includes('balcao_localidades') ? fx.localidades : fx.adicionais })),
  prepare: (sql) => { const st = { sql, bind: () => st, first: async () => null, run: async () => ({}) }; return st; },
};
const CEPS = { '60055974': { uf: 'CE', localidade: 'Fortaleza' }, '01001000': { uf: 'SP', localidade: 'São Paulo' }, '62010150': { uf: 'CE', localidade: 'Sobral' } };
const chamadas = [];
let prazoFalha = false;
globalThis.fetch = async (url) => {
  url = String(url); chamadas.push(url);
  const r = (obj, status = 200) => new Response(JSON.stringify(obj), { status });
  if (url.endsWith('/autentica/cartaopostagem')) return r({ token: 'tk', expiraEm: new Date(Date.now() + 864e5).toISOString() });
  let m = url.match(/\/cep\/v2\/enderecos\/(\d{8})$/); if (m) return CEPS[m[1]] ? r({ cep: m[1], ...CEPS[m[1]] }) : r({ msgs: ['nao'] }, 404);
  m = url.match(/\/prazo\/v1\/nacional\/(\d{5})/); if (m) return prazoFalha ? r({ msgs: ['indisponivel'] }, 500) : r({ coProduto: m[1], prazoEntrega: m[1] === '04014' ? 1 : 6, dataMaxima: '2026-10-06T23:59:59' });
  if (url.includes('viacep')) return r({ erro: true });
  throw new Error('URL inesperada: ' + url);
};
const env = { DB, CORREIOS_USUARIO: 'u', CORREIOS_CODIGO_ACESSO: 'c', CORREIOS_CARTAO: '123' };

const r = await cotar(env, { cepOrigem: '60055974', cepDestino: '01001000', tipoObjeto: 'PACOTE', pesoG: 680, alturaCm: 6, larguraCm: 26, comprimentoCm: 34, ar: 'NAO', maoPropria: 'NAO' });
const sedex = r.opcoes.find((o) => o.servico === 'SEDEX'), pac = r.opcoes.find((o) => o.servico === 'PAC');
assert.equal(sedex.total, 97.3); assert.equal(pac.total, 45.5);
assert.equal(sedex.prazoDias, 1); assert.equal(pac.prazoDias, 6);
assert.equal(r.trecho.coluna, 'F4'); assert.equal(r.trecho.escala, 'CAPITAL');

prazoFalha = true;
const r2 = await cotar(env, { cepOrigem: '60055974', cepDestino: '62010150', tipoObjeto: 'PACOTE', pesoG: 700, alturaCm: 6, larguraCm: 26, comprimentoCm: 34 });
assert.equal(r2.opcoes.find((o) => o.servico === 'PAC').total, 29.8, 'preco sai mesmo com o prazo fora');
assert.equal(r2.opcoes.find((o) => o.servico === 'PAC').prazo.ok, false);

await assert.rejects(cotar(env, { cepOrigem: '62010150', cepDestino: '01001000', tipoObjeto: 'PACOTE', pesoG: 700, alturaCm: 6, larguraCm: 26, comprimentoCm: 34 }), /Região Metropolitana de Fortaleza/);
assert.ok(chamadas.every((u) => !/preco/i.test(u)), 'houve chamada a preco');
assert.ok(chamadas.some((u) => u.includes('/prazo/v1/nacional/04014')), 'prazo do SEDEX consultado pelo codigo a vista');
console.log(`cotacao OK: ${chamadas.length} chamadas simuladas, nenhuma a preco`);
