import assert from 'node:assert/strict';
import { executarMotor, analisarNome } from '../src/motor.js';

const run = (lista, dec) => executarMotor(lista.map(([origem, nome, postagens = 1]) => ({ origem, nome, postagens, valor: 0 })), dec);
const mesmoGrupo = (r, a, b) => r.raiz(a) === r.raiz(b);
const nomeDo = (r, chave) => r.grupos.find((g) => g.chaves.includes(chave)).nome;
let ok = 0; const t = (nome, fn) => { fn(); ok++; console.log('ok -', nome); };

t('normalizacao: caixa, CNPJ raiz, codificacao, repeticao', () => {
  assert.equal(analisarNome('JOAO PAULO AZEVEDO BARBOSA C12').core, 'JOAO PAULO AZEVEDO BARBOSA');
  assert.equal(analisarNome('53620099 TIAGO MALHAS DE FREIT').doc, '53620099');
  assert.equal(analisarNome('DELEGACIA DE REPRESSÃ_x0083_O').core, 'DELEGACIA DE REPRESSAO');
  assert.equal(analisarNome('KAIKAI PRESENTES KAIKAI PRESENTES').core, 'KAIKAI PRESENTES');
  assert.equal(analisarNome('AMPLA ENERGIA E SERVICOS S.A').core, 'AMPLA ENERGIA E SERVICOS');
  assert.equal(analisarNome('67 591 485 ITALO DE SA CARNEIRO').core, 'ITALO DE SA CARNEIRO');
});

t('remetente igual ao Portal vira o cliente do Portal, com nome do Portal', () => {
  const r = run([['PORTAL', 'DILOHAN COMERCIO ATACADISTA DE ROUPAS LTDA'], ['METRO', 'DILOHAN COMERCIO ATACADISTA DE ROUPAS LTDA'], ['METRO', 'DILOHAN COMERCIO ATACADISTA DE']]);
  assert.ok(mesmoGrupo(r, 'P:DILOHAN COMERCIO ATACADISTA DE ROUPAS', 'S:DILOHAN COMERCIO ATACADISTA DE'));
  assert.equal(nomeDo(r, 'S:DILOHAN COMERCIO ATACADISTA DE'), 'DILOHAN COMERCIO ATACADISTA DE ROUPAS LTDA');
});

t('nome cortado vai para o mais completo', () => {
  const r = run([['METRO', 'DONA LUIZA ATACADISTA DE CALCADO', 130], ['METRO', 'DONA LUIZA ATACADISTA DE CALCADOS LTDA', 108]]);
  assert.ok(mesmoGrupo(r, 'S:DONA LUIZA ATACADISTA DE CALCADO', 'S:DONA LUIZA ATACADISTA DE CALCADOS'));
  assert.equal(nomeDo(r, 'S:DONA LUIZA ATACADISTA DE CALCADO'), 'DONA LUIZA ATACADISTA DE CALCADOS LTDA');
});

t('nome colado sem espaco + maiusculas', () => {
  const r = run([['BALCAO', 'Karine Pinheiro'], ['BALCAO', 'KARINEPINHEIRO']]);
  assert.ok(mesmoGrupo(r, 'S:KARINE PINHEIRO', 'S:KARINEPINHEIRO'));
  assert.equal(nomeDo(r, 'S:KARINEPINHEIRO'), 'KARINE PINHEIRO');
});

t('Agnes: AGNESRISTAU vira sugestao para AGNES PONTES RISTAU (nao automatico)', () => {
  const r = run([['METRO', 'Agnes Pontes Ristau'], ['METRO', 'AGNESRISTAU'], ['METRO', 'GABRIEL PONTES RISTAU'], ['METRO', 'AGNES SILVA'], ['METRO', 'MARIA RISTAU']]);
  assert.ok(!mesmoGrupo(r, 'S:AGNES PONTES RISTAU', 'S:AGNESRISTAU'));
  assert.ok(r.sugestoes.some((s) => [s.a, s.b].sort().join('|') === ['S:AGNES PONTES RISTAU', 'S:AGNESRISTAU'].sort().join('|')));
  assert.ok(!r.sugestoes.some((s) => [s.a, s.b].includes('S:GABRIEL PONTES RISTAU') && [s.a, s.b].includes('S:AGNES PONTES RISTAU')));
});

