// Grupos comerciais: fluxo completo contra SQLite em memória com as migrações reais (0100 a 0107).
// Rodar com: npm run test:crm (Node 22.13+, node:sqlite)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { atenderCrm } from '../src/crm/api.js';
import { calcularCrmD1 } from '../src/crm_persistencia.js';
import { statementsFusaoCrm } from '../src/crm/fundir.js';
import { listarGrupos, grupoDoCliente, salvarGrupo, desfazerGrupo, sugestoesGrupos, rejeitarSugestao, restaurarSugestao, localDoGrupo, nomeBase, inicioDoNome } from '../src/grupos.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON');
for (const f of fs.readdirSync(path.resolve(aqui, '../migrations')).filter((x) => /^01\d\d_.*\.sql$/.test(x)).sort())
  sqlite.exec(fs.readFileSync(path.resolve(aqui, '../migrations', f), 'utf8'));

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
const run = (sql, ...b) => sqlite.prepare(sql).run(...b);
const um = (sql, ...b) => sqlite.prepare(sql).get(...b);

let falhas = 0, total = 0;
const ok = (cond, msg, extra) => { total++; if (!cond) { falhas++; console.error('FALHOU:', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } else console.log('ok -', msg); };
const espera = async (fn, codigo, msg) => { try { await fn(); ok(false, msg + ' (devia falhar)'); } catch (e) { ok(e.codigo === codigo || (!codigo && e.status), msg, e.message); } };

// ---- base: datas de referência até 30/09/2026
run(`INSERT OR IGNORE INTO cid_estado(chave, valor) VALUES ('crm_data_rev','0'), ('crm_pendente','0')`);
let raw = 1;
function cliente(id, nome, { portal = true, origem = 'PORTAL', local = 'AGF', carteira = local, posts = [] }) {
  run(`INSERT INTO cid_clientes(id, nome, portal_chave, local_carteira) VALUES (?,?,?,?)`, id, nome, portal ? 'P:' + nome : null, carteira);
  const chave = (portal ? 'P:' : 'S:') + nome;
  run(`INSERT INTO cid_nos(chave, tipo, cliente_id) VALUES (?,?,?)`, chave, portal ? 'P' : 'S', id);
  run(`INSERT INTO cid_grafias(origem, grafia, no_chave) VALUES (?,?,?)`, origem, nome, chave);
  for (const p of posts) run(`INSERT INTO cid_postagens(raw_id, origem, grafia, local_codigo, data_postagem, valor, estorno, impressao, contrato, intermediador) VALUES (?,?,?,?,?,?,0,'x',?,?)`,
    raw++, origem, nome, p.local || local, p.data, p.valor, p.contrato || '', p.contrato ? 'PORTAL POSTAL' : '');
}
const datas = (ini, fim, passo) => { const out = []; for (let t = Date.parse(ini); t <= Date.parse(fim); t += passo * 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
cliente('S1', 'ASSOCIACAO SHALOM', { posts: datas('2026-06-01', '2026-09-30', 3).map((data) => ({ data, valor: 100, contrato: '9912293215' })) });
cliente('S2', 'ASSOCIACAO SHALOM (SETOR JURIDICO)', { posts: datas('2026-06-04', '2026-08-20', 7).map((data) => ({ data, valor: 50, contrato: '9912293215' })) });
cliente('S3', 'ASSOCIAÇÃO SHALOM - CHAMA VIVA', { posts: ['2026-09-05', '2026-09-12', '2026-09-15'].map((data) => ({ data, valor: 120 })) });
cliente('S4', 'COMUNIDADE CATOLICA SHALOM', { local: 'BALCAO', posts: ['2026-08-10', '2026-08-18'].map((data) => ({ data, valor: 20 })) });
cliente('E1', 'ELEICAO 2026 FULANO DE TAL', { posts: [{ data: '2026-09-10', valor: 5000 }, { data: '2026-09-11', valor: 900 }] });
cliente('E2', 'ELEICAO 2026 BELTRANO', { posts: [{ data: '2026-09-17', valor: 15000 }] });
cliente('CEA', 'CEA MODAS S.A', { posts: datas('2026-05-04', '2026-09-30', 7).map((data) => ({ data, valor: 80, contrato: '9912274429' })) });
cliente('CA', 'C&A SHOPPING FORTALEZA', { portal: false, origem: 'METRO', posts: [{ data: '2026-09-25', valor: 11, contrato: '9912274429' }] });
for (const [i, n] of ['ANA', 'BRUNO', 'CARLA'].entries()) cliente('B' + (i + 1), n + ' SILVA', { portal: false, origem: 'BALCAO', local: 'BALCAO', posts: [{ data: '2026-09-0' + (i + 1), valor: 30, contrato: '9912252075' }] });
cliente('MV', 'M. V. LIMA BARRETO LTDA', { posts: datas('2026-06-01', '2026-09-20', 5).map((data) => ({ data, valor: 40, contrato: '9912620944' })) });
cliente('MV2', 'M. V BARRETO LTDA', { portal: false, origem: 'METRO', posts: [{ data: '2026-07-02', valor: 40, contrato: '9912620944' }] });
cliente('X', 'OUTRO CLIENTE LTDA', { posts: datas('2026-07-01', '2026-09-30', 10).map((data) => ({ data, valor: 60 })) });
// resumo materializado (como o motor do Cadastro grava)
run(`INSERT INTO cid_resumo(cliente_id, aba, postagens, valor, grafias, local_agf, local_balcao, local_metro, primeira, ultima)
  SELECT n.cliente_id, CASE WHEN g.origem='PORTAL' THEN 'PORTAL' ELSE g.origem END, COUNT(*), ROUND(SUM(p.valor),2), 1,
    SUM(p.local_codigo='AGF'), SUM(p.local_codigo='BALCAO'), SUM(p.local_codigo='METRO'), MIN(p.data_postagem), MAX(p.data_postagem)
  FROM cid_postagens p JOIN cid_grafias g ON g.origem=p.origem AND g.grafia=p.grafia JOIN cid_nos n ON n.chave=g.no_chave GROUP BY 1, 2`);

const admin = { role: 'admin', username: 'rachel', crm: { responsavelId: 'ADMIN', linked: true } };
const crm = async (acao, params = {}, corpo = null) => atenderCrm({ method: corpo ? 'POST' : 'GET' }, env, admin, '', new URL('https://x/api/crm?action=' + acao + '&' + new URLSearchParams(params)), corpo, null);
const met = (id) => { const r = um(`SELECT * FROM crm_metricas WHERE cliente_id=?`, id); return r ? { ...r, d: JSON.parse(r.dados) } : null; };

// 0) funções puras
ok(nomeBase('ASSOCIACAO SHALOM (SETOR JURIDICO AQUIRAZ)') === 'ASSOCIACAO SHALOM' && nomeBase('ASSOCIAÇÃO SHALOM - CHAMA VIVA') === 'ASSOCIACAO SHALOM', 'nome-base corta setor e filial');
ok(nomeBase('NOVA ERA CONSULTORIA ADUANEIRA LTDA - PROCESSO') === nomeBase('NOVA ERA CONSULTORIA ADUANEIRA LTDA'), 'nome-base ignora LTDA');
ok(nomeBase('73,108,138 - LOJAS RIACHUELO SA') === '', 'nome-base só de números não vale');
ok(inicioDoNome('INSTITUTO DE GESTAO REDES') !== inicioDoNome('INSTITUTO DE TECNOLOGIA E TREINAMENTO') && inicioDoNome('M J COMERCIO') === '' && inicioDoNome('ELEICAO 2026 FULANO') === 'ELEICAO 2026', 'início de nome ignora DE e letras soltas');
ok(localDoGrupo('AUTO', { AGF: 10, BALCAO: 2, METRO: 0 }, 'BALCAO') === 'AGF' && localDoGrupo('AUTO', { AGF: 5, BALCAO: 5, METRO: 0 }, 'BALCAO') === 'BALCAO'
  && localDoGrupo('METRO', { AGF: 10 }, 'AGF') === 'METRO', 'LOCAL: maior percentual, empate fica com o principal, manual vence');

// 1) CRM antes dos grupos
let r = await calcularCrmD1(env, 'TESTE');
ok(r.grupos === 0 && met('S2') && met('S2').d.DIAS_SEM_POSTAR >= 30, 'antes: cadastro do setor aparece sozinho, 30+ dias sem postar', met('S2')?.d);
const acaoS2Antes = met('S2').acao;

// 2) sugestões
let sg = await sugestoesGrupos(env);
const sBase = sg.sugestoes.find((s) => s.motivo === 'NOME_BASE');
ok(sBase && sBase.score === 85 && sBase.clientes.map((c) => c.id).sort().join() === 'S1,S2,S3' && sBase.nomeSugerido === 'ASSOCIACAO SHALOM', 'sugestão por nome-base junta os 3 Shalom', sBase);
ok(sg.sugestoes.some((s) => s.motivo === 'INICIO_NOME' && s.score === 60 && s.clientes.length === 2), 'ELEICAO 2026 vira sugestão de confiança baixa');
const sCtr = sg.sugestoes.filter((s) => s.motivo === 'MESMO_CONTRATO');
ok(sCtr.length === 1 && sCtr[0].clientes.map((c) => c.id).sort().join() === 'MV,MV2' && sCtr[0].score === 75, 'mesmo contrato + nome parecido vira sugestão', sCtr);
ok(!sg.sugestoes.some((s) => s.clientes.some((c) => c.id === 'CA')), 'só contrato, sem nome parecido, não vira sugestão');
ok(!sg.sugestoes.some((s) => s.clientes.some((c) => c.id.startsWith('B'))), 'contrato compartilhado no balcão não vira sugestão');
ok(sg.sugestoes.filter((s) => s.clientes.some((c) => c.id === 'S2')).length === 1, 'sugestão contida em outra maior não repete (contrato do Shalom)');

// 3) tratativa no cadastro do setor antes de agrupar
run(`INSERT INTO crm_tratativas(TRATATIVA_ID, TIPO_ENTIDADE, ENTIDADE_ID, FUNIL_ID, ETAPA_ID, STATUS_TRATATIVA) VALUES ('TRT_1','CLIENTE','S2','FUNIL_CLIENTES','C_TRATATIVA','ABERTA')`);
run(`INSERT INTO crm_cadastro(CLIENTE_ID, ORIGEM, WHATSAPP, CLIENTE) VALUES ('S2','ATENDE','85999990000','NOME MANUAL DO SETOR')`);

// 4) criar o grupo
let g = await salvarGrupo(env, { nome: 'associação shalom', membros: ['S1', 'S2', 'S3'], principalId: 'S1', localModo: 'AUTO' }, 'rachel');
ok(g.criado && /^GRP_[0-9A-F]{8}$/.test(g.grupoId), 'grupo criado', g);
const GID = g.grupoId;
ok(um(`SELECT nome FROM crm_grupos WHERE id=?`, GID).nome === 'ASSOCIAÇÃO SHALOM', 'nome em maiúsculas');
ok(um(`SELECT ENTIDADE_ID FROM crm_tratativas WHERE TRATATIVA_ID='TRT_1'`).ENTIDADE_ID === 'S1', 'tratativa do setor passa para o principal');
ok(um(`SELECT WHATSAPP FROM crm_cadastro WHERE CLIENTE_ID='S2'`).WHATSAPP === '85999990000' && !um(`SELECT 1 x FROM crm_cadastro WHERE CLIENTE_ID='S1'`), 'cadastro manual de cada membro fica intacto');
ok(um(`SELECT valor FROM cid_estado WHERE chave='crm_pendente'`).valor === '1', 'CRM marcado para recalcular');
ok(um(`SELECT COUNT(*) n FROM cid_clientes`).n === 14 && um(`SELECT nome FROM cid_clientes WHERE id='S2'`).nome === 'ASSOCIACAO SHALOM (SETOR JURIDICO)', 'nada muda no cadastro');

r = await calcularCrmD1(env, 'TESTE');
const s1 = met('S1');
ok(r.grupos === 1 && !met('S2') && !met('S3') && s1.d.GRUPO_ID === GID && s1.nome === 'ASSOCIAÇÃO SHALOM', 'CRM: uma linha só, com o nome do grupo', { grupos: r.grupos, nome: s1?.nome });
ok(s1.d.DIAS_SEM_POSTAR === 0 && s1.d.GRUPO_MEMBROS.length === 3 && s1.d.GRUPO_MEMBROS[0].id === 'S1' && s1.d.GRUPO_MEMBROS[0].principal, 'grupo ativo; principal primeiro', s1.d.GRUPO_MEMBROS);
const somaVt = um(`SELECT ROUND(SUM(valor),2) v FROM cid_postagens WHERE grafia IN ('ASSOCIACAO SHALOM','ASSOCIACAO SHALOM (SETOR JURIDICO)','ASSOCIAÇÃO SHALOM - CHAMA VIVA')`).v;
ok(Math.abs(s1.d.VALOR_TOTAL - somaVt) < 0.01, 'faturamento somado dos 3 cadastros', { motor: s1.d.VALOR_TOTAL, somaVt });
ok(s1.d.GRUPO_MEMBROS.find((x) => x.id === 'S2').diasSemPostar >= 30 && s1.d.GRUPO_MEMBROS.find((x) => x.id === 'S3').fat30 === 360, 'quebra por cadastro', s1.d.GRUPO_MEMBROS);
ok(s1.acao !== 'RESGATAR' || acaoS2Antes !== 'RESGATAR', 'alerta falso do setor some', { grupo: s1.acao, antes: acaoS2Antes });

// 5) regra: um cadastro só pode estar em um grupo
await espera(() => salvarGrupo(env, { nome: 'OUTRO', membros: ['S2', 'X'] }, 'rachel'), 'JA_EM_GRUPO', 'cadastro em dois grupos é recusado');
await espera(() => salvarGrupo(env, { nome: 'SO UM', membros: ['X'] }, 'rachel'), '', 'grupo com 1 cadastro é recusado');
await espera(() => salvarGrupo(env, { nome: '', membros: ['X', 'E1'] }, 'rachel'), '', 'grupo sem nome é recusado');
await espera(() => salvarGrupo(env, { nome: 'FANTASMA', membros: ['X', 'NAO_EXISTE'] }, 'rachel'), 'CADASTRO_SUMIU', 'cadastro inexistente é recusado');

// 6) membro de outro LOCAL: grupo continua no LOCAL com mais postagens
g = await salvarGrupo(env, { id: GID, nome: 'ASSOCIAÇÃO SHALOM', membros: ['S1', 'S2', 'S3', 'S4'], principalId: 'S1', localModo: 'AUTO' }, 'rachel');
await calcularCrmD1(env, 'TESTE');
let x = met('S1');
const m4 = x.d.GRUPO_MEMBROS.find((y) => y.id === 'S4');
ok(x.local === 'AGF' && m4 && m4.noLocal === false && m4.postagensFora === 2 && x.d.GRUPO_LOCAL_PCT > 0.9, 'grupo fica no AGF; BALCÃO fora do cálculo', { local: x.local, m4, pct: x.d.GRUPO_LOCAL_PCT });
ok(!met('S4'), 'cadastro do BALCÃO não aparece solto');
// LOCAL fixado manualmente
await salvarGrupo(env, { id: GID, nome: 'ASSOCIAÇÃO SHALOM', membros: ['S1', 'S2', 'S3', 'S4'], principalId: 'S1', localModo: 'BALCAO' }, 'rachel');
await calcularCrmD1(env, 'TESTE');
x = met('S1');
ok(x.local === 'BALCAO' && Math.abs(x.d.VALOR_TOTAL - 40) < 0.01 && x.d.GRUPO_LOCAL_MODO === 'BALCAO', 'LOCAL manual: só postagens do BALCÃO', { local: x.local, vt: x.d.VALOR_TOTAL });
await salvarGrupo(env, { id: GID, nome: 'ASSOCIAÇÃO SHALOM', membros: ['S1', 'S2', 'S3', 'S4'], principalId: 'S1', localModo: 'AUTO' }, 'rachel');
await calcularCrmD1(env, 'TESTE');

// 7) CRM: cadastro, curva ABC, carteira
const cad = await crm('get_cadastro_v5', { tipo: 'CLIENTE' });
const item = cad.items.find((y) => y.clienteId === 'S1');
ok(item && item.grupoId === GID && item.cliente === 'ASSOCIAÇÃO SHALOM' && item.grupoMembros.length === 4 && !cad.items.some((y) => ['S2', 'S3', 'S4'].includes(y.clienteId)), 'CRM Cadastro: linha do grupo com membros', item && { c: item.cliente, n: item.grupoMembros.length });
run(`INSERT INTO crm_cadastro(CLIENTE_ID, ORIGEM, CLIENTE) VALUES ('S1','ATENDE','NOME MANUAL ANTIGO') ON CONFLICT(CLIENTE_ID) DO UPDATE SET CLIENTE=excluded.CLIENTE`);
const cad2 = await crm('get_cadastro_v5', { tipo: 'CLIENTE' });
ok(cad2.items.find((y) => y.clienteId === 'S1').cliente === 'ASSOCIAÇÃO SHALOM', 'nome do grupo vence nome manual do CRM');
const abc = await crm('get_curva_abc_v1', { local: 'AGF' });
const linha = abc.rows.find((y) => y.id === 'S1');
const somaAgf = um(`SELECT ROUND(SUM(valor),2) v FROM cid_postagens WHERE local_codigo='AGF' AND grafia LIKE '%SHALOM%'`).v;
ok(linha && Math.abs(linha.tV - somaAgf) < 0.01 && linha.grupoN === 4 && !abc.rows.some((y) => ['S2', 'S3'].includes(y.id)) && linha.nome === 'ASSOCIAÇÃO SHALOM', 'Curva ABC: uma linha, soma do grupo', linha);
const abcB = await crm('get_curva_abc_v1', { local: 'BALCAO' });
ok(abcB.rows.some((y) => y.id === 'S1' && y.localCarteira === 'AGF') && !abcB.rows.some((y) => y.id === 'S4'), 'Curva do BALCÃO mostra as postagens do grupo lá com o nome do grupo');
const cart = await crm('get_carteira_v1', { local: 'AGF' });
ok(cart.ok && !cart.fila.some((y) => ['S2', 'S3'].includes(y.clienteId)), 'fila do motor sem os cadastros do grupo', cart.fila.map((y) => y.clienteId));

// 8) listagem e ficha no /cadastros
let lg = await listarGrupos(env, {});
ok(lg.total === 1 && lg.cadastros === 4 && lg.grupos[0].crm && lg.grupos[0].crm.emDia && lg.grupos[0].local === 'AGF' && lg.grupos[0].membros[0].principal, 'listagem: CRM em dia', lg.grupos[0] && lg.grupos[0].crm);
ok((await listarGrupos(env, { q: 'juridico' })).grupos.length === 1 && (await listarGrupos(env, { local: 'METRO' })).grupos.length === 0, 'busca por cadastro e filtro de LOCAL');
const fg = await grupoDoCliente(env, 'S3');
ok(fg && fg.id === GID && fg.membros.length === 4, 'ficha do cadastro mostra o grupo');
ok(await grupoDoCliente(env, 'X') === null, 'cadastro sem grupo');

// 9) sugestões depois do grupo
sg = await sugestoesGrupos(env);
ok(!sg.sugestoes.some((s) => s.motivo === 'NOME_BASE' && s.clientes.some((c) => c.id.startsWith('S'))), 'sugestão do Shalom some (já agrupado)');
const sE = sg.sugestoes.find((s) => s.motivo === 'INICIO_NOME');
await rejeitarSugestao(env, { chave: sE.chave }, 'rachel');
ok(!(await sugestoesGrupos(env)).sugestoes.some((s) => s.chave === sE.chave), 'Não são o mesmo: sugestão não volta');
await restaurarSugestao(env, { chave: sE.chave });
ok((await sugestoesGrupos(env)).sugestoes.some((s) => s.chave === sE.chave), 'desfazer a recusa traz de volta');

// 10) trocar o principal leva as tratativas
g = await salvarGrupo(env, { nome: 'CEA MODAS', membros: ['CEA', 'CA'], principalId: 'CA' }, 'rachel');
run(`INSERT INTO crm_tratativas(TRATATIVA_ID, TIPO_ENTIDADE, ENTIDADE_ID, FUNIL_ID, ETAPA_ID, STATUS_TRATATIVA) VALUES ('TRT_2','CLIENTE','CA','FUNIL_CLIENTES','C_TRATATIVA','ABERTA')`);
await salvarGrupo(env, { id: g.grupoId, nome: 'CEA MODAS', membros: ['CEA', 'CA'], principalId: 'CEA' }, 'rachel');
ok(um(`SELECT ENTIDADE_ID FROM crm_tratativas WHERE TRATATIVA_ID='TRT_2'`).ENTIDADE_ID === 'CEA', 'troca de principal leva a tratativa');
await calcularCrmD1(env, 'TESTE');
ok(met('CEA').d.GRUPO_ID === g.grupoId && !met('CA'), 'grupo do contrato no CRM');
// aviso de tratativas repetidas
run(`INSERT INTO crm_tratativas(TRATATIVA_ID, TIPO_ENTIDADE, ENTIDADE_ID, FUNIL_ID, ETAPA_ID, STATUS_TRATATIVA) VALUES ('TRT_3','CLIENTE','E1','FUNIL_CLIENTES','C_TRATATIVA','ABERTA'),('TRT_4','CLIENTE','E2','FUNIL_CLIENTES','C_TRATATIVA','ABERTA')`);
const gE = await salvarGrupo(env, { nome: 'TESTE ELEICAO', membros: ['E1', 'E2'], principalId: 'E1' }, 'rachel');
ok(gE.avisos.length === 1 && /2 tratativas abertas/.test(gE.avisos[0]), 'avisa tratativas repetidas', gE.avisos);
await desfazerGrupo(env, { id: gE.grupoId }, 'rachel');

// 11) limpeza do Cadastro junta um membro com outro ID: o grupo acompanha
run(`INSERT INTO cid_clientes(id, nome, portal_chave, local_carteira) VALUES ('S3N','ASSOCIACAO SHALOM CHAMA VIVA', NULL, 'AGF')`);
await DB.batch(statementsFusaoCrm(DB, [['S3', 'S3N']]));
ok(um(`SELECT grupo_id FROM crm_grupo_membros WHERE cliente_id='S3N'`)?.grupo_id === GID && !um(`SELECT 1 x FROM crm_grupo_membros WHERE cliente_id='S3'`), 'ID fundido herda o lugar no grupo');
await DB.batch(statementsFusaoCrm(DB, [['S1', 'S1N']]));
ok(um(`SELECT principal_id FROM crm_grupos WHERE id=?`, GID).principal_id === 'S1N' && um(`SELECT ENTIDADE_ID FROM crm_tratativas WHERE TRATATIVA_ID='TRT_1'`).ENTIDADE_ID === 'S1N', 'principal fundido: o ID novo vira o principal e leva a tratativa');
await DB.batch(statementsFusaoCrm(DB, [['S1N', 'S1']]));                                       // volta ao estado anterior para os próximos passos
ok(um(`SELECT principal_id FROM crm_grupos WHERE id=?`, GID).principal_id === 'S1', 'volta do principal');
run(`INSERT INTO cid_clientes(id, nome) VALUES ('S2N','ASSOCIACAO SHALOM SETOR')`);
run(`INSERT INTO crm_grupo_membros(cliente_id, grupo_id) VALUES ('S2N', ?)`, g.grupoId);       // S2N já está em outro grupo
await DB.batch(statementsFusaoCrm(DB, [['S2', 'S2N']]));
ok(um(`SELECT grupo_id FROM crm_grupo_membros WHERE cliente_id='S2N'`).grupo_id === g.grupoId && !um(`SELECT 1 x FROM crm_grupo_membros WHERE cliente_id='S2'`), 'ID fundido já em outro grupo: continua lá');
run(`DELETE FROM crm_grupo_membros WHERE cliente_id IN ('S3N','S2N')`);
run(`INSERT INTO crm_grupo_membros(cliente_id, grupo_id) VALUES ('S2', ?), ('S3', ?)`, GID, GID);
run(`DELETE FROM cid_clientes WHERE id IN ('S3N','S2N')`);

// 12) desfazer
const d = await desfazerGrupo(env, { id: GID }, 'rachel');
ok(d.nome === 'ASSOCIAÇÃO SHALOM' && !um(`SELECT 1 x FROM crm_grupos WHERE id=?`, GID) && !um(`SELECT 1 x FROM crm_grupo_membros WHERE grupo_id=?`, GID), 'grupo desfeito');
await calcularCrmD1(env, 'TESTE');
ok(met('S2') && met('S3') && met('S4') && !met('S1').d.GRUPO_ID && met('S1').nome === 'ASSOCIACAO SHALOM', 'CRM volta a mostrar cada cadastro');
ok(um(`SELECT ENTIDADE_ID FROM crm_tratativas WHERE TRATATIVA_ID='TRT_1'`).ENTIDADE_ID === 'S1', 'o que foi registrado como grupo fica no principal');
ok(um(`SELECT COUNT(*) n FROM crm_eventos WHERE ENTIDADE_TIPO='GRUPO'`).n >= 6, 'histórico em crm_eventos');
await espera(() => desfazerGrupo(env, { id: GID }, 'rachel'), '', 'desfazer de novo dá erro claro');

console.log(`\n${total - falhas}/${total} testes dos grupos comerciais passaram`);
if (falhas) process.exit(1);
