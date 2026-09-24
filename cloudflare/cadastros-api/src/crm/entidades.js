/**
 * Clientes e prospects do CRM.
 * Cliente = metricas do Visao 360 (crm_metricas, calculadas pelo crm_motor) + cadastro manual (crm_cadastro).
 * Cliente criado no CRM sem postagem (ORIGEM MANUAL) entra com metricas zeradas, como antes.
 */
import { calcularAcao, midiaDaSubAcao } from '../crm_motor.js';
import { text, upper, upperNoAccents, nowIso, hoje, diffDays, ymd, novoId, primeiro, falhar, todos, um, insert, update, lote, bumpRev } from './util.js';
import { locaisPermitidos, localPermitido, lerResponsaveis, resolverResponsavel, CRM_LOCAIS } from './config.js';

// colunas do cadastro manual editaveis pelo modal do cliente (update_cliente)
export const CLIENTE_EDITAVEIS = ['CLIENTE', 'RAZAO_SOCIAL', 'PESSOA_CONTATO', 'WHATSAPP', 'EMAIL', 'ENDERECO', 'NUMERO', 'COMPLEMENTO', 'BAIRRO', 'CEP',
  'MIDIA', 'LINK_MIDIA_DIRETO', 'STATUS_COMERCIAL', 'OBSERVACOES', 'ULTIMA_VISITA', 'PROXIMA_ACAO_MANUAL', 'RESPONSAVEL_CARTEIRA', 'CNPJ_CPF',
  'NOME_FANTASIA', 'NUMERO_CONTRATO', 'CARTAO_POSTAGEM', 'SEGMENTO_PREDOMINANTE'];
const MANUAIS = ['CLIENTE', 'NOME_FANTASIA', 'RAZAO_SOCIAL', 'CNPJ_CPF', 'PESSOA_CONTATO', 'WHATSAPP', 'TELEFONE', 'EMAIL', 'ENDERECO', 'NUMERO', 'COMPLEMENTO',
  'BAIRRO', 'CEP', 'CIDADE', 'UF', 'SEGMENTO_PREDOMINANTE', 'NUMERO_CONTRATO', 'CARTAO_POSTAGEM', 'STATUS_COMERCIAL', 'OBSERVACOES', 'ULTIMA_VISITA',
  'ULTIMO_RESULTADO_VISITA', 'CHECKLIST_ULTIMA_VISITA_ID', 'DATA_PROXIMO_FOLLOWUP', 'PROXIMA_ACAO_MANUAL', 'MIDIA', 'LINK_MIDIA_DIRETO',
  'RESPONSAVEL_CARTEIRA', 'RESPONSAVEL_ID', 'STATUS_CADASTRO'];

const nn = (v) => v !== null && v !== undefined;
const intermediadorExibido = (m) => (upper(m.INTERMEDIADOR_PREDOMINANTE) === 'INTERMEDIADOR' && text(m.TIPO_CONTRATO_PREDOMINANTE)) ? text(m.TIPO_CONTRATO_PREDOMINANTE) : text(m.INTERMEDIADOR_PREDOMINANTE);

/** Linha no formato da antiga CLIENTES_MASTER. */
function linhaMaster(m, cad, links) {
  const c = cad || {};
  const r = { ...m };
  r.CLIENTE_ID = m.CLIENTE_ID;
  r.NOME_REMETENTE_BASE = text(m.CLIENTE);
  r.LOCAL_PREDOMINANTE = text(m.LOCAL === 'SEM_LOCAL' ? '' : m.LOCAL);
  r.INTERMEDIADOR_PREDOMINANTE = intermediadorExibido(m);
  r.ACAO_ENGINE = text(m.ACAO);
  for (const k of MANUAIS) r[k] = nn(c[k]) ? c[k] : (k === 'CLIENTE' ? text(m.CLIENTE) : (['NUMERO_CONTRATO', 'CARTAO_POSTAGEM', 'MIDIA'].includes(k) ? text(m[k]) : ''));
  r.ACAO_ATUAL = text(c.ACAO_ATUAL);
  r.ACAO = r.ACAO_ATUAL || text(m.ACAO) || 'MANTER';
  if (!nn(c.LINK_MIDIA_DIRETO)) r.LINK_MIDIA_DIRETO = links[r.MIDIA] || '';
  r.TRATATIVA_ATIVA_ID = text(c.TRATATIVA_ATIVA_ID);
  return r;
}

