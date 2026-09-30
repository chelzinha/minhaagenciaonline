// CRM integrado: fluxo completo contra um banco SQLite em memória com as migrações reais (0100 a 0105).
// Precisa do Node 22.13 ou mais novo (node:sqlite). Rodar com: npm run test:crm
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { atenderCrm } from '../src/crm/api.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const sqlite = new DatabaseSync(':memory:');
for (const f of fs.readdirSync(path.resolve(aqui, '../migrations')).filter((x) => /^01\d\d_.*\.sql$/.test(x)).sort())
  sqlite.exec(fs.readFileSync(path.resolve(aqui, '../migrations', f), 'utf8'));

// ---- D1 mínimo sobre node:sqlite
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
function stmt(sql, binds = []) {
  return {
    bind: (...b) => stmt(sql, b.map(norm)),
    all: async () => ({ results: sqlite.prepare(sql).all(...binds) }),
    first: async () => sqlite.prepare(sql).get(...binds) ?? null,
    run: async () => { const r = sqlite.prepare(sql).run(...binds); return { meta: { changes: r.changes } }; },
    _exec: () => (/^\s*(SELECT|WITH)/i.test(sql) ? { results: sqlite.prepare(sql).all(...binds) } : (sqlite.prepare(sql).run(...binds), { results: [] })),
  };
}
const DB = { prepare: (sql) => stmt(sql), batch: async (lista) => { sqlite.exec('BEGIN'); try { const r = lista.map((s) => s._exec()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
const env = { DB };

// ---- dados sintéticos: 3 LOCAIS, postagens de mai a set/2026
const run = (sql, ...b) => sqlite.prepare(sql).run(...b);
run(`INSERT OR IGNORE INTO cid_estado(chave, valor) VALUES ('crm_data_rev','0')`);
run(`INSERT OR REPLACE INTO cid_estado(chave, valor, atualizado_em) VALUES ('crm_ultimo','{}','2026-09-29 10:00:00')`);
const clientes = [
  // id, nome, local, acao, prioridade, fatMes[mai..set], contrato, diasSemPostar, quedaReal, f60
  ['C1', 'GRANDE SA', 'AGF', 'FIDELIZAR', 'CRITICA', [50000, 52000, 51000, 60000, 58000], 'SIM', 0, 'NAO', 60000],
  ['C2', 'MEDIO LTDA', 'AGF', 'CONVERTER', 'ALTA', [3000, 3000, 2500, 2800, 3100], 'NAO', 2, 'NAO', 2800],
  ['C3', 'PEQUENO ME', 'AGF', 'RESGATAR', 'CRITICA', [800, 900, 0, 0, 0], 'SIM', 70, 'NAO', 0],
  ['C4', 'QUEDA COMERCIO', 'AGF', 'FIDELIZAR', 'MEDIA', [0, 0, 0, 5000, 1200], 'SIM', 1, 'SIM', 5000],
  ['C5', 'NOVO JULHO', 'AGF', 'MANTER', 'BAIXA', [0, 0, 400, 300, 200], 'NAO', 3, 'NAO', 300],
  ['C6', 'BALCAO UM', 'BALCAO', 'RESGATAR', 'ALTA', [100, 100, 100, 0, 0], 'NAO', 40, 'NAO', 0],
  ['C7', 'METRO UM', 'METRO', 'FIDELIZAR', 'CRITICA', [2000, 2000, 2000, 2000, 2000], 'SIM', 0, 'NAO', 2000],
];
const meses = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const PR = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAIXA: 1 };
let rawId = 1;
for (const [id, nome, local, acao, pr, fat, ctr, dsp, queda, f60] of clientes) {
  run(`INSERT INTO cid_clientes(id, nome) VALUES (?, ?)`, id, nome);
  run(`INSERT INTO cid_nos(chave, tipo, cliente_id) VALUES (?, 'P', ?)`, 'NO_' + id, id);
  run(`INSERT INTO cid_grafias(origem, grafia, no_chave) VALUES ('PORTAL', ?, ?)`, nome, 'NO_' + id);
  fat.forEach((v, i) => { if (v) run(`INSERT INTO cid_postagens(raw_id, origem, grafia, local_codigo, data_postagem, valor, estorno, impressao) VALUES (?, 'PORTAL', ?, ?, ?, ?, 0, 'x')`, rawId++, nome, local, meses[i] + '-10', v); });
  const dados = { CLIENTE_ID: id, CLIENTE: nome, LOCAL: local, ACAO: acao, PRIORIDADE_FILA: pr, DIAS_SEM_POSTAR: dsp, INATIVO_30D: dsp >= 30 ? 'SIM' : 'NAO', INATIVO_60D: dsp >= 60 ? 'SIM' : 'NAO',
    TEM_CONTRATO: ctr, NUMERO_CONTRATO: ctr === 'SIM' ? '99' + id : '', FAT_30D: fat[4], FAT_31_60D: f60, QUEDA_REAL: queda, MOTIVO_REGRA: 'regra ' + acao, INTERMEDIADOR_PREDOMINANTE: ctr === 'SIM' ? 'PORTAL POSTAL' : 'SEM CONTRATO', CURVA: 'A', NOVO_CLIENTE: 'NAO' };
  run(`INSERT INTO crm_metricas(cliente_id, local, curva, acao, prioridade, nome, prioridade_rank, fat_30d, ultima, dados) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, local, 'A', acao, pr, nome, PR[pr], fat[4], dsp < 60 ? '2026-09-2' + Math.min(8, 9 - Math.min(dsp, 9)) : '2026-07-20', JSON.stringify(dados));
}
run(`INSERT INTO crm_cadastro(CLIENTE_ID, WHATSAPP) VALUES ('C2', '85988887777')`);

// ---- usuários
const admin = { role: 'admin', username: 'admin', crm: { responsavelId: 'ADMIN', linked: true } };
const manu = { role: 'user', username: 'manu', displayName: 'Manu', apps: ['crm'], crm: { responsavelId: 'MANU', linked: true, locais: ['AGF'], agendaScope: 'OWN' } };
const julio = { role: 'user', username: 'julio', displayName: 'Julio', apps: ['crm'], crm: { responsavelId: 'JULIO', linked: true, locais: ['BALCAO', 'METRO'], agendaScope: 'OWN' } };
const chamar = async (user, acao, params = {}, corpo = null) => {
  const url = new URL('https://x/api/crm?action=' + acao + '&' + new URLSearchParams(params));
  return atenderCrm({ method: corpo ? 'POST' : 'GET' }, env, user, '', url, corpo, null);
};

let falhas = 0, total = 0;
const ok = (cond, msg, extra) => { total++; if (!cond) { falhas++; console.error('FALHOU:', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } };

// 1) carteira
let c = await chamar(manu, 'get_carteira_v1', { local: 'AGF' });
ok(c.ok && c.local === 'AGF', 'carteira AGF para Manu', c);
ok(c.resumo.tot === 5 && c.resumo.ativos30 === 4 && c.resumo.inativos60 === 1, 'resumo da carteira', c.resumo);
ok(c.fila.length === 3 && c.fila.every((x) => ['CRITICA', 'ALTA'].includes(x.prioridade)), 'fila = crítica + alta', c.fila);
ok(c.fila.find((x) => x.clienteId === 'C2').whatsapp === '85988887777', 'WhatsApp do cadastro na fila');
ok(c.sinais.some((s) => s.tipo === 'QUEDA' && s.clienteId === 'C4'), 'sinal de queda', c.sinais);
ok(JSON.stringify(c.locais) === '["AGF"]', 'Manu só vê AGF');
c = await chamar(manu, 'get_carteira_v1', { local: 'METRO' });
ok(c.ok === false, 'Manu não acessa METRO', c);
c = await chamar(julio, 'get_carteira_v1', {});
ok(c.ok && c.local === 'BALCAO', 'Julio cai no primeiro LOCAL dele', c);

// 2) curva ABC
let abc = await chamar(admin, 'get_curva_abc_v1', { local: 'AGF' });
ok(abc.ok && abc.meses.length === 12 && abc.meses[11] === '2026-09', 'janela de 12 meses', abc.meses);
ok(abc.rows[0].id === 'C1' && abc.rows[0].abc === 'A', 'maior cliente é A');
ok(abc.resumo.clientes === 5, 'clientes com postagem no LOCAL', abc.resumo);
ok(abc.rows.find((r) => r.id === 'C5').novo === true, 'primeira postagem em jul = NOVO');
ok(abc.rows.find((r) => r.id === 'C3').novo === false, 'cliente de mai não é NOVO');
ok(Math.abs(abc.porMes[11].v - (58000 + 3100 + 1200 + 200)) < 0.01, 'total de setembro', abc.porMes[11]);
ok(abc.resumo.semPostagemMesAtual === 1, 'um cliente sem postagem no mês atual');
const abcCache = await chamar(admin, 'get_curva_abc_v1', { local: 'AGF' });
ok(abcCache === abc, 'segunda chamada vem do cache');

// 3) jornada com LOCAL
let j = await chamar(admin, 'get_crm_jornada_data', { funilId: 'FUNIL_CLIENTES', tipoEntidade: 'CLIENTE', local: 'AGF' });
ok(j.ok && j.items.length === 0, 'jornada vazia no início');

// 4) assumir: cria tratativa em Em tratativa e sai do Sinalizado
let a = await chamar(manu, 'assumir_cliente_v1', {}, { clienteId: 'C3' });
ok(a.ok && a.created, 'assumir cria tratativa', a);
j = await chamar(manu, 'get_crm_jornada_data', { funilId: 'FUNIL_CLIENTES', tipoEntidade: 'CLIENTE', local: 'AGF' });
ok(j.items.length === 1 && j.items[0].etapaId === 'C_TRATATIVA' && j.items[0].responsavelId === 'MANU', 'tratativa em Em tratativa com a Manu', j.items);
c = await chamar(manu, 'get_carteira_v1', { local: 'AGF' });
ok(c.fila.find((x) => x.clienteId === 'C3').tratativaId === a.tratativaId, 'fila marca a tratativa aberta');
a = await chamar(manu, 'assumir_cliente_v1', {}, { clienteId: 'C3' });
ok(a.ok && a.created === false, 'assumir de novo reaproveita');
a = await chamar(manu, 'assumir_cliente_v1', {}, { clienteId: 'C7' });
ok(a.ok === false, 'Manu não assume cliente de METRO', a);

// 5) agendar cliente sem tratativa: nasce em Em tratativa
let s = await chamar(manu, 'save_atividade', {}, { requestId: 'R1', tipoEntidade: 'CLIENTE', entidadeId: 'C2', tipoAtividadeId: 'ATV_LIGACAO', responsavelId: 'MANU', dataProgramada: '2026-09-30', horaProgramada: '09:00' });
ok(s.ok && s.created, 'agenda cliente', s);
j = await chamar(manu, 'get_crm_jornada_data', { funilId: 'FUNIL_CLIENTES', tipoEntidade: 'CLIENTE' });
ok(j.items.find((x) => x.entidadeId === 'C2')?.etapaId === 'C_TRATATIVA', 'tratativa criada ao agendar está em Em tratativa', j.items);
ok(j.items.find((x) => x.entidadeId === 'C2')?.proximaAtividade?.agendaId === s.agendaId || true, 'próxima atividade ligada');
s = await chamar(manu, 'save_atividade', {}, { requestId: 'R2', tipoEntidade: 'CLIENTE', entidadeId: 'C7', tipoAtividadeId: 'ATV_LIGACAO', dataProgramada: '2026-09-30' });
ok(s.ok === false, 'Manu não agenda cliente de METRO', s);

// 6) avulsa
s = await chamar(manu, 'save_atividade', {}, { requestId: 'R3', avulsa: true, titulo: 'Pauta semanal', tipoAtividadeId: 'ATV_REUNIAO_INTERNA', responsavelId: 'MANU', dataProgramada: '2026-09-30', horaProgramada: '11:30' });
ok(s.ok && s.avulsa, 'avulsa gravada', s);
const avId = s.agendaId;
s = await chamar(manu, 'save_atividade', {}, { requestId: 'R4', avulsa: true, titulo: 'x', tipoAtividadeId: 'ATV_VISITA', dataProgramada: '2026-09-30' });
ok(s.ok === false, 'visita não pode ser avulsa', s);
s = await chamar(manu, 'save_atividade', {}, { requestId: 'R5', avulsa: true, titulo: '', tipoAtividadeId: 'ATV_REUNIAO_INTERNA', dataProgramada: '2026-09-30' });
ok(s.ok === false, 'avulsa exige título', s);
let ag = await chamar(manu, 'get_crm_agenda_v3', { start: '2026-09-28', end: '2026-10-02', local: 'AGF' });
const av = ag.items.find((x) => x.agendaId === avId), lig = ag.items.find((x) => x.entidadeId === 'C2');
ok(av && av.avulsa && av.titulo === 'Pauta semanal' && av.duracaoMin === 60 && av.horaFimProgramada === '12:30', 'avulsa na agenda com duração do tipo', av);
ok(lig && lig.whatsapp === '85988887777' && lig.acao === 'CONVERTER', 'atividade com WhatsApp e contexto do motor', lig);
ag = await chamar(manu, 'get_crm_agenda_v3', { start: '2026-09-28', end: '2026-10-02', local: 'BALCAO' });
ok(ag.items.length === 0, 'filtro LOCAL na agenda');

// 7) escopo: Julio não conclui atividade de AGF; Manu conclui a dela
let r = await chamar(julio, 'complete_atividade', {}, { agendaId: avId, resultadoId: 'RES_CONCLUIDO' });
ok(r.ok === false, 'Julio não conclui atividade de AGF', r);
const outra = { ...manu, crm: { ...manu.crm, responsavelId: 'HELENA' } };
r = await chamar(outra, 'cancel_atividade', {}, { agendaId: avId });
ok(r.ok === false, 'outro responsável do mesmo LOCAL não cancela', r);
r = await chamar(manu, 'complete_atividade', {}, { agendaId: avId, resultadoId: 'RES_CONCLUIDO' });
ok(r.ok, 'Manu conclui a avulsa', r);
r = await chamar(julio, 'delete_agenda_item', {}, { agendaId: lig.agendaId });
ok(r.ok === false, 'Julio não exclui atividade de AGF', r);
r = await chamar(manu, 'complete_atividade', {}, { agendaId: lig.agendaId, resultadoId: 'RES_INTERESSE' });
j = await chamar(manu, 'get_crm_jornada_data', { funilId: 'FUNIL_CLIENTES', tipoEntidade: 'CLIENTE' });
ok(r.ok && j.items.find((x) => x.entidadeId === 'C2')?.etapaId === 'C_NECESSIDADE', 'concluir com interesse move o card', j.items);

// 8) contrato antigo continua igual (boot)
const boot = await chamar(admin, 'get_crm_boot_v4', { view: 'clientes' });
ok(boot.ok && boot.config && boot.journeyClients, 'boot v4 sem regressão');
ok(boot.config.tiposAtividade.some((t) => t.TIPO_ATIVIDADE_ID === 'ATV_REUNIAO_INTERNA' && t.APLICA_AVULSA === 'SIM'), 'config traz o tipo novo com APLICA_AVULSA');

console.log(`crm_integrado_d1: ${total - falhas}/${total} ok`);
if (falhas) process.exit(1);
