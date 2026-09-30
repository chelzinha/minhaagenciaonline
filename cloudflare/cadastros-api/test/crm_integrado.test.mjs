// CRM integrado (29/09/2026): regras puras. Rodar com: node test/crm_integrado.test.mjs (entra no npm test).
import { classificarAbc, mesesJanela, locaisDoUsuario, resolverLocal } from '../src/crm/carteira.js';
import { podeMexerNaAtividade } from '../src/crm/agenda.js';
import { executarCrm, ehContratoProprio } from '../src/crm_motor.js';

let falhas = 0, total = 0;
const ok = (cond, msg, extra) => { total++; if (!cond) { falhas++; console.error('FALHOU:', msg, extra ? JSON.stringify(extra).slice(0, 300) : ''); } };
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


// ---- regra AGF: contrato próprio (30/09/2026)
{
  const ref = '2026-09-29';
  const dias = (n) => new Date(Date.parse(ref) - n * 864e5).toISOString().slice(0, 10);
  const lin = (d, valor, intermediador, contratoTipo, contrato) => ({ data: dias(d), qtd: 1, valor, estorno: 0, local: 'METRO', intermediador, contratoTipo, subgrupo: 'SEDEX', contrato, cartao: contrato ? 'C' + contrato : '' });
  const VR = (d, v) => lin(d, v, 'VR', 'CLUBE CORREIOS', '9912653619');
  const PP = (d, v) => lin(d, v, 'PORTAL POSTAL', 'PLATINUM', '9912756508');
  const BAL = (d, v) => lin(d, v, '', '', '');
  const SF = (d, v) => lin(d, v, 'INTERMEDIADOR', 'SUPERFRETE', '9912504122');
  const casos = {
    ISIS: [...Array.from({ length: 40 }, (_, i) => VR(i, 90)), ...Array.from({ length: 20 }, (_, i) => PP(i * 2, 80))],
    SOVR: Array.from({ length: 12 }, (_, i) => VR(i * 3, 20)),
    CAGECE: [...Array.from({ length: 30 }, (_, i) => BAL(i, 60)), ...Array.from({ length: 5 }, (_, i) => lin(i * 5, 40, 'CONTRATO ECT', 'CONTRATO ECT', '9912683911'))],
    SF: Array.from({ length: 20 }, (_, i) => SF(i, 50)),
    ANTIGO: [...Array.from({ length: 20 }, (_, i) => BAL(i, 30)), PP(90, 50)],
  };
  const cl = new Map(Object.keys(casos).map((k) => [k, { nome: k, local: 'METRO' }]));
  const r = executarCrm(cl, new Map(Object.entries(casos)), ref);
  const m = Object.fromEntries(r.metricas.map((x) => [x.CLIENTE_ID, x]));
  ok(ehContratoProprio({ intermediador: 'VR', contratoTipo: 'CLUBE CORREIOS', contrato: '1' }) === false, 'Clube Correios não é contrato próprio');
  ok(ehContratoProprio({ intermediador: 'INTERMEDIADOR', contratoTipo: 'SUPERFRETE', contrato: '1' }) === false, 'SuperFrete não é contrato próprio');
  ok(ehContratoProprio({ intermediador: 'PORTAL POSTAL', contratoTipo: 'PLATINUM', contrato: '1' }) === true, 'Portal Postal é contrato próprio');
  ok(m.ISIS.TEM_CONTRATO === 'SIM' && m.ISIS.NUMERO_CONTRATO === '9912756508' && m.ISIS.PERFIL_COMERCIAL === 'CONTRATO_ECT_DIRETO', 'VR com Portal Postal: tem contrato próprio', m.ISIS);
  ok(!['CONVERTER', 'CANCELAR'].includes(m.ISIS.ACAO) && m.ISIS.CANAL_PREDOMINANTE === 'VR', 'VR com contrato próprio não é Converter nem Cancelar: ' + m.ISIS.ACAO + ' ' + m.ISIS.SUB_ACAO);
  ok(m.SOVR.TEM_CONTRATO === 'NAO' && m.SOVR.NUMERO_CONTRATO === '' && m.SOVR.PERFIL_COMERCIAL === 'VR_INTERNO', 'só VR: sem contrato e sem o número do Clube');
  ok(['CANCELAR', 'CONVERTER'].includes(m.SOVR.ACAO), 'só VR segue a regra VR (cancelar ou converter): ' + m.SOVR.ACAO);
  ok(m.CAGECE.TEM_CONTRATO === 'SIM' && m.CAGECE.ACAO === 'FIDELIZAR', 'balcão com Contrato ECT: fidelizar: ' + m.CAGECE.SUB_ACAO);
  ok(/do valor em 60 dias foi por balcão/.test(m.CAGECE.MOTIVO_REGRA), 'motivo mostra o volume fora do contrato', m.CAGECE.MOTIVO_REGRA);
  ok(/migrar o volume/.test(m.ISIS.MOTIVO_REGRA) || /Clube Correios/.test(m.ISIS.MOTIVO_REGRA), 'ISIS: motivo cita o Clube Correios', m.ISIS.MOTIVO_REGRA);
  ok(m.SF.TEM_CONTRATO === 'NAO' && m.SF.PERFIL_COMERCIAL === 'INTERMEDIADOR_MARKETPLACE', 'SuperFrete continua marketplace sem contrato próprio');
  ok(m.ANTIGO.TEM_CONTRATO === 'NAO', 'contrato só antes de 60 dias não conta');
}

console.log(`crm_integrado: ${total - falhas}/${total} ok`);
if (falhas) process.exit(1);