/** Cliente criado no CRM, sem postagem no Visao 360 (mesmos valores do crm_appendCadastroOnlyMetrics_). */
function linhaManual(c, links) {
  const m = {
    CLIENTE_ID: c.CLIENTE_ID, CLIENTE: text(c.CLIENTE), LOCAL: text(c.LOCAL_PADRAO), NUMERO_CONTRATO: text(c.NUMERO_CONTRATO), CARTAO_POSTAGEM: text(c.CARTAO_POSTAGEM),
    TIPO_SERVICO_PREDOMINANTE: '', INTERMEDIADOR_PREDOMINANTE: '', CATEGORIA_PREDOMINANTE: '', BUCKET_NEGOCIO: 'INTERMEDIADOR', PERFIL_COMERCIAL: 'SEM_HISTORICO',
    TEM_CONTRATO: text(c.NUMERO_CONTRATO) ? 'SIM' : 'NAO', DATA_PRIMEIRA_POSTAGEM: '', DATA_PRIMEIRA_VALIDA_NAO_REVERSO: '', DATA_ULTIMA_POSTAGEM: '',
    DIAS_SEM_POSTAR: 9999, STATUS_ATIVIDADE: 'SEM_POSTAGEM', NOVO_CLIENTE: 'NAO', INATIVO_30D: 'SIM', INATIVO_60D: 'SIM', CURVA: 'C', CURVA_ANTERIOR: 'C',
    MOVIMENTO_CURVA: 'MANTEVE', PORTE_OPERACIONAL: 'MICRO', SHARE_LOCAL_30D: 0, NIVEL_ALERTA: 'SEM_HISTORICO', QUEDA_REAL: 'NAO', QUEDA_LEVE_SAZONAL: 'NAO',
    IS_REVERSO_BAIXO: 'NAO', FAT_30D: 0, QTD_30D: 0, DIAS_ATIVOS_30D: 0, TICKET_30D: 0, FAT_31_60D: 0, QTD_31_60D: 0, DIAS_ATIVOS_31_60D: 0, TICKET_31_60D: 0,
    TENDENCIA: 'ESTAVEL', FD_PCT: 0, QD_PCT: 0, DD_PCT: 0, QTD_TOTAL: 0, VALOR_TOTAL: 0, DIAS_ATIVOS_TOTAL: 0, MESES_ATIVOS_TOTAL: 0,
    RECORRENTE_30D: 'NAO', RECORRENCIA_NIVEL: 'SEM_BASE', SCORE_CURVA_ATUAL: 0, SCORE_CURVA_ANTERIOR: 0,
  };
  calcularAcao(m);
  m.MIDIA = midiaDaSubAcao(m.SUB_ACAO || m.ACAO) || '';
  return linhaMaster(m, c, links);
}

/**
 * Clientes no formato master. opts.ids: so esses (lookup rapido); opts.user: aplica o escopo de LOCAL do responsavel.
 */
export async function carregarClientes(db, { ids = null, user = null } = {}) {
  const perm = user ? locaisPermitidos(user) : null;
  const links = Object.fromEntries((await todos(db, `SELECT CODIGO_MIDIA, LINK FROM crm_midias`)).map((x) => [x.CODIGO_MIDIA, x.LINK]));
  let met, cads;
  if (ids) {
    const lista = [...new Set(ids.map(text).filter(Boolean))];
    met = []; cads = [];
    for (let i = 0; i < lista.length; i += 90) {
      const parte = lista.slice(i, i + 90), marcas = parte.map(() => '?').join(',');
      met.push(...await todos(db, `SELECT cliente_id, dados FROM crm_metricas WHERE cliente_id IN (${marcas})`, ...parte));
      cads.push(...await todos(db, `SELECT * FROM crm_cadastro WHERE CLIENTE_ID IN (${marcas})`, ...parte));
    }
  } else {
    met = await todos(db, `SELECT cliente_id, dados FROM crm_metricas ORDER BY prioridade_rank DESC, score DESC, share DESC, nome`);
    cads = await todos(db, `SELECT * FROM crm_cadastro`);
  }
  const cadPorId = new Map(cads.map((c) => [c.CLIENTE_ID, c]));
  const out = [];
  for (const x of met) out.push(linhaMaster(JSON.parse(x.dados), cadPorId.get(x.cliente_id), links));
  for (const c of cads) if (c.ORIGEM === 'MANUAL') out.push(linhaManual(c, links));
  return perm ? out.filter((r) => localPermitido(perm, r.LOCAL_PREDOMINANTE)) : out;
}

