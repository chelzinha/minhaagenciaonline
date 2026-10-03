/* =====================================================
   ETIQUETAS DO CLIENTE (/postar) -> fila do atendente (/balcao)
   - O cliente salva remetente + destinatário + serviço escolhido.
   - Dois modos: COTAR (cotação + etiqueta, preço recalculado no servidor) e ETIQUETA (só os dados, preço no SARA).
   - O servidor revalida tudo e recalcula o preço (não confia no valor do navegador).
   - A etiqueta vale só no dia (fuso de Fortaleza). Dados apagados após 30 dias.
   - Status: PENDENTE -> EM_ATENDIMENTO -> CONCLUIDA | CANCELADA (ou volta para PENDENTE).
   ===================================================== */
import '../../../../frontend/postar/agf-validacao.js';
import { cotar } from '../cotacao.js';
import { buscarCep } from '../cep/cep.js';

const V = globalThis.AgfValidacao;
export const LOCAIS = { AGF: 'AGF José Bonifácio', METRO: 'Shopping Metrô' };
const PREFIXO = { AGF: 'A', METRO: 'M' };
const RETENCAO_DIAS = 30;
/** Serviços que o cliente pode indicar no modo "só etiqueta" (vazio = decidir no balcão). */
const SERVICOS_SEM_COTACAO = { '': 'A definir no balcão', '04014': 'SEDEX à vista', '04510': 'PAC à vista' };
const erro = (msg, status = 422, extra = {}) => { throw Object.assign(new Error(msg), { status, ...extra }); };

/** Data de hoje no fuso de Fortaleza (UTC-3, sem horário de verão). */
export const hojeFortaleza = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

export function normalizarLocal(v) {
  const l = V.textoFinal(v).replace(/[^A-Z]/g, '');
  if (!LOCAIS[l]) erro('Local inválido. Use o QR Code do balcão.');
  return l;
}

async function conferirCep(env, pessoa, rotulo) {
  const r = await buscarCep(env, pessoa.cep).catch(() => erro(rotulo + ': CEP não encontrado.', 422, { campo: rotulo.toLowerCase() + '.cep' }));
  if (r.uf !== pessoa.uf) erro(rotulo + ': a UF não confere com o CEP (' + r.uf + ').', 422, { campo: rotulo.toLowerCase() + '.uf' });
}

async function gerarCodigo(db, local, dia) {
  for (let i = 0; i < 8; i++) {
    const n = 1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000);
    const codigo = PREFIXO[local] + '-' + n;
    const existe = await db.prepare('SELECT 1 FROM balcao_etiquetas WHERE dia=?1 AND codigo=?2').bind(dia, codigo).first();
    if (!existe) return codigo;
  }
  erro('Não foi possível gerar o código. Tente de novo.', 503);
}

