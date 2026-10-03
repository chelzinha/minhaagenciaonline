// Comparador: confere os motores de contrato e App contra postagens reais do Atende (abr-set/2026)
// e o lote completo contra o CSV de exemplo do Portal Postal (valor pago a vista).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { montarBase } from '../src/preco/preco-avista.js';
import { montarBaseTabelas, classificarTrechoTabela, calcularContrato, calcularApp } from '../src/preco/preco-tabelas.js';
import { calcularLote, detectarServico, lerAdicionais } from '../src/comparador/lote.js';

const ler = (f) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url)));
const baseA = montarBase(ler('base.json'));
const bt = ler('base-comparador.json');
bt.tarifas = bt.tarifas.map(([tabela, servico, coluna, tipo, peso_max_g, preco]) => ({ tabela, servico, coluna, tipo, peso_max_g, preco }));
const baseT = montarBaseTabelas(bt);
const ORIGEM = { uf: 'CE', municipio: 'Fortaleza' };
const trecho = (uf, municipio) => classificarTrechoTabela(baseT, baseA.loc, ORIGEM, { uf, municipio });
const ad = { AR: baseA.ad.AR, MP: baseA.ad.MP };

// 1. Regras de coluna (Matriz Origem e Destino CE + corredor Fortaleza E+)
const col = (uf, m, s = 'SEDEX') => { const t = trecho(uf, m); return typeof t.coluna === 'string' ? t.coluna : t.coluna[s]; };
assert.equal(col('CE', 'Caucaia'), 'L3');
assert.equal(col('CE', 'Caucaia', 'PAC'), 'E3');
assert.equal(col('CE', 'Juazeiro do Norte'), 'E3');
assert.equal(col('CE', 'Sobral'), 'E4');
assert.equal(col('RN', 'Mossoró'), 'E3');
assert.equal(col('SP', 'São Paulo'), 'N3');
assert.equal(col('SP', 'Barueri'), 'N3', 'regiao metropolitana usa N');
assert.equal(col('BA', 'Salvador'), 'N2');
assert.equal(col('PE', 'Petrolina'), 'P1', 'cidade B usa P');
assert.equal(col('MG', 'Formiga'), 'I3');
assert.throws(() => classificarTrechoTabela(baseT, baseA.loc, { uf: 'CE', municipio: 'Sobral' }, { uf: 'SP', municipio: 'São Paulo' }));

// 2. Contrato: pacote de cada contrato descoberto pelo melhor ajuste; exige 95% de acerto
const casos = ler('casos-contrato-atende-abr-set-2026.json');
const pacotes = baseT.tabelas.filter((t) => t.tipo === 'CONTRATO').map((t) => t.codigo);
const variantes = [{}, { ar: true }, { maoPropria: true }];
const bate = (c, tabela) => variantes.some((v) => {
  const r = calcularContrato(baseT, { ...c, ...v }, trecho(c.uf, c.municipio), { tabela, servico: c.servico, usarMini: false });
  return r.ok && Math.abs(r.total - c.valorAtende) < 0.015;
});
const porContrato = new Map();
for (const c of casos) { if (!porContrato.has(c.contrato)) porContrato.set(c.contrato, []); porContrato.get(c.contrato).push(c); }
let ok = 0, total = 0;
for (const lista of porContrato.values()) {
  let melhor = 0;
  for (const p of pacotes) melhor = Math.max(melhor, lista.filter((c) => bate(c, p)).length);
  ok += melhor; total += lista.length;
}
const pct = ok / total;
assert.ok(pct >= 0.95, `contrato: acerto de ${(pct * 100).toFixed(1)}% abaixo de 95%`);
console.log(`contrato OK: ${ok}/${total} postagens reais (${(pct * 100).toFixed(1)}%) em ${porContrato.size} contratos`);

// 3. App: peso sempre cubico (divisor 7000), ad valorem 2%
const app = ler('casos-app-atende-abr-set-2026.json');
for (const c of app) {
  const r = calcularApp(baseT, { ...c, pesoG: 1 }, trecho(c.uf, c.municipio), { servico: c.servico, adicionais: ad });
  assert.ok(r.ok && Math.abs(r.total - c.valorAtende) < 0.015, `App ${c.servico} ${c.municipio}: ${r.total} x ${c.valorAtende}`);
}
console.log(`app OK: ${app.length}/${app.length} postagens reais do App`);