const numero = (v) => Number(v) || 0;
function rotuloUltimaPostagem(v) {
  const d = ymd(v);
  return d ? `${Math.max(0, diffDays(hoje(), d))}d` : 'Sem postagem';
}
/** op_projectClient_ 'full' (+ responsavelCarteira/responsavelId, que faltavam e faziam a edicao apagar o responsavel). */
export function projetarCliente(r) {
  return {
    clienteId: text(r.CLIENTE_ID), cliente: text(r.CLIENTE) || text(r.NOME_REMETENTE_BASE), local: text(r.LOCAL_PREDOMINANTE), curva: text(r.CURVA),
    acao: text(r.ACAO_ATUAL) || text(r.ACAO), acaoEngine: text(r.ACAO_ENGINE) || text(r.ACAO), acaoAtual: text(r.ACAO_ATUAL) || text(r.ACAO),
    subAcao: text(r.SUB_ACAO), prioridadeFila: text(r.PRIORIDADE_FILA), canalSugerido: text(r.CANAL_SUGERIDO), conteudoSugerido: text(r.CONTEUDO_SUGERIDO),
    motivoRegra: text(r.MOTIVO_REGRA), midia: text(r.MIDIA), linkMidiaDireto: text(r.LINK_MIDIA_DIRETO), whatsapp: text(r.WHATSAPP),
    ultimaPostagemLabel: rotuloUltimaPostagem(r.DATA_ULTIMA_POSTAGEM), diasSemPostar: numero(r.DIAS_SEM_POSTAR),
    razaoSocial: text(r.RAZAO_SOCIAL), cnpjCpf: text(r.CNPJ_CPF), nomeFantasia: text(r.NOME_FANTASIA), pessoaContato: text(r.PESSOA_CONTATO), email: text(r.EMAIL),
    endereco: text(r.ENDERECO), numero: text(r.NUMERO), complemento: text(r.COMPLEMENTO), bairro: text(r.BAIRRO), cep: text(r.CEP),
    scorePrioridade: numero(r.SCORE_PRIORIDADE), perfilComercial: text(r.PERFIL_COMERCIAL), porteOperacional: text(r.PORTE_OPERACIONAL),
    shareLocal30d: numero(r.SHARE_LOCAL_30D), nivelAlerta: text(r.NIVEL_ALERTA), quedaReal: text(r.QUEDA_REAL), quedaLeveSazonal: text(r.QUEDA_LEVE_SAZONAL),
    novoCliente: text(r.NOVO_CLIENTE), segmento: text(r.SEGMENTO_PREDOMINANTE), tipo: text(r.TIPO_SERVICO_PREDOMINANTE), intermediador: text(r.INTERMEDIADOR_PREDOMINANTE),
    statusComercial: text(r.STATUS_COMERCIAL), observacoes: text(r.OBSERVACOES), ultimaVisita: text(r.ULTIMA_VISITA), proximaAcaoManual: text(r.PROXIMA_ACAO_MANUAL),
    dataPrimeiraPostagem: ymd(r.DATA_PRIMEIRA_POSTAGEM), dataUltimaPostagem: ymd(r.DATA_ULTIMA_POSTAGEM), inativo60d: text(r.INATIVO_60D),
    temContrato: text(r.TEM_CONTRATO), numeroContrato: text(r.NUMERO_CONTRATO), cartao: text(r.CARTAO_POSTAGEM), tendencia: text(r.TENDENCIA),
    bucket: text(r.BUCKET_NEGOCIO), movimentoCurva: text(r.MOVIMENTO_CURVA), recorrenciaNivel: text(r.RECORRENCIA_NIVEL),
    qtd30d: numero(r.QTD_30D), valor30d: numero(r.FAT_30D), qtdTotal: numero(r.QTD_TOTAL), valorTotal: numero(r.VALOR_TOTAL),
    responsavelCarteira: text(r.RESPONSAVEL_CARTEIRA), responsavelId: text(r.RESPONSAVEL_ID),
    rowNumber: 0,
  };
}

