// Simulador de Frete: zonas, tipos de cidade, Mini Envios e as duas regras do App.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarBase } from '../src/preco/preco-avista.js';
import { montarBaseTabelas } from '../src/preco/preco-tabelas.js';
import { montarMapa, precosDaZona, tipoDaCidade, CAIXAS } from '../src/simulador/simulador.js';

const ler = (f) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url)));
const a = ler('base.json'), b = ler('base-comparador.json');
const baseA = montarBase({ servicos: a.servicos, tarifas: a.tarifas, colunaUf: a.colunaUf, localidades: a.localidades, adicionais: a.adicionais });
const baseT = montarBaseTabelas({ tabelas: b.tabelas, faixaUf: b.faixaUf, classes: b.classes, regras: b.regras,
  tarifas: b.tarifas.map(([tabela, servico, coluna, tipo, peso_max_g, preco]) => ({ tabela, servico, coluna, tipo, peso_max_g, preco })) });

const { ufs, zonas } = montarMapa(baseA, baseT);
assert.equal(Object.keys(ufs).length, 27, '27 UFs');
assert.equal(Object.keys(zonas).length, 25, '25 zonas de preço saindo de Fortaleza');
assert.deepEqual(Object.keys(ufs.SP).sort(), ['CAPITAL', 'INTERIOR', 'MEDIA', 'POLO']);
assert.deepEqual(Object.keys(ufs.CE).sort(), ['CE_INT', 'CE_POLO', 'RMF']);
assert.equal(ufs.SP.CAPITAL.ex[0], 'São Paulo');
assert.equal(ufs.RN.DIVISA.ex[0], 'Mossoró');
assert.equal(ufs.SP.MEDIA.zona, 'F4_INTERIOR_P3');
assert.equal(tipoDaCidade({ escala: 'INTERIOR' }, { tipo: 'NACIONAL', coluna: 'N3' }, 'SP'), 'POLO');

const mini = CAIXAS.find((c) => c.codigo === 'MINI');
assert.deepEqual(mini.medidas, [24, 16, 4], 'caixa Mini Envios no tamanho máximo');
const [c, l, h] = mini.medidas;
const e = (p, m = [c, l, h]) => ({ comprimentoCm: m[0], larguraCm: m[1], alturaCm: m[2], pesoG: p, valorDeclarado: 0 });

// Mini Envios ate 300 g em Sao Paulo capital (valores da tabela Platinum 2026)
let z = precosDaZona(baseA, baseT, zonas.F4_CAPITAL_N3, e(300));
assert.equal(z.PLATINUM.MINI, 17.85, 'Mini Envios Platinum, SP capital, 300 g');
assert.equal(z.PLATINUM.PAC, 23.00, 'PAC Platinum sem Mini');
assert.equal(z.CLUBE.MINI, z.PLATINUM.MINI, 'Clube = Platinum em 2026');
assert.equal(z.AVISTA.PAC, 41.00);
// Fora do formato: Mini indisponivel
z = precosDaZona(baseA, baseT, zonas.F4_CAPITAL_N3, e(300, [27, 18, 9]));
assert.equal(z.PLATINUM.MINI, null, 'Tipo 2 não cabe no Mini Envios');

// App: por peso (maior entre real e cubico) x por volume (so cubico). 30 kg na Tipo 5 para SP capital.
z = precosDaZona(baseA, baseT, zonas.F4_CAPITAL_N3, e(30000, [54, 36, 27]));
assert.equal(z.APP_VOLUME.SEDEX, 147.25, 'App por volume cobra 7,5 kg');
assert.equal(z.APP_PESO.SEDEX, 601.95, 'App por peso cobra 30 kg');
assert.equal(z.PLATINUM.SEDEX, 573.31);
assert.equal(z.AVISTA.SEDEX, 1033.00);
// Cidade media: contrato usa P, App cai na I
z = precosDaZona(baseA, baseT, zonas.F4_INTERIOR_P3, e(1000, [27, 18, 9]));
assert.equal(z.PLATINUM.SEDEX, 62.87);
assert.equal(z.APP_PESO.SEDEX, 90.20);

// Valor declarado e AR: contrato 1% sobre o que passa de R$ 25,63 e AR a faturar R$ 11,75;
// balcão e App 2% e AR à vista R$ 8,10; Mini Envios 2% sobre o que passa de R$ 12,82.
const base0 = precosDaZona(baseA, baseT, zonas.F4_CAPITAL_N3, e(1000, [27, 18, 9]));
const comVd = precosDaZona(baseA, baseT, zonas.F4_CAPITAL_N3, { ...e(1000, [27, 18, 9]), valorDeclarado: 500, ar: true });
const dif = (k, s) => Math.round((comVd[k][s] - base0[k][s]) * 100) / 100;
assert.equal(dif('PLATINUM', 'SEDEX'), Math.round(((500 - 25.63) * 0.01 + 11.75) * 100) / 100, 'contrato: VD 1% + AR a faturar');
assert.equal(dif('AVISTA', 'SEDEX'), Math.round(((500 - 25.63) * 0.02 + 8.10) * 100) / 100, 'balcão: VD 2% + AR');
assert.equal(dif('APP_PESO', 'PAC'), Math.round(((500 - 25.63) * 0.02 + 8.10) * 100) / 100, 'App: VD 2% + AR à vista');
const miniVd = precosDaZona(baseA, baseT, zonas.F4_CAPITAL_N3, { ...e(300), valorDeclarado: 100, ar: true });
assert.equal(miniVd.PLATINUM.MINI, Math.round((17.85 + (100 - 12.82) * 0.02 + 11.75) * 100) / 100, 'Mini: VD 2% + AR');
const miniAcima = precosDaZona(baseA, baseT, zonas.F4_CAPITAL_N3, { ...e(300), valorDeclarado: 200 });
assert.equal(miniAcima.PLATINUM.MINI, null, 'Mini Envios recusa valor declarado acima do máximo');

console.log('simulador.test: ok');
