// CRM integrado (29/09/2026): regras puras. Rodar com: node test/crm_integrado.test.mjs (entra no npm test).
import { classificarAbc, mesesJanela, locaisDoUsuario, resolverLocal } from '../src/crm/carteira.js';
import { podeMexerNaAtividade } from '../src/crm/agenda.js';

let falhas = 0, total = 0;
const ok = (cond, msg) => { total++; if (!cond) { falhas++; console.error('FALHOU:', msg); } };
const lança = (fn) => { try { fn(); return false; } catch { return true; } };

// ---- Curva ABC: A até 80% (quem cruza os 80% é A), B até 95% ou >= R$ 5.000, C o resto
{
  const rows = [{ nome: 'a', tV: 500 }, { nome: 'b', tV: 300 }, { nome: 'c', tV: 100 }, { nome: 'd', tV: 60 }, { nome: 'e', tV: 40 }, { nome: 'z', tV: 0 }];
  const { rows: r, total: t } = classificarAbc(rows);
  ok(t === 1000, 'total soma só valores positivos');
  ok(r.length === 5, 'cliente com total zero fica fora');
  ok(r.map((x) => x.abc).join('') === 'AABBC', 'classes esperadas AABBC, veio ' + r.map((x) => x.abc).join(''));
  ok(r[0].rank === 1 && r[4].rank === 5, 'rank em ordem decrescente');
  ok(Math.abs(r[1].acum - 0.8) < 1e-9, 'acumulado do 2º = 80%');
}
{
  // piso de R$ 5.000 puxa para B mesmo depois de 95%
  const rows = [{ tV: 1e6 }, { tV: 40000 }, { tV: 6000 }, { tV: 4000 }];
  const { rows: r } = classificarAbc(rows);
  ok(r.map((x) => x.abc).join('') === 'ABBC', 'piso B: veio ' + r.map((x) => x.abc).join(''));
}
ok(classificarAbc([]).rows.length === 0, 'lista vazia não quebra');

// ---- janela de 12 meses
{
  const m = mesesJanela('2026-09');
  ok(m.length === 12 && m[0] === '2025-10' && m[11] === '2026-09', 'janela out/25 a set/26');
  ok(mesesJanela('2026-01')[0] === '2025-02', 'virada de ano');
}

// ---- LOCAL como filtro pai
{
  const admin = { role: 'admin' }, manu = { role: 'user', crm: { locais: ['AGF'] } }, julio = { role: 'user', crm: { locais: 'BALCAO,METRO' } }, sem = { role: 'user', crm: {} };
  ok(locaisDoUsuario(admin).join() === 'AGF,BALCAO,METRO', 'admin vê os 3');
  ok(locaisDoUsuario(manu).join() === 'AGF', 'Manu só AGF');
  ok(locaisDoUsuario(julio).join() === 'BALCAO,METRO', 'Julio BALCÃO e METRÔ (lista em texto)');
  ok(resolverLocal(manu, '') === 'AGF', 'sem pedido = primeiro permitido');
  ok(resolverLocal(julio, 'metro') === 'METRO', 'aceita minúsculas');
  ok(lança(() => resolverLocal(manu, 'BALCAO')), 'LOCAL não liberado é recusado');
  ok(lança(() => resolverLocal(sem, '')), 'usuário sem LOCAL é recusado');
}

// ---- escopo das atividades (concluir, cancelar, excluir)
{
  const a = { LOCAL: 'AGF', RESPONSAVEL_ID: 'MANU' };
  ok(podeMexerNaAtividade({ role: 'admin' }, { LOCAL: 'METRO', RESPONSAVEL_ID: 'X' }) === '', 'admin pode tudo');
  ok(podeMexerNaAtividade({ role: 'user', crm: { locais: ['AGF'], responsavelId: 'manu' } }, a) === '', 'dono pode (sem diferenciar maiúsculas)');
  ok(podeMexerNaAtividade({ role: 'user', crm: { locais: ['AGF'], responsavelId: 'JULIO' } }, a) !== '', 'outro responsável não pode');
  ok(podeMexerNaAtividade({ role: 'user', crm: { locais: ['AGF'], responsavelId: 'JULIO', canViewTeam: true } }, a) === '', 'quem vê a equipe pode');
  ok(podeMexerNaAtividade({ role: 'manager', crm: { locais: ['AGF'] } }, a) === '', 'gestor pode');
  ok(podeMexerNaAtividade({ role: 'user', crm: { locais: ['METRO'], responsavelId: 'MANU' } }, a) !== '', 'LOCAL fora do usuário não pode');
  ok(podeMexerNaAtividade({ role: 'user', crm: { locais: ['AGF'], responsavelId: 'MANU' } }, { LOCAL: 'AGF', RESPONSAVEL_ID: '' }) === '', 'atividade sem responsável: qualquer um do LOCAL');
}

console.log(`crm_integrado: ${total - falhas}/${total} ok`);
if (falhas) process.exit(1);