// ------------------------------------------------------------ prospects
const PROSPECT_CAMPOS = [['prospectId', 'PROSPECT_ID'], ['cliente', 'CLIENTE'], ['local', 'LOCAL'], ['segmento', 'SEGMENTO'], ['nomeFantasia', 'NOME_FANTASIA'],
  ['razaoSocial', 'RAZAO_SOCIAL'], ['cnpjCpf', 'CNPJ_CPF'], ['atividadeEconomica', 'ATIVIDADE_ECONOMICA'], ['endereco', 'ENDERECO'], ['numero', 'NUMERO'],
  ['complemento', 'COMPLEMENTO'], ['bairro', 'BAIRRO'], ['cidade', 'CIDADE'], ['uf', 'UF'], ['cep', 'CEP'], ['mapsUrl', 'MAPS_URL'], ['contato', 'CONTATO'],
  ['cargo', 'CARGO'], ['whatsapp', 'WHATSAPP'], ['telefone2', 'TELEFONE_2'], ['email', 'EMAIL'], ['instagram', 'INSTAGRAM'], ['perfil', 'PERFIL'],
  ['potencial', 'POTENCIAL'], ['prioridade', 'PRIORIDADE'], ['statusProspect', 'STATUS_PROSPECT'], ['etapaFunil', 'ETAPA_FUNIL'], ['responsavel', 'RESPONSAVEL'],
  ['origemLead', 'ORIGEM_LEAD'], ['canalEnvioAtual', 'CANAL_ENVIO_ATUAL'], ['frequenciaEnvio', 'FREQUENCIA_ENVIO'], ['volumeMedio', 'VOLUME_MEDIO'],
  ['jaPostaCorreios', 'JA_POSTA_CORREIOS'], ['temContratoCorreios', 'TEM_CONTRATO_CORREIOS'], ['temCartaoPostagem', 'TEM_CARTAO_POSTAGEM'],
  ['parceiroPrincipal', 'PARCEIRO_PRINCIPAL'], ['usaIntermediador', 'USA_INTERMEDIADOR'], ['intermediadorQual', 'INTERMEDIADOR_QUAL'], ['canalVenda', 'CANAL_VENDA'],
  ['atendeSacoleirasExcursao', 'ATENDE_SACOLEIRAS_EXCURSAO'], ['dorPrincipal', 'DOR_PRINCIPAL'], ['oportunidadePrincipal', 'OPORTUNIDADE_PRINCIPAL'],
  ['ultimoResultadoVisita', 'ULTIMO_RESULTADO_VISITA'], ['proximaAcao', 'PROXIMA_ACAO'], ['checklistUltimaVisitaId', 'CHECKLIST_ULTIMA_VISITA_ID'],
  ['canalPreferencial', 'CANAL_PREFERENCIAL'], ['abordagemInicial', 'ABORDAGEM_INICIAL'], ['objecaoPrincipal', 'OBJECAO_PRINCIPAL'], ['temInteresse', 'TEM_INTERESSE'],
  ['obs', 'OBS'], ['clienteIdConvertido', 'CLIENTE_ID_CONVERTIDO'], ['clienteNomeConvertido', 'CLIENTE_NOME_CONVERTIDO'], ['tipoConversao', 'TIPO_CONVERSAO'],
  ['matchStatus', 'MATCH_STATUS'], ['responsavelId', 'RESPONSAVEL_ID']];
const PROSPECT_DATAS = [['dataCadastro', 'DATA_CADASTRO'], ['ultimoContato', 'ULTIMO_CONTATO'], ['dataProximoFollowup', 'DATA_PROXIMO_FOLLOWUP'], ['dataConversao', 'DATA_CONVERSAO']];
export function projetarProspect(r) {
  const o = { rowNumber: 0 };
  for (const [k, c] of PROSPECT_CAMPOS) o[k] = text(r[c]);
  for (const [k, c] of PROSPECT_DATAS) o[k] = ymd(r[c]);
  o.score = Number(r.SCORE) || 0;
  return o;
}
export async function carregarProspects(db, { ids = null, user = null } = {}) {
  let rows;
  if (ids) {
    const lista = [...new Set(ids.map(text).filter(Boolean))];
    rows = [];
    for (let i = 0; i < lista.length; i += 90) { const p = lista.slice(i, i + 90); rows.push(...await todos(db, `SELECT * FROM crm_prospects WHERE PROSPECT_ID IN (${p.map(() => '?').join(',')})`, ...p)); }
  } else rows = await todos(db, `SELECT * FROM crm_prospects ORDER BY rowid`);
  const perm = user ? locaisPermitidos(user) : null;
  return perm ? rows.filter((r) => localPermitido(perm, r.LOCAL)) : rows;
}