/** POST publico: grava a etiqueta digitada pelo cliente. */
export async function salvarEtiquetaCliente(env, p, ipHash) {
  if (p.aceite !== true) erro('Marque a caixa de concordância para salvar.');
  const local = normalizarLocal(p.local);
  const servico = String(p.servico || '').replace(/\D/g, '');
  const rem = V.validarPessoa(p.remetente, 'remetente');
  const dest = V.validarPessoa(p.destinatario, 'destinatario');
  if (!rem.ok || !dest.ok) {
    const campos = {};
    Object.keys(rem.erros).forEach((k) => { campos['remetente.' + k] = rem.erros[k]; });
    Object.keys(dest.erros).forEach((k) => { campos['destinatario.' + k] = dest.erros[k]; });
    erro('Confira os campos destacados.', 422, { campos });
  }
  await Promise.all([conferirCep(env, rem.dados, 'Remetente'), conferirCep(env, dest.dados, 'Destinatario')]);
  const dia = hojeFortaleza();
  const codigo = await gerarCodigo(env.DB, local, dia);
  const id = crypto.randomUUID();
  const gravar = (srv, nome, total, prazo, pesoG, cotacaoResumo) => env.DB.prepare(`INSERT INTO balcao_etiquetas (id, codigo, local, dia, status, servico, servico_nome, total, prazo_dias, peso_g,
      cotacao_json, remetente_json, destinatario_json, ip_hash)
    VALUES (?1, ?2, ?3, ?4, 'PENDENTE', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`)
    .bind(id, codigo, local, dia, srv, nome, total, prazo, pesoG, JSON.stringify(cotacaoResumo), JSON.stringify(rem.dados), JSON.stringify(dest.dados), ipHash || null).run();

  // Modo "só etiqueta": sem cotação. O serviço é opcional (SEDEX, PAC ou decidido no balcão) e o preço sai no SARA.
  if (String(p.modo || '').toUpperCase() === 'ETIQUETA') {
    if (servico && !SERVICOS_SEM_COTACAO[servico]) erro('Serviço inválido.');
    const nome = SERVICOS_SEM_COTACAO[servico || ''];
    await gravar(servico || '', nome, null, null, null, { modo: 'ETIQUETA' });
    return { codigo, local, localNome: LOCAIS[local], modo: 'ETIQUETA', servico: nome, total: null, prazoDias: null };
  }

  // Modo "cotar e gerar": recalcula no servidor com a mesma regra do balcão (preço da tabela à vista, prazo da API).
  const c = p.cotacao || {};
  if (V.digitos(c.cepDestino) !== dest.dados.cep) erro('O CEP do destinatário precisa ser o mesmo da cotação.', 422, { campo: 'destinatario.cep' });
  const cot = await cotar(env, {
    cepOrigem: env.CEP_ORIGEM_PADRAO || '60055974', cepDestino: dest.dados.cep,
    tipoObjeto: ['PACOTE', 'ENVELOPE', 'ROLO'].includes(String(c.tipoObjeto || '').toUpperCase()) ? String(c.tipoObjeto).toUpperCase() : 'PACOTE', pesoG: c.pesoG, alturaCm: c.alturaCm, larguraCm: c.larguraCm, comprimentoCm: c.comprimentoCm,
  }, { exigirDimensoes: false });
  const op = cot.opcoes.find((o) => o.codigoServico === servico);
  if (!op || !op.ok) erro((op && op.erro) || 'Serviço indisponível para este envio.');
  const cotacaoResumo = {
    modo: 'COTAR', tipoObjeto: cot.entrada.tipoObjeto, pesoG: cot.entrada.pesoG, alturaCm: cot.entrada.alturaCm, larguraCm: cot.entrada.larguraCm, comprimentoCm: cot.entrada.comprimentoCm,
    pesoTarifadoG: cot.entrada.pesoTarifadoG, cepDestino: cot.entrada.cepDestino, trecho: cot.trecho, faixa: op.faixa,
  };
  await gravar(op.codigoServico, op.nome, op.total, op.prazoDias || null, Math.round(cot.entrada.pesoG), cotacaoResumo);
  return { codigo, local, localNome: LOCAIS[local], modo: 'COTAR', servico: op.nome, total: op.total, prazoDias: op.prazoDias || null };
}

function linhaParaEtiqueta(r) {
  const j = (s) => { try { return JSON.parse(s || '{}'); } catch (_) { return {}; } };
  return {
    id: r.id, codigo: r.codigo, local: r.local, dia: r.dia, status: r.status,
    servico: r.servico, servicoNome: r.servico_nome, total: r.total, prazoDias: r.prazo_dias, pesoG: r.peso_g,
    cotacao: j(r.cotacao_json), remetente: j(r.remetente_json), destinatario: j(r.destinatario_json),
    sro: r.sro || '', atendente: r.atendente || '', criadaEm: r.criada_em, atualizadaEm: r.atualizada_em || '',
  };
}

