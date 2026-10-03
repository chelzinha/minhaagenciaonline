// Peso cúbico acima de 30 kg: os Correios aceitam e cobram kg adicional. Limite de 30 kg vale para o peso real.
// Casos reais do Atende (abr-set/2026), conferidos ao centavo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarBase, classificarTrecho, calcularPrecos } from '../src/preco/preco-avista.js';
import { montarBaseTabelas, classificarTrechoTabela, calcularContrato, calcularApp } from '../src/preco/preco-tabelas.js';

const ler = (f) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url)));
const a = ler('base.json'), b = ler('base-comparador.json');
const baseA = montarBase({ servicos: a.servicos, tarifas: a.tarifas, colunaUf: a.colunaUf, localidades: a.localidades, adicionais: a.adicionais });
const baseT = montarBaseTabelas({ tabelas: b.tabelas, faixaUf: b.faixaUf, classes: b.classes, regras: b.regras,
  tarifas: b.tarifas.map(([tabela, servico, coluna, tipo, peso_max_g, preco]) => ({ tabela, servico, coluna, tipo, peso_max_g, preco })) });
const O = { uf: 'CE', municipio: 'FORTALEZA' };

const casos = [
  // [tabela, serviço, destino, peso g, C x L x A, valor declarado, valor pago]
  ['AVISTA', 'PAC', { uf: 'SP', municipio: 'SAO PAULO' }, 20040, [70, 56, 52], 0, 435.00],
  ['CLUBE_CORREIOS', 'PAC', { uf: 'PR', municipio: 'SAO JOSE DOS PINHAIS' }, 10000, [80, 60, 50], 2000, 325.11],
  ['PLATINUM', 'PAC', { uf: 'SP', municipio: 'SAO PAULO' }, 26600, [66, 59, 57], 0, 270.99],
  ['PLATINUM', 'PAC', { uf: 'SP', municipio: 'SAO PAULO' }, 26600, [71, 60, 57], 0, 313.10],
  ['PLATINUM', 'SEDEX', { uf: 'AM', municipio: 'MANAUS' }, 25720, [82, 80, 30], 4240, 687.93],
];
for (const [tab, servico, destino, pesoG, [c, l, h], vd, pago] of casos) {
  const e = { pesoG, comprimentoCm: c, larguraCm: l, alturaCm: h, valorDeclarado: vd };
  let total;
  if (tab === 'AVISTA') total = calcularPrecos(baseA, e, classificarTrecho(baseA, O, destino)).opcoes.find((o) => o.chave === servico).total;
  else total = calcularContrato(baseT, e, classificarTrechoTabela(baseT, baseA.loc, O, destino), { tabela: tab, servico, usarMini: false }).total;
  assert.equal(total, pago, `${tab} ${servico} ${destino.municipio} ${c}x${l}x${h} ${pesoG} g`);
}
// App: cúbico acima de 30 kg também é cobrado; peso real acima de 30 kg é recusado em todos.
const t = classificarTrechoTabela(baseT, baseA.loc, O, { uf: 'SP', municipio: 'SAO PAULO' });
assert.ok(calcularApp(baseT, { pesoG: 10000, comprimentoCm: 80, larguraCm: 60, alturaCm: 50 }, t, { servico: 'PAC' }).ok, 'App aceita cúbico de 34,3 kg');
assert.equal(calcularContrato(baseT, { pesoG: 30001, comprimentoCm: 20, larguraCm: 20, alturaCm: 20 }, t, { tabela: 'PLATINUM', servico: 'PAC' }).ok, false);
assert.equal(calcularApp(baseT, { pesoG: 30001, comprimentoCm: 20, larguraCm: 20, alturaCm: 20 }, t, { servico: 'PAC', considerarPesoReal: true }).ok, false);
console.log('peso-cubico OK: ' + casos.length + ' postagens reais acima de 30 kg cúbicos conferidas');