// ------------------------------------------------------------ GET
export async function getCadastro(env, p, user) {
  const tipo = upper(p.tipo || 'CLIENTE');
  if (tipo === 'PROSPECT' || tipo === 'PROSPECTS') return { ok: true, tipo: 'PROSPECT', items: (await carregarProspects(env.DB, { user })).map(projetarProspect) };
  return { ok: true, tipo: 'CLIENTE', items: (await carregarClientes(env.DB, { user })).map(projetarCliente) };
}

// ------------------------------------------------------------ POST clientes
const valorPayload = (p, ...chaves) => { for (const k of chaves) if (p[k] !== undefined && p[k] !== null) return String(p[k]); return undefined; };

export async function updateCliente(env, p, user) {
  const db = env.DB;
  const id = text(p.clienteId);
  if (!id) falhar('clienteId obrigatório.');
  const [atual] = await carregarClientes(db, { ids: [id] });
  if (!atual) falhar('Cliente não encontrado.');
  const cad = await um(db, `SELECT * FROM crm_cadastro WHERE CLIENTE_ID=?`, id);
  const patch = {};
  for (const k of CLIENTE_EDITAVEIS) {
    if (p[k] === undefined) continue;
    const v = String(p[k] ?? '');
    // so vira valor manual o que o usuario mudou; o resto continua vindo do Visao 360 (nome, contrato, midia)
    if ((!cad || cad[k] === null || cad[k] === undefined) && v === text(atual[k])) continue;
    patch[k] = v;
  }
  const acao = p.ACAO_ATUAL !== undefined ? p.ACAO_ATUAL : p.ACAO;
  if (acao !== undefined) patch.ACAO_ATUAL = String(acao ?? '');
  await gravarCadastro(db, id, patch, user, 'CRM_API_UPDATE');
  return { ok: true, clienteId: id };
}

/** Upsert parcial do cadastro manual. */
export async function gravarCadastro(db, id, patch, user, origem, { manual = false } = {}) {
  const agora = nowIso(), quem = text(user?.username) || origem;
  const cols = Object.keys(patch);
  const base = { CLIENTE_ID: id, ORIGEM: manual ? 'MANUAL' : 'ATENDE', CRIADO_EM: agora, ATUALIZADO_EM: agora, ATUALIZADO_POR: quem, ...patch };
  const todasCols = Object.keys(base);
  await db.prepare(`INSERT INTO crm_cadastro(${todasCols.join(',')}) VALUES(${todasCols.map(() => '?').join(',')})
    ON CONFLICT(CLIENTE_ID) DO UPDATE SET ${[...cols, 'ATUALIZADO_EM', 'ATUALIZADO_POR'].map((c) => `${c}=excluded.${c}`).join(',')}`)
    .bind(...todasCols.map((c) => base[c] === undefined ? null : base[c])).run();
}