// 4. Clube Correios e Platinum tem os mesmos precos na tabela 2026
const t1 = trecho('SP', 'São Paulo');
const e = { pesoG: 2460, alturaCm: 11, larguraCm: 20, comprimentoCm: 27 };
assert.equal(calcularContrato(baseT, e, t1, { tabela: 'PLATINUM', servico: 'SEDEX' }).total, calcularContrato(baseT, e, t1, { tabela: 'CLUBE_CORREIOS', servico: 'SEDEX' }).total);
assert.equal(calcularContrato(baseT, e, t1, { tabela: 'PLATINUM', servico: 'SEDEX' }).total, 83.63);
assert.equal(calcularApp(baseT, e, t1, { servico: 'SEDEX' }).total, 59.10, 'App cobra o cubico (0,85 kg), nao o real');

// 5. Mini Envios so entra no PAC e dentro do formato
const mini = calcularContrato(baseT, { pesoG: 200, alturaCm: 3, larguraCm: 12, comprimentoCm: 20 }, trecho('RN', 'Natal'), { tabela: 'PLATINUM', servico: 'PAC' });
assert.equal(mini.servicoUsado, 'MINI');
const semMini = calcularContrato(baseT, { pesoG: 200, alturaCm: 8, larguraCm: 12, comprimentoCm: 20 }, trecho('RN', 'Natal'), { tabela: 'PLATINUM', servico: 'PAC' });
assert.equal(semMini.servicoUsado, 'PAC');
assert.equal(calcularContrato(baseT, { pesoG: 200, alturaCm: 3, larguraCm: 12, comprimentoCm: 20 }, trecho('RN', 'Natal'), { tabela: 'PLATINUM', servico: 'SEDEX' }).servicoUsado, 'SEDEX');

// 6. Leitura de servico e adicionais
assert.equal(detectarServico('SEDEX', '4014'), 'SEDEX');
assert.equal(detectarServico('', '03298'), 'PAC');
assert.equal(detectarServico('SEDEX 10', ''), 'OUTRO');
assert.deepEqual(lerAdicionais('AR, MP'), { ar: true, maoPropria: true });
assert.deepEqual(lerAdicionais(''), { ar: false, maoPropria: false });

// 7. Lote com o CSV de exemplo (valor pago a vista): 7 de 7 conferem com o balcao
const env = { DB: dbFake() };
const linhas = ler('csv-exemplo-portal-postal.json');
const res = await calcularLote(env, { linhas, tabelaContrato: 'PLATINUM' });
assert.equal(res.resumo.calculadas, 7);
assert.ok(res.linhas.every((l) => l.pagoConfereAvista === true), 'valor pago confere com o a vista');
const moss = res.linhas.find((l) => l.cidade === 'MOSSORO');
assert.equal(moss.CONTRATO.total, 22.40, 'Mossoro: divisa E3, conferido em postagens reais');
await assert.rejects(() => calcularLote(env, { linhas: [] }));
await assert.rejects(() => calcularLote(env, { linhas, tabelaContrato: 'APP' }));
console.log('lote OK: 7/7 linhas do CSV de exemplo conferem com o à vista');

function dbFake() {
  const a = ler('base.json');
  const fonte = {
    balcao_servicos: a.servicos, balcao_tarifas: a.tarifas, balcao_coluna_uf: a.colunaUf, balcao_localidades: a.localidades, balcao_adicionais: a.adicionais,
    cmp_tabelas: bt.tabelas, cmp_tarifas: bt.tarifas, cmp_faixa_uf: bt.faixaUf, cmp_classe_cidade: bt.classes, cmp_regras: bt.regras,
  };
  return {
    prepare: (sql) => ({ sql }),
    batch: async (qs) => qs.map((q) => ({ results: fonte[q.sql.match(/FROM\s+(\w+)/i)[1]] })),
  };
}

// 8. Relatorio (PDF): simulacao muda o titulo, ganhadores nao mostram a referencia, so fundo branco
const { montarHtmlRelatorio } = await import('../src/comparador/relatorio.js');
const rel = ler('relatorio-exemplo.json');
const htmlSim = montarHtmlRelatorio({ ...rel, simulacao: true });
const htmlReal = montarHtmlRelatorio({ ...rel, simulacao: false });
assert.ok(htmlSim.includes('Simulação com envios de exemplo') && !htmlSim.includes('Exemplos do seu histórico'));
assert.ok(htmlReal.includes('Exemplos do seu histórico'));
assert.ok(!/background:var\(--(tinta|amarelo|turquesa|azul)\)/.test(htmlReal), 'PDF sem fundo chapado');
assert.ok(htmlReal.includes('Características de') && htmlReal.includes('Como começar'));
assert.ok(!htmlReal.match(/class="gn-n"><b>Balcão à vista/), 'referencia fora de "qual opcao sai mais barata"');
assert.throws(() => montarHtmlRelatorio({ ...rel, cliente: '' }));
assert.throws(() => montarHtmlRelatorio({ ...rel, cenarios: ['APP'] }));
console.log('relatorio OK: simulacao, caracteristicas, ganhadores e validacoes');
