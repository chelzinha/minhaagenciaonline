// Caminho 1 (preco): confere o motor contra 513 postagens reais a vista do Atende (ago-set/2026).
// O valor do Atende pode incluir AR, MP ou manuseio especial: o teste aceita a combinacao que bate.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { montarBase, classificarTrecho, calcularPrecos, origemAtendida } from '../src/preco/preco-avista.js';

const ler = (f) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url)));
const base = montarBase(ler('base.json'));
const casos = ler('casos-atende-ago-set-2026.json');
const origem = { cep: '60055974', uf: 'CE', municipio: 'Fortaleza' };
assert.ok(origemAtendida(base, origem), 'Fortaleza precisa ser origem atendida');
assert.ok(!origemAtendida(base, { uf: 'CE', municipio: 'Sobral' }), 'Sobral nao e origem atendida');

const variantes = [{}, { ar: true }, { maoPropria: true }, { ar: true, maoPropria: true }, { tipoObjeto: 'ROLO' }];
let ok = 0; const falhas = [];
for (const c of casos) {
  const trecho = classificarTrecho(base, origem, { uf: c.uf, municipio: c.municipio });
  const bate = variantes.some((v) => {
    const r = calcularPrecos(base, { pesoG: c.pesoG, valorDeclarado: c.valorDeclarado, ...v }, trecho);
    const o = r.opcoes.find((x) => x.codigo === c.servico);
    return o.ok && Math.abs(o.total - c.valorAtende) < 0.011;
  });
  bate ? ok++ : falhas.push(c);
}
if (falhas.length) console.log(falhas.slice(0, 10));
assert.equal(falhas.length, 0, `${falhas.length} casos sem bater`);

// Regras pontuais
const t = (uf, municipio) => classificarTrecho(base, origem, { uf, municipio });
assert.deepEqual([t('CE', 'Caucaia').coluna, t('CE', 'Sobral').coluna, t('RN', 'Mossoró').coluna, t('SP', 'São Paulo').coluna], ['LOCAL', 'ESTADUAL', 'ESTADUAL', 'F4']);
assert.equal(t('SP', 'Campinas').escala, 'CAPITAL');
assert.equal(t('SP', 'Votuporanga').escala, 'INTERIOR');
const cub = calcularPrecos(base, { pesoG: 7760, alturaCm: 40, larguraCm: 38, comprimentoCm: 45 }, t('CE', 'Fortaleza'));
assert.equal(cub.peso.pesoTarifadoG, 12000, 'exemplo oficial de cubagem: 12 kg');
const vd = calcularPrecos(base, { pesoG: 400, valorDeclarado: 45 }, t('RN', 'Mossoró'));
assert.equal(vd.opcoes.find((o) => o.chave === 'SEDEX').vdValor, 0.39, 'VD = 2% sobre o excedente de 25,63');
const limite = calcularPrecos(base, { pesoG: 30001 }, t('SP', 'São Paulo'));
assert.ok(limite.opcoes.every((o) => !o.ok), 'acima de 30 kg nao cota');
console.log(`preco OK: ${ok}/${casos.length} postagens reais conferidas`);