export async function createCliente(env, p, user, jornada) {
  const db = env.DB;
  const nome = text(p.cliente ?? p.CLIENTE);
  if (!nome) falhar('Nome do cliente obrigatório.');
  const perm = locaisPermitidos(user);
  const localPedido = upperNoAccents(p.local ?? p.LOCAL ?? '');
  const local = CRM_LOCAIS.includes(localPedido) && (!perm || perm.has(localPedido)) ? localPedido : (perm ? [...perm][0] : '') || 'METRO';
  const id = novoId('CLI_M_', 8);
  const g = (camel, up) => text(p[camel] ?? p[up] ?? '');
  const patch = {
    CLIENTE: nome, NOME_REMETENTE_BASE: nome, LOCAL_PADRAO: local, STATUS_COMERCIAL: 'NOVO', STATUS_CADASTRO: 'ATIVO',
    RAZAO_SOCIAL: g('razaoSocial', 'RAZAO_SOCIAL'), CNPJ_CPF: g('cnpjCpf', 'CNPJ_CPF'), NOME_FANTASIA: g('nomeFantasia', 'NOME_FANTASIA'),
    NUMERO_CONTRATO: g('numeroContrato', 'NUMERO_CONTRATO'), CARTAO_POSTAGEM: g('cartaoPostagem', 'CARTAO_POSTAGEM'),
    SEGMENTO_PREDOMINANTE: text(p.segmento ?? p.SEGMENTO_PREDOMINANTE ?? p.SEGMENTO ?? ''), PESSOA_CONTATO: g('pessoaContato', 'PESSOA_CONTATO'),
    WHATSAPP: g('whatsapp', 'WHATSAPP'), EMAIL: g('email', 'EMAIL'), OBSERVACOES: g('observacoes', 'OBSERVACOES'),
    ENDERECO: g('endereco', 'ENDERECO'), NUMERO: g('numero', 'NUMERO'), COMPLEMENTO: g('complemento', 'COMPLEMENTO'), BAIRRO: g('bairro', 'BAIRRO'), CEP: g('cep', 'CEP'),
    RESPONSAVEL_CARTEIRA: g('responsavelCarteira', 'RESPONSAVEL_CARTEIRA'), PROXIMA_ACAO_MANUAL: g('proximaAcaoManual', 'PROXIMA_ACAO_MANUAL'),
    ACAO_ATUAL: text(p.acaoAtual ?? p.acao ?? ''),
  };
  await gravarCadastro(db, id, patch, user, 'CRM_API_CREATE', { manual: true });
  const t = await jornada.criarTratativaDeCadastro(env, 'CLIENTE', id, p, user);
  return { ok: true, clienteId: id, tratativaId: t };
}

// ------------------------------------------------------------ POST prospects
const PROSPECT_EDITAVEIS = ['CLIENTE', 'LOCAL', 'NOME_FANTASIA', 'RAZAO_SOCIAL', 'CNPJ_CPF', 'ATIVIDADE_ECONOMICA', 'ENDERECO', 'NUMERO', 'COMPLEMENTO', 'BAIRRO',
  'CIDADE', 'UF', 'CEP', 'MAPS_URL', 'CONTATO', 'CARGO', 'WHATSAPP', 'TELEFONE_2', 'EMAIL', 'INSTAGRAM', 'PERFIL', 'POTENCIAL', 'PRIORIDADE', 'STATUS_PROSPECT',
  'ETAPA_FUNIL', 'ORIGEM_LEAD', 'CANAL_ENVIO_ATUAL', 'PARCEIRO_PRINCIPAL', 'USA_INTERMEDIADOR', 'INTERMEDIADOR_QUAL', 'ATENDE_SACOLEIRAS_EXCURSAO',
  'DOR_PRINCIPAL', 'OPORTUNIDADE_PRINCIPAL', 'ULTIMO_CONTATO', 'ULTIMO_RESULTADO_VISITA', 'DATA_PROXIMO_FOLLOWUP', 'PROXIMA_ACAO', 'CHECKLIST_ULTIMA_VISITA_ID',
  'CANAL_PREFERENCIAL', 'ABORDAGEM_INICIAL', 'OBJECAO_PRINCIPAL', 'TEM_INTERESSE', 'SCORE', 'OBS', 'SEGMENTO', 'CLIENTE_ID_CONVERTIDO', 'CLIENTE_NOME_CONVERTIDO',
  'TIPO_CONVERSAO', 'DATA_CONVERSAO', 'MATCH_STATUS', 'OBS_CONVERSAO'];
const camel = (k) => k.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

