// Testes do revisor automatico (nomes ficticios).
import assert from 'node:assert/strict';
import { revisar, contidoEmOrdem, palavras } from '../src/revisor.js';

let n = 0;
const ok = (nome, fn) => { fn(); n++; console.log('ok -', nome); };
const cli = (id, nome, extra = {}) => [id, { nome, eh_portal: 0, postagens: 1, ...extra }];
const rodar = (clientes, pares) => revisar(pares, new Map(clientes));
const par = (a, b, motivo) => ({ cliente_a: a, cliente_b: b, motivo });

ok('grafia com 1 letra trocada une', () => {
  const r = rodar([cli('A', 'LOJA CRISTAL'), cli('B', 'LOJA CRISTIAL', { postagens: 5 })], [par('A', 'B', 'GRAFIA_PARECIDA')]);
  assert.equal(r.length, 1); assert.equal(r[0].destino, 'B'); assert.equal(r[0].regra, 'REVISOR_GRAFIA');
});
ok('sobrenomes diferentes nao unem (ALVES x SALES, MARIA x MARIANA)', () => {
  const r = rodar([cli('A', 'PEDRO ALVES'), cli('B', 'PEDRO SALES'), cli('C', 'MARIA TESTE'), cli('D', 'MARIANA TESTE')],
    [par('A', 'B', 'GRAFIA_PARECIDA'), par('C', 'D', 'GRAFIA_PARECIDA')]);
  assert.equal(r.length, 0);
});
ok('nome de 3 palavras contido une no mais completo', () => {
  const r = rodar([cli('A', 'JOANA PRADO SILVA'), cli('B', 'JOANA PRADO SILVA DOS REIS')], [par('A', 'B', 'NOME_CONTIDO')]);
  assert.deepEqual(r.map((x) => [x.destino, x.outro]), [['B', 'A']]);
});
ok('inicial solta casa com a palavra certa', () => {
  assert.equal(contidoEmOrdem(palavras('MARCO TULIO F.S BRAGA'), palavras('MARCO TULIO FERREIRA DA SILVA BRAGA')), true);
  assert.equal(contidoEmOrdem(palavras('JOSE RONALDO DE S. SILVA'), palavras('JOSE RONALDO MORAES SILVA')), false);
});
ok('ordem diferente fica para humano', () => {
  const r = rodar([cli('A', 'LIVIA MARIA COSTA RAMOS'), cli('B', 'LIVIA RAMOS COSTA')], [par('A', 'B', 'NOME_CONTIDO')]);
  assert.equal(r.length, 0);
});
ok('nome curto com candidatos incompativeis fica para humano', () => {
  const r = rodar([cli('A', 'OTAVIO AUGUSTO'), cli('B', 'OTAVIO AUGUSTO PRADO LIMA'), cli('C', 'OTAVIO AUGUSTO NUNES')],
    [par('A', 'B', 'NOME_CONTIDO'), par('A', 'C', 'NOME_CONTIDO')]);
  assert.equal(r.length, 0);
});
ok('cadeia compativel une tudo no mais completo', () => {
  const r = rodar([cli('A', 'IRENE VASCO'), cli('B', 'IRENE VASCO PEREIRA'), cli('C', 'IRENE VASCO PEREIRA DA SILVA')],
    [par('A', 'B', 'NOME_CONTIDO'), par('A', 'C', 'NOME_CONTIDO'), par('B', 'C', 'NOME_CONTIDO')]);
  assert.equal(r.filter((x) => x.outro === 'B' && x.destino === 'C').length, 1);
  assert.ok(r.every((x) => x.outro !== 'C'));
});
ok('2 palavras: so com candidato unico e palavra rara', () => {
  const r1 = rodar([cli('A', 'NADIR QUEZADO'), cli('B', 'NADIR QUEZADO PINTO')], [par('A', 'B', 'NOME_CONTIDO')]);
  const r2 = rodar([cli('A', 'MARIA SILVA'), cli('B', 'MARIA SILVA COSTA')], [par('A', 'B', 'NOME_CONTIDO_COMUM')]);
  assert.equal(r1.length, 1); assert.equal(r2.length, 0);
});
ok('FILHO/JUNIOR/NETO e dois Portais nunca unem', () => {
  const r = rodar([cli('A', 'ROBERTO DIAS'), cli('B', 'ROBERTO DIAS FILHO'), cli('C', 'EMPRESA ALFA TESTE', { eh_portal: 1 }), cli('D', 'EMPRESA ALFA TESTE LTDA SUL', { eh_portal: 1 })],
    [par('A', 'B', 'NOME_CONTIDO_GERACAO'), par('C', 'D', 'NOME_CONTIDO')]);
  assert.equal(r.length, 0);
});
ok('Portal vira destino mesmo com nome menor', () => {
  const r = rodar([cli('A', 'CASA DAS FLORES MODA', { eh_portal: 1 }), cli('B', 'CASA DAS FLORES MODA FEMININA')], [par('A', 'B', 'NOME_CONTIDO')]);
  assert.equal(r[0].destino, 'A');
});
ok('primeiro nome diferente nunca une', () => {
  const r = rodar([cli('A', 'JEFERSON PAIVA'), cli('B', 'JEFFERSON PAIVA LIMA')], [par('A', 'B', 'NOME_CONTIDO')]);
  assert.equal(r.length, 0);
});
ok('nome curto que cabe em outro cliente da base fica para humano', () => {
  const clientes = [cli('A', 'NILDA CARMO'), cli('B', 'NILDA CARMO PRADO')];
  const todos = [{ id: 'A', nome: 'NILDA CARMO' }, { id: 'B', nome: 'NILDA CARMO PRADO' }, { id: 'Z', nome: 'NILDA DO CARMO VIANA' }];
  assert.equal(revisar([par('A', 'B', 'NOME_CONTIDO')], new Map(clientes), todos).length, 0);
  assert.equal(revisar([par('A', 'B', 'NOME_CONTIDO')], new Map(clientes), todos.slice(0, 2)).length, 1);
});
console.log(`\n${n} testes do revisor passaram`);