t('dois clientes do Portal nunca se fundem', () => {
  const r = run([['PORTAL', 'NOVA ERA CONSULTORIA ADUANEIRA'], ['PORTAL', 'NOVA ERA CONSULTORIA ADUANEIRA PROCESSO']]);
  assert.ok(!mesmoGrupo(r, 'P:NOVA ERA CONSULTORIA ADUANEIRA', 'P:NOVA ERA CONSULTORIA ADUANEIRA PROCESSO'));
});

t('primeiro nome diferente nunca e sugerido (Adriana x Herdiana)', () => {
  const r = run([['BALCAO', 'ADRIANA AZEVEDO DE MESQUITA'], ['BALCAO', 'HERDIANA AZEVEDO DE MESQUITA']]);
  assert.equal(r.sugestoes.length, 0);
  assert.ok(!mesmoGrupo(r, 'S:ADRIANA AZEVEDO DE MESQUITA', 'S:HERDIANA AZEVEDO DE MESQUITA'));
});

t('FILHO/JUNIOR nao funde sozinho', () => {
  const r = run([['BALCAO', 'MOZART ALVES DE OLIVEIRA'], ['BALCAO', 'MOZART ALVES DE OLIVEIRA FILHO']]);
  assert.ok(!mesmoGrupo(r, 'S:MOZART ALVES DE OLIVEIRA', 'S:MOZART ALVES DE OLIVEIRA FILHO'));
});

t('decisao humana: separar vence regra automatica; unir vence tudo', () => {
  const lista = [['BALCAO', 'MARIANA MENDES'], ['BALCAO', 'MARIANAMENDES'], ['BALCAO', 'JOSE A'], ['BALCAO', 'PEDRO B']];
  const r1 = run(lista, { separar: [['S:MARIANA MENDES', 'S:MARIANAMENDES']] });
  assert.ok(!mesmoGrupo(r1, 'S:MARIANA MENDES', 'S:MARIANAMENDES'));
  const r2 = run([['BALCAO', 'LUCIANA LOPES'], ['BALCAO', 'LUNA LESTRIE']], { unir: [['S:LUCIANA LOPES', 'S:LUNA LESTRIE']] });
  assert.ok(mesmoGrupo(r2, 'S:LUCIANA LOPES', 'S:LUNA LESTRIE'));
});

t('lixo operacional fica fora (REMETENTE, -, vazio)', () => {
  const r = run([['BALCAO', 'REMETENTE'], ['BALCAO', '-'], ['BALCAO', ''], ['BALCAO', 'ANA LIMA']]);
  assert.equal(r.descartados.length, 3);
});

t('casos da skill de deduplicacao', () => {
  const casos = [['FERNANDO DURMA PEREIRA', 'FERNANDO DUTRA PEREIRA', true], ['NATALIA', 'ANA KAROLLYNA', false],
    ['FRANCISCO EVANILDO', 'FRANCISCO ERICK ARAUJO SOARES', false], ['CARLOS PAZ', 'JUNIOR LOPES', false],
    ['ANTONIO IVAN CAVALCANTE FARIAS', 'ANTONIO IVAN FARIAS', true]];
  for (const [a, b, esperado] of casos) {
    const r = run([['BALCAO', a], ['BALCAO', b]]);
    const ka = 'S:' + analisarNome(a).core, kb = 'S:' + analisarNome(b).core;
    const ligado = mesmoGrupo(r, ka, kb) || r.sugestoes.length > 0;
    assert.equal(ligado, esperado, `${a} x ${b}`);
  }
});
t('caractere quebrado ¿ dentro da palavra (ANTO¿NIO)', () => {
  assert.equal(analisarNome('MARCOS ANTO¿NIO DA SILVA').core, 'MARCOS ANTONIO DA SILVA');
});
t('iniciais diferentes nao viram sugestao (F & A x F W)', () => {
  const r = run([['BALCAO', 'F & A COMERCIO DE CONFECCOES LTDA ME'], ['METRO', 'F W COMERCIO DE CONFECCOES LTDA']]);
  assert.equal(r.sugestoes.length, 0);
});
console.log(`\n${ok} testes passaram`);