export async function createProspect(env, p, user, jornada) {
  const db = env.DB;
  const g = (k) => text(p[camel(k)] ?? p[k] ?? '');         // aceita camelCase e MAIUSCULO (antes perdia origem, potencial, prioridade, status e Instagram)
  const nome = g('CLIENTE');
  if (!nome) falhar('Nome do prospect obrigatório.');
  const perm = locaisPermitidos(user);
  let local = upperNoAccents(g('LOCAL'));
  if (!CRM_LOCAIS.includes(local) || (perm && !perm.has(local))) local = perm ? ([...perm][0] || '') : (CRM_LOCAIS.includes(local) ? local : '');
  const resp = resolverResponsavel(/^RSP_/i.test(g('RESPONSAVEL')) ? g('RESPONSAVEL') : text(p.responsavelId ?? p.RESPONSAVEL_ID ?? ''),
    /^RSP_/i.test(g('RESPONSAVEL')) ? '' : g('RESPONSAVEL'), await lerResponsaveis(db));
  const id = novoId('PRS_', 8), agora = nowIso();
  const row = { PROSPECT_ID: id };
  for (const k of PROSPECT_EDITAVEIS) row[k] = g(k);
  Object.assign(row, {
    CLIENTE: nome, LOCAL: local, CIDADE: row.CIDADE || 'Fortaleza', UF: row.UF || 'CE', POTENCIAL: row.POTENCIAL || 'A avaliar', PRIORIDADE: row.PRIORIDADE || 'P2',
    STATUS_PROSPECT: row.STATUS_PROSPECT || 'NOVO', ETAPA_FUNIL: '', ORIGEM_LEAD: row.ORIGEM_LEAD || 'Prospecção ativa', ABORDAGEM_INICIAL: row.ABORDAGEM_INICIAL || 'NAO_FEITA',
    RESPONSAVEL: resp.nome, RESPONSAVEL_ID: resp.id, DATA_CADASTRO: agora.slice(0, 10), UPDATED_AT: agora,
  });
  await insert(db, 'crm_prospects', row).run();
  const t = await jornada.criarTratativaDeCadastro(env, 'PROSPECT', id, { ...p, responsavelId: resp.id || p.responsavelId }, user);
  if (t) {
    const tr = await um(db, `SELECT ETAPA_ID FROM crm_tratativas WHERE TRATATIVA_ID=?`, t);
    if (tr) await db.prepare(`UPDATE crm_prospects SET ETAPA_FUNIL=? WHERE PROSPECT_ID=?`).bind(tr.ETAPA_ID, id).run();
  }
  return { ok: true, prospectId: id, tratativaId: t };
}

export async function updateProspect(env, p) {
  const db = env.DB;
  const id = text(p.prospectId);
  if (!id) falhar('prospectId obrigatório.');
  const atual = await um(db, `SELECT * FROM crm_prospects WHERE PROSPECT_ID=?`, id);
  if (!atual) falhar('Prospect não encontrado.');
  const patch = {};
  for (const k of PROSPECT_EDITAVEIS) if (p[k] !== undefined) patch[k] = String(p[k] ?? '');
  const stmts = [];
  if (p.RESPONSAVEL !== undefined || p.RESPONSAVEL_ID !== undefined) {
    const raw = text(p.RESPONSAVEL_ID || p.RESPONSAVEL), ehId = /^RSP_/i.test(raw);
    const r = raw ? resolverResponsavel(ehId ? raw : '', ehId ? '' : raw, await lerResponsaveis(db)) : { id: '', nome: '' };
    patch.RESPONSAVEL = r.nome || (ehId ? '' : raw);
    patch.RESPONSAVEL_ID = r.id || (ehId ? raw : '');
    // o card aberto do funil acompanha o responsavel do prospect
    if (patch.RESPONSAVEL_ID) stmts.push(db.prepare(`UPDATE crm_tratativas SET RESPONSAVEL_ID=?, ATUALIZADO_EM=? WHERE TIPO_ENTIDADE='PROSPECT' AND ENTIDADE_ID=? AND upper(STATUS_TRATATIVA) IN ('ABERTA','PAUSADA')`).bind(patch.RESPONSAVEL_ID, nowIso(), id));
  }
  patch.UPDATED_AT = nowIso();
  stmts.unshift(update(db, 'crm_prospects', 'PROSPECT_ID', id, patch));
  await lote(db, stmts);
  return { ok: true, prospectId: id };
}