/** GET atendente: etiquetas de hoje do local (todas as situações). */
export async function listarEtiquetas(env, localInformado) {
  const local = normalizarLocal(localInformado);
  const { results } = await env.DB.prepare(`SELECT * FROM balcao_etiquetas WHERE local=?1 AND dia=?2
    ORDER BY CASE status WHEN 'PENDENTE' THEN 0 WHEN 'EM_ATENDIMENTO' THEN 1 ELSE 2 END, criada_em LIMIT 300`)
    .bind(local, hojeFortaleza()).all();
  const etiquetas = (results || []).map(linhaParaEtiqueta);
  return { local, localNome: LOCAIS[local], dia: hojeFortaleza(), pendentes: etiquetas.filter((e) => e.status === 'PENDENTE').length, etiquetas };
}

const TRANSICOES = {
  EM_ATENDIMENTO: ['PENDENTE'],
  PENDENTE: ['EM_ATENDIMENTO'],
  CONCLUIDA: ['EM_ATENDIMENTO', 'PENDENTE'],
  CANCELADA: ['EM_ATENDIMENTO', 'PENDENTE'],
};

/** POST atendente: muda a situação. "Atender" só funciona se ninguém assumiu antes. */
export async function mudarStatus(env, usuario, p) {
  const id = String(p.id || '');
  const novo = String(p.status || '').toUpperCase();
  if (!TRANSICOES[novo]) erro('Situação inválida.');
  const sro = V.textoFinal(p.sro).replace(/\s/g, '');
  if (sro && !/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(sro)) erro('Código SRO inválido. Exemplo: AB123456789BR.');
  const quem = String(usuario.displayName || usuario.username || 'atendente').slice(0, 60);
  const de = TRANSICOES[novo];
  const res = await env.DB.prepare(`UPDATE balcao_etiquetas SET status=?1, atendente=?2, sro=COALESCE(NULLIF(?3,''), sro), atualizada_em=datetime('now')
      WHERE id=?4 AND dia=?5 AND status IN (${de.map((_, i) => '?' + (6 + i)).join(',')})`)
    .bind(novo, novo === 'PENDENTE' ? null : quem, sro, id, hojeFortaleza(), ...de).run();
  const atual = await env.DB.prepare('SELECT * FROM balcao_etiquetas WHERE id=?1').bind(id).first();
  if (!atual) erro('Etiqueta não encontrada.', 404);
  if (!res.meta || res.meta.changes === 0) {
    const e = linhaParaEtiqueta(atual);
    if (e.dia !== hojeFortaleza()) erro('Etiqueta de outro dia. Peça ao cliente para gerar de novo.', 409);
    erro(e.status === 'EM_ATENDIMENTO' ? 'Já está em atendimento com ' + (e.atendente || 'outro atendente') + '.' : 'Esta etiqueta já está ' + e.status.toLowerCase().replace('_', ' ') + '.', 409, { etiqueta: e });
  }
  return linhaParaEtiqueta(atual);
}

/** Rotina diária: expira etiquetas de dias anteriores e apaga dados pessoais com mais de 30 dias. */
export async function limpezaDiaria(env) {
  const db = env.DB;
  const r = await db.batch([
    db.prepare(`UPDATE balcao_etiquetas SET status='EXPIRADA', atualizada_em=datetime('now') WHERE dia < ?1 AND status IN ('PENDENTE','EM_ATENDIMENTO')`).bind(hojeFortaleza()),
    db.prepare(`DELETE FROM balcao_etiquetas WHERE criada_em < datetime('now', ?1)`).bind('-' + RETENCAO_DIAS + ' days'),
    db.prepare(`DELETE FROM balcao_rascunhos WHERE criado_em < datetime('now', ?1)`).bind('-' + RETENCAO_DIAS + ' days'),
    db.prepare(`DELETE FROM balcao_limites WHERE expira_em < ?1`).bind(Date.now()),
  ]);
  const n = r.map((x) => (x.meta && x.meta.changes) || 0);
  console.log('[BALCAO][limpeza] expiradas', n[0], '| etiquetas apagadas', n[1], '| rascunhos apagados', n[2], '| limites', n[3]);
  return n;
}