export async function syncProspectConversions(env) {
  const db = env.DB;
  const prospects = await todos(db, `SELECT * FROM crm_prospects`);
  if (!prospects.length) return { ok: true, converted: 0, message: 'Sem prospects' };
  const clientes = await carregarClientes(db);
  if (!clientes.length) return { ok: true, converted: 0, message: 'Sem master' };
  const doc = (v) => upperNoAccents(v).replace(/[^0-9A-Z]/g, '');
  const porCnpj = {}, porRazao = {}, porFantasia = {};
  for (const c of clientes) {
    const v = { id: c.CLIENTE_ID, nome: c.CLIENTE }, bairro = upperNoAccents(c.BAIRRO || c.LOCAL_PREDOMINANTE);
    const d = doc(c.CNPJ_CPF); if (d.length >= 8) porCnpj[d] = v;
    porRazao[`${upperNoAccents(c.RAZAO_SOCIAL || c.NOME_REMETENTE_BASE)}|${bairro}`] = v;
    if (text(c.NOME_FANTASIA)) porFantasia[`${upperNoAccents(c.NOME_FANTASIA)}|${bairro}`] = v;
  }
  const stmts = [];
  for (const p of prospects) {
    if (upper(p.TIPO_CONVERSAO) === 'MANUAL' || (upper(p.TIPO_CONVERSAO) === 'AUTO' && text(p.CLIENTE_ID_CONVERTIDO)) || upperNoAccents(p.ETAPA_FUNIL) === 'PERDIDO') continue;
    const bairro = upperNoAccents(p.BAIRRO), d = doc(p.CNPJ_CPF);
    let m = null, tipo = '';
    if (d.length >= 8 && porCnpj[d]) { m = porCnpj[d]; tipo = 'CNPJ'; }
    else if (porRazao[`${upperNoAccents(p.RAZAO_SOCIAL)}|${bairro}`]) { m = porRazao[`${upperNoAccents(p.RAZAO_SOCIAL)}|${bairro}`]; tipo = 'RAZAO_BAIRRO'; }
    else if (porFantasia[`${upperNoAccents(p.NOME_FANTASIA || p.CLIENTE)}|${bairro}`]) { m = porFantasia[`${upperNoAccents(p.NOME_FANTASIA || p.CLIENTE)}|${bairro}`]; tipo = 'FANTASIA_BAIRRO'; }
    if (!m) continue;
    stmts.push(update(db, 'crm_prospects', 'PROSPECT_ID', p.PROSPECT_ID, { CLIENTE_ID_CONVERTIDO: m.id, CLIENTE_NOME_CONVERTIDO: m.nome, TIPO_CONVERSAO: 'AUTO',
      DATA_CONVERSAO: hoje(), MATCH_STATUS: 'MATCH AUTOMATICO ' + tipo, ETAPA_FUNIL: 'CONTRATO', STATUS_PROSPECT: 'CONVERTIDO' }));
  }
  if (stmts.length) { stmts.push(bumpRev(db)); await lote(db, stmts); }
  return { ok: true, converted: stmts.length ? stmts.length - 1 : 0 };
}

/** Busca uma entidade (cliente ou prospect) no formato projetado. */
export async function obterEntidade(db, tipo, id) {
  if (tipo === 'PROSPECT') { const [r] = await carregarProspects(db, { ids: [id] }); return r ? projetarProspect(r) : null; }
  const [c] = await carregarClientes(db, { ids: [id] });
  return c ? projetarCliente(c) : null;
}
/** Grava o "retrato" da tratativa/atividade na entidade (TRATATIVA_ATIVA_ID etc.). */
export async function snapshotEntidade(db, tipo, id, patch, stmts) {
  if (tipo === 'PROSPECT') { const s = update(db, 'crm_prospects', 'PROSPECT_ID', id, patch); if (s) stmts.push(s); return; }
  const cols = Object.keys(patch);
  if (!cols.length) return;
  const agora = nowIso();
  stmts.push(db.prepare(`INSERT INTO crm_cadastro(CLIENTE_ID, ORIGEM, CRIADO_EM, ATUALIZADO_EM, ${cols.join(',')}) VALUES(?, 'ATENDE', ?, ?, ${cols.map(() => '?').join(',')})
    ON CONFLICT(CLIENTE_ID) DO UPDATE SET ${cols.map((c) => `${c}=excluded.${c}`).join(',')}, ATUALIZADO_EM=excluded.ATUALIZADO_EM`)
    .bind(id, agora, agora, ...cols.map((c) => patch[c] ?? '')));
}
