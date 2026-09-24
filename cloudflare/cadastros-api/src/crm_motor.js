/**
 * Motor do CRM (aba CLIENTES) - porte fiel de apps-script/base-metro/00_CLIENTES_MASTER_FINAL.js
 * (op_buildMasterRows_, op_applyCurva_, op_curveMaxByFloor_, op_calculateAcao_ e auxiliares).
 *
 * Diferencas em relacao ao Apps Script (decididas com a Rachel):
 *  1. Fonte: postagens do Visao 360 (/atende) ja ligadas ao cliente do Cadastro v2, nao a BASE_TOTAL.
 *  2. Curva, share e acao sao calculados DENTRO de cada LOCAL da carteira (AGF, BALCAO, METRO).
 *     Nunca todos os locais juntos.
 *  3. Tipo de negocio vem das colunas INTERMEDIADOR e TIPO do Atende:
 *     VR -> VR | INTERMEDIADOR -> plataforma (marketplace) | PORTAL POSTAL / CONTRATO ECT -> CONTRATO | sem contrato -> BALCAO.
 *  4. Postagem estornada soma o valor (negativo) mas nao conta como objeto nem como dia ativo.
 *  5. REVERSO = servico classificado no Atende com subgrupo "Reverso".
 * Todo o resto (pesos, cortes, pisos, limiares, textos das acoes) e identico.
 */

export const CRM_CFG = Object.freeze({
  RULES: {
    MIN_START: '2025-11-01', ACTIVE_30D: 30, INACTIVE_60D: 60, TREND_UP_PCT: 10, TREND_DOWN_PCT: -10,
    MIN_RECORRENCIA_DIAS_30D: 3, LOW_HISTORY_TOTAL_QTD: 10, LOW_VOLUME_30D_QTD: 5,
    VISITA_MIN_QTD_30D: 10, VISITA_MIN_FAT_30D: 500, VISITA_MIN_SHARE: 0.01, VISITA_MIN_MESES: 3, VISITA_MIN_QTD_TOTAL: 30,
  },
  CURVA: {
    WEIGHTS: { FAT_30D: 0.40, QTD_30D: 0.25, TICKET_30D: 0.20, DIAS_ATIVOS_30D: 0.15 },
    CUTS: { TOP: 0.05, A: 0.25, B: 0.60 },
    FLOORS: {
      TOP: { VALOR_TOTAL: 6000, QTD_TOTAL: 120, FAT_30D: 1200, QTD_30D: 25, DIAS_30D: 4, MESES_TOTAL: 3 },
      A: { VALOR_TOTAL: 1500, QTD_TOTAL: 35, FAT_30D: 200, QTD_30D: 5, DIAS_30D: 2, MESES_TOTAL: 2 },
      B: { VALOR_TOTAL: 250, QTD_TOTAL: 5, FAT_30D: 100, QTD_30D: 3, DIAS_30D: 2, MESES_TOTAL: 1 },
    },
  },
});
export const CRM_MOTOR_VERSAO = 'crm-1.0.0';
export const CRM_LOCAIS = ['AGF', 'BALCAO', 'METRO'];
const R = CRM_CFG.RULES, C = CRM_CFG.CURVA;

// ------------------------------------------------------------ auxiliares (mesma semantica do Apps Script)
const norm = (v) => (v == null ? '' : String(v).trim());
export function upperNoAccents(s) {
  s = norm(s);
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch { /* sem normalize */ }
  return s.toUpperCase();
}
const num = (v) => { if (typeof v === 'number') return isNaN(v) ? 0 : v; const n = Number(norm(v)); return isNaN(n) ? 0 : n; };
const ymdToMs = (iso) => { const m = norm(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
export function addDays(iso, n) { return new Date(ymdToMs(iso) + n * 864e5).toISOString().slice(0, 10); }
export function diffDays(a, b) { return Math.floor((ymdToMs(a) - ymdToMs(b)) / 864e5); }
const sum = (rows, f) => rows.reduce((t, r) => t + num(r[f]), 0);
const uniqueCount = (arr) => new Set(arr.map(norm).filter(Boolean)).size;
const inc = (o, k, v) => { o[k] = (o[k] || 0) + v; };
function topKey(obj) { let bk = '', bv = -1; for (const k of Object.keys(obj || {})) { const v = obj[k] || 0; if (v > bv) { bv = v; bk = k; } } return bk; }
function countLteSorted(a, value) { let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] <= value) lo = mid + 1; else hi = mid; } return lo; }
export function statusAtividade(d) { if (d <= R.ACTIVE_30D) return 'ATIVO_30D'; if (d <= R.INACTIVE_60D - 1) return 'INATIVO_30_59D'; return 'INATIVO_60D_PLUS'; }
export function tendencia(f30, fp) {
  if (fp <= 0 && f30 > 0) return 'CRESCENDO';
  if (fp <= 0) return 'ESTAVEL';
  const pct = ((f30 - fp) / fp) * 100;
  if (pct >= R.TREND_UP_PCT) return 'CRESCENDO';
  if (pct <= R.TREND_DOWN_PCT) return 'CAINDO';
  return 'ESTAVEL';
}
const ORD = { TOP: 4, A: 3, B: 2, C: 1 };
export function compareCurva(p, c) { const a = ORD[p] || 0, b = ORD[c] || 0; return b > a ? 'SUBIU' : b < a ? 'CAIU' : 'MANTEVE'; }
function pctDelta(cur, prev) { if (prev <= 0 && cur > 0) return null; if (prev <= 0) return 0; return ((cur - prev) / prev) * 100; }
export function priorityRank(p) { return ({ CRITICA: 4, ALTA: 3, MEDIA: 2, BAIXA: 1 })[p] || 0; }
const curveRank = (c) => ({ TOP: 4, A: 3, B: 2, C: 1 })[upperNoAccents(c || '')] || 1;
const curveFromPos = (pos) => (pos <= C.CUTS.TOP ? 'TOP' : pos <= C.CUTS.A ? 'A' : pos <= C.CUTS.B ? 'B' : 'C');
const curveClamp = (pre, max) => (curveRank(pre) > curveRank(max) ? max : pre);

// ------------------------------------------------------------ tipo de negocio (colunas do Atende)
/** Uma postagem: intermediador = INTERMEDIADOR do Atende, contratoTipo = TIPO do Atende. */
export function bucketDaPostagem(p) {
  const inter = upperNoAccents(p.intermediador);
  if (inter === 'VR') return 'VR';
  if (inter === 'INTERMEDIADOR') return 'INTERMEDIADOR';
  if (inter || norm(p.contrato) || norm(p.cartao)) return 'CONTRATO';
  return 'BALCAO';
}
export function perfilComercial(m) {
  if (m.BUCKET_NEGOCIO === 'VR' || upperNoAccents(m.INTERMEDIADOR_PREDOMINANTE) === 'VR') return 'VR_INTERNO';
  if (m.BUCKET_NEGOCIO === 'INTERMEDIADOR') return 'INTERMEDIADOR_MARKETPLACE';
  if (m.TEM_CONTRATO === 'SIM') return 'CONTRATO_ECT_DIRETO';
  if (m.BUCKET_NEGOCIO === 'BALCAO') return 'BALCAO_SEM_CONTRATO';
  return 'SEM_CONTRATO_MISTO';
}
const isReversoBaixo = (m) => upperNoAccents(m.TIPO_SERVICO_PREDOMINANTE) === 'REVERSO' && m.QTD_TOTAL < 10 && m.VALOR_TOTAL < 500;

export function curveMaxByFloor(m, label) {
  const ant = label === 'ANTERIOR';
  const fat = num(ant ? m.FAT_31_60D : m.FAT_30D), qtd = num(ant ? m.QTD_31_60D : m.QTD_30D), dias = num(ant ? m.DIAS_ATIVOS_31_60D : m.DIAS_ATIVOS_30D);
  const vTot = num(m.VALOR_TOTAL), qTot = num(m.QTD_TOTAL), meses = num(m.MESES_ATIVOS_TOTAL);
  const { TOP: t, A: a, B: b } = C.FLOORS;
  if ((vTot >= t.VALOR_TOTAL || qTot >= t.QTD_TOTAL) && (fat >= t.FAT_30D || qtd >= t.QTD_30D) && dias >= t.DIAS_30D && meses >= t.MESES_TOTAL) return 'TOP';
  if ((vTot >= a.VALOR_TOTAL || qTot >= a.QTD_TOTAL) && (fat >= a.FAT_30D || qtd >= a.QTD_30D) && dias >= a.DIAS_30D && meses >= a.MESES_TOTAL) return 'A';
  if ((vTot >= b.VALOR_TOTAL || qTot >= b.QTD_TOTAL || fat >= b.FAT_30D || qtd >= b.QTD_30D) && dias >= b.DIAS_30D && meses >= b.MESES_TOTAL) return 'B';
  return 'C';
}
function isAquecendoAgora(m) {
  if (!(num(m.FAT_30D) > 0 || num(m.QTD_30D) > 0)) return false;
  const prevZero = num(m.FAT_31_60D) <= 0 && num(m.QTD_31_60D) <= 0 && num(m.DIAS_ATIVOS_31_60D) <= 0;
  const fd = m.FD_PCT, qd = m.QD_PCT;
  const crescPct = (fd != null && fd >= 40) || (qd != null && qd >= 40);
  const crescAbs = num(m.QTD_30D) >= Math.max(3, num(m.QTD_31_60D) + 2) || num(m.FAT_30D) >= Math.max(100, num(m.FAT_31_60D) * 1.30);
  return prevZero || crescPct || crescAbs || m.MOVIMENTO_CURVA === 'SUBIU';
}
const minimoConversaoBaixa = (m) => num(m.QTD_30D) >= 3 || num(m.FAT_30D) >= 100 || num(m.QTD_TOTAL) >= 8 || num(m.VALOR_TOTAL) >= 250;

/** Curva dentro de UM conjunto de clientes (um LOCAL). Mesmo algoritmo do op_applyCurva_. */
export function aplicarCurva(metrics, label, f) {
  const n = metrics.length || 1;
  const ord = (field) => metrics.map((m) => num(m[field])).sort((x, y) => x - y);
  const fs = ord(f.fatField), qs = ord(f.qtdField), ts = ord(f.ticketField), ds = ord(f.diasField);
  for (const m of metrics) {
    m['SCORE_CURVA_' + label] =
      (countLteSorted(fs, num(m[f.fatField])) / n) * C.WEIGHTS.FAT_30D +
      (countLteSorted(qs, num(m[f.qtdField])) / n) * C.WEIGHTS.QTD_30D +
      (countLteSorted(ts, num(m[f.ticketField])) / n) * C.WEIGHTS.TICKET_30D +
      (countLteSorted(ds, num(m[f.diasField])) / n) * C.WEIGHTS.DIAS_ATIVOS_30D;
  }
  const total = metrics.length || 1;
  metrics.sort((a, b) => b['SCORE_CURVA_' + label] - a['SCORE_CURVA_' + label]);
  metrics.forEach((m, idx) => { m[f.outField] = curveClamp(curveFromPos((idx + 1) / total), curveMaxByFloor(m, label)); });
}

// ------------------------------------------------------------ acao (copia literal das regras)
export function calcularAcao(m) {
  const ativo30 = m.STATUS_ATIVIDADE === 'ATIVO_30D', esfriando = m.STATUS_ATIVIDADE === 'INATIVO_30_59D';
  const inativo30 = m.DIAS_SEM_POSTAR >= 30, inativo60 = m.DIAS_SEM_POSTAR >= 60;
  const isVisitavel = (m.QTD_30D >= R.VISITA_MIN_QTD_30D || m.FAT_30D >= R.VISITA_MIN_FAT_30D || m.SHARE_LOCAL_30D >= R.VISITA_MIN_SHARE) &&
    (m.MESES_ATIVOS_TOTAL >= R.VISITA_MIN_MESES || m.QTD_TOTAL >= R.VISITA_MIN_QTD_TOTAL) && m.PORTE_OPERACIONAL !== 'MICRO';
  const relevanteHist = m.QTD_TOTAL >= 30 || m.VALOR_TOTAL >= 1000 || m.SHARE_LOCAL_30D >= 0.01;
  const relevanteHistMedio = m.QTD_TOTAL >= 8 || m.VALOR_TOTAL >= 250 || m.QTD_30D >= 3 || m.FAT_30D >= 100;
  const recMedia = m.RECORRENCIA_NIVEL === 'MEDIA' || m.RECORRENCIA_NIVEL === 'FORTE', recForte = m.RECORRENCIA_NIVEL === 'FORTE';
  const curvaForte = ['TOP', 'A'].includes(m.CURVA), curvaBoa = ['TOP', 'A', 'B'].includes(m.CURVA);
  const aqueceuAgora = isAquecendoAgora(m);
  const isVR = m.PERFIL_COMERCIAL === 'VR_INTERNO', isMkt = m.PERFIL_COMERCIAL === 'INTERMEDIADOR_MARKETPLACE';
  const isCtr = ['CONTRATO_ECT_DIRETO', 'BALCAO_COM_CONTRATO'].includes(m.PERFIL_COMERCIAL);
  const isBal = m.PERFIL_COMERCIAL === 'BALCAO_SEM_CONTRATO', isMix = m.PERFIL_COMERCIAL === 'SEM_CONTRATO_MISTO';
  const alertaQueda = m.NIVEL_ALERTA === 'QUEDA_REAL' || m.NIVEL_ALERTA === 'QUEDA_PERSISTENTE';
  const tend = upperNoAccents(m.TENDENCIA);
  let r = ['MANTER', 'M1_ESTAVEL_SEM_URGENCIA', 'BAIXA', 30, 'MONITORAR', 'SEM_CONTEUDO', 'Cliente estável sem urgência'];

  if (m.IS_REVERSO_BAIXO === 'SIM' && !isVR) r = ['MANTER', 'M3_PEQUENO_ATIVO', 'BAIXA', 10, 'MONITORAR', 'SEM_CONTEUDO', 'Reverso de baixo volume fora do foco comercial'];
  else if (isVR && (ativo30 || esfriando) && recMedia && relevanteHist && curvaBoa) r = ['CONVERTER', 'C1_VR_ESTRATEGICO', 'CRITICA', 98, 'WHATSAPP_AGENDAR_VISITA', 'APRESENTACAO_CONTRATO_VR', 'VR relevante com recorrência e potencial real de migração'];
  else if (isVR && ativo30 && aqueceuAgora && relevanteHistMedio && minimoConversaoBaixa(m)) r = ['CONVERTER', 'C5_VR_AQUECEU_BAIXA_PRIORIDADE', 'BAIXA', 44, 'WHATSAPP', 'APRESENTACAO_CONTRATO_VR', 'VR pequeno/médio aqueceu agora — vale tentativa leve de conversão'];
  else if (isVR && inativo60) r = ['CANCELAR', 'X1_VR_FRACO', 'BAIXA', 20, 'WHATSAPP', 'ENCERRAMENTO_VR', 'VR inativo sem justificativa para esforço comercial'];
  else if (isVR) r = ['CANCELAR', 'X2_VR_ATIVO_SEM_PESO', 'BAIXA', 18, 'WHATSAPP', 'ENCERRAMENTO_VR_SUAVE', 'VR sem peso suficiente para conversão'];
  else if (inativo30 && isCtr && relevanteHist) r = ['RESGATAR', 'R1_CONTRATO_INATIVO_ESTRATEGICO', inativo60 ? 'CRITICA' : 'ALTA', inativo60 ? 100 : 90, 'WHATSAPP_LIGACAO', 'RESGATE_CONTRATO_INATIVO', 'Contrato inativo ' + m.DIAS_SEM_POSTAR + 'd — estratégico'];
  else if (inativo30 && isMkt && relevanteHist) r = ['RESGATAR', 'R2_INTERMEDIADOR_BOM_ESFRIOU', inativo60 ? 'CRITICA' : 'ALTA', inativo60 ? 95 : 88, 'WHATSAPP_LIGACAO', 'RESGATE_INTERMEDIADOR_BOM', 'Intermediador bom esfriou ' + m.DIAS_SEM_POSTAR + 'd'];
  else if (inativo30 && relevanteHist) r = ['RESGATAR', 'R3_CLIENTE_FORTE_DO_PASSADO', inativo60 ? 'CRITICA' : 'ALTA', inativo60 ? 92 : 84, 'WHATSAPP_LIGACAO', 'RETORNO_CLIENTE_FORTE', 'Cliente forte do passado, inativo ' + m.DIAS_SEM_POSTAR + 'd'];
  else if (inativo30 && relevanteHistMedio) r = ['RESGATAR', 'R4_CLIENTE_MODERADO_ESFRIOU', 'MEDIA', 66, 'WHATSAPP', 'RETORNO_CLIENTE_FORTE', 'Cliente moderado sem postar há ' + m.DIAS_SEM_POSTAR + 'd'];
  else if (isBal && ativo30 && curvaForte && recForte && isVisitavel) r = ['CONVERTER', 'C2_BALCAO_MADURO_VISITA', 'ALTA', 84, 'VISITA', 'COMPARATIVO_POSTAGENS_CONTRATO', 'Balcão maduro para contrato — visita'];
  else if (isBal && ativo30 && recMedia && curvaBoa && relevanteHistMedio) r = ['CONVERTER', 'C3_BALCAO_COMPARATIVO_WHATS', 'BAIXA', 56, 'WHATSAPP', 'COMPARATIVO_WHATS_CONTRATO', 'Balcão com potencial comercial'];
  else if ((isBal || isMix) && ativo30 && recMedia && relevanteHist && !curvaForte) r = ['CONVERTER', 'C4_SEM_CONTRATO_MISTO_DIAGNOSTICO', 'BAIXA', 50, 'WHATSAPP', 'DIAGNOSTICO_SEM_CONTRATO', 'Sem contrato, perfil misto com relevância — diagnóstico'];
  else if ((isBal || isMix) && ativo30 && aqueceuAgora && minimoConversaoBaixa(m)) r = ['CONVERTER', 'C5_AQUECEU_AGORA_BAIXA_PRIORIDADE', 'BAIXA', 42, 'WHATSAPP', 'DIAGNOSTICO_SEM_CONTRATO', 'Cliente começou a aquecer agora — tentativa leve de conversão'];
  else if (isCtr && ativo30 && isVisitavel && alertaQueda) r = ['FIDELIZAR', 'F0_CONTRATO_ESTRATEGICO_CRITICO', 'CRITICA', 96, 'VISITA', 'CHECKLIST_QUEDA_REAL', 'Contrato estratégico ativo em queda — fidelização crítica por visita'];
  else if (isCtr && ativo30 && isVisitavel && curvaForte && recForte && m.NIVEL_ALERTA === 'SAUDAVEL') r = ['FIDELIZAR', 'F0_RELACIONAMENTO_ESTRATEGICO_CRITICO', 'CRITICA', 92, 'VISITA', 'ROTEIRO_RELACIONAMENTO', 'Cliente estratégico saudável — fidelização crítica de presença'];
  else if (m.NOVO_CLIENTE === 'SIM' && !isVR && m.IS_REVERSO_BAIXO !== 'SIM') {
    r = recMedia ? ['FIDELIZAR', 'F4_NOVO_BOM_COMECO', 'BAIXA', 48, 'WHATSAPP', 'BOAS_VINDAS_LEVE', 'Cliente novo com bom começo']
      : ['FIDELIZAR', 'F5_NOVO_CLIENTE', 'BAIXA', 46, 'WHATSAPP', 'BOAS_VINDAS_COMPLETO', 'Novo cliente do mês atual'];
  }
  else if (isMkt && ativo30 && alertaQueda && relevanteHist) r = ['FIDELIZAR', 'F1B_INTERMEDIADOR_MARKETPLACE_EM_ALERTA', 'ALTA', 88, 'WHATSAPP_LIGACAO', 'ABORDAGEM_CONSULTIVA_QUEDA', 'Marketplace forte em alerta'];
  else if (isMkt && ativo30 && m.NIVEL_ALERTA === 'SAUDAVEL' && relevanteHist) r = ['FIDELIZAR', 'F1A_INTERMEDIADOR_MARKETPLACE_SAUDAVEL', 'BAIXA', 54, 'WHATSAPP', 'MANUAL_MARKETPLACE_UTIL', 'Marketplace saudável'];
  else if (isMkt && ativo30) r = ['FIDELIZAR', 'F1C_INTERMEDIADOR_MARKETPLACE_UTILIDADE', 'BAIXA', 50, 'WHATSAPP', 'MANUAL_MARKETPLACE_UTIL', 'Marketplace utilitário — orientação'];
  else if (isCtr && ativo30 && tend === 'CRESCENDO' && recMedia) r = ['FIDELIZAR', 'F2_CONTRATO_CRESCENDO', 'MEDIA', 68, 'WHATSAPP', 'RELACIONAMENTO_CONTRATO', 'Contrato crescendo — manter proximidade'];
  else if (isCtr && ativo30 && (m.NIVEL_ALERTA === 'ALERTA' || alertaQueda) && !isVisitavel) r = ['FIDELIZAR', 'F2B_CONTRATO_PEQUENO_EM_ALERTA', 'MEDIA', 66, 'WHATSAPP', 'ACOMPANHAMENTO_CONTRATO_PEQUENO', 'Contrato pequeno em alerta — acompanhar'];
  else if (ativo30 && recMedia && relevanteHist && m.NIVEL_ALERTA === 'SAUDAVEL') r = ['FIDELIZAR', 'F3_RECORRENTE_SAUDAVEL', 'MEDIA', 64, 'WHATSAPP', 'RELACIONAMENTO_LEVE', 'Cliente recorrente saudável'];
  else if (ativo30 && m.QUEDA_LEVE_SAZONAL === 'SIM') r = ['MANTER', 'M2_QUEDA_LEVE_SAZONAL', 'BAIXA', 28, 'MONITORAR', 'SEM_CONTEUDO', 'Queda leve sazonal — monitorar'];
  else if (ativo30 && m.PORTE_OPERACIONAL === 'MICRO') r = ['MANTER', 'M3_PEQUENO_ATIVO', 'BAIXA', 24, 'MONITORAR', 'SEM_CONTEUDO', 'Pequeno ativo sem urgência'];

  [m.ACAO, m.SUB_ACAO, m.PRIORIDADE_FILA, m.SCORE_PRIORIDADE, m.CANAL_SUGERIDO, m.CONTEUDO_SUGERIDO, m.MOTIVO_REGRA] = r;
}

export function midiaDaSubAcao(key) {
  const k = upperNoAccents(key || '');
  if (k.includes('VR_ESTRATEGICO') || k.includes('VR_AQUECEU')) return 'PDF_CONTRATO';
  if (k.includes('BALCAO_MADURO') || k.includes('COMPARATIVO')) return 'COMPARATIVO_POSTAGENS_CONTRATO';
  if (k.includes('SEM_CONTRATO_MISTO') || k.includes('DIAGNOSTICO') || k.includes('AQUECEU_AGORA')) return 'DIAGNOSTICO_INICIAL';
  if (k.includes('RESGATE') || k.includes('CONTRATO_INATIVO') || k.includes('INTERMEDIADOR_BOM_ESFRIOU') || k.includes('CLIENTE_FORTE_DO_PASSADO')) return 'APRESENTACAO_RESGATE';
  if (k.includes('CONTRATO_ESTRATEGICO_CRITICO') || k.includes('RELACIONAMENTO_ESTRATEGICO_CRITICO')) return 'FOLDER_RELACIONAMENTO';
  if (k.includes('QUEDA') && !k.includes('SAZONAL')) return 'CHECKLIST_VISITA';
  if (k.includes('NOVO_CLIENTE') || k.includes('NOVO_BOM_COMECO')) return 'MANUAL_BOAS_VINDAS';
  if (k.includes('MARKETPLACE')) return 'MANUAL_MARKETPLACE_UTIL';
  if (k.includes('RELACIONAMENTO') || k.includes('RECORRENTE_SAUDAVEL') || k.includes('CONTRATO_CRESCENDO')) return 'FOLDER_RELACIONAMENTO';
  if (k.includes('ENCERRAMENTO') || k.includes('VR_FRACO') || k.includes('VR_ATIVO_SEM')) return '';
  const a = upperNoAccents(key);
  return a === 'CONVERTER' ? 'PDF_CONTRATO' : a === 'RESGATAR' ? 'APRESENTACAO_RESGATE' : a === 'FIDELIZAR' ? 'FOLDER_RELACIONAMENTO' : '';
}

// ------------------------------------------------------------ metricas de um cliente
/**
 * linhas: [{ data:'YYYY-MM-DD', qtd, valor, estorno:0|1, local, intermediador, contratoTipo, subgrupo, contrato, cartao }]
 * (uma linha pode agregar varias postagens iguais do mesmo dia: qtd e valor ja somados)
 */
export function metricasDoCliente(clienteId, linhas, refDate) {
  const recentStart = addDays(refDate, -29), prevStart = addDays(refDate, -59), prevEnd = addDays(refDate, -30);
  const rows = linhas.filter((r) => r.data && r.data >= R.MIN_START && r.data <= refDate).sort((a, b) => a.data.localeCompare(b.data));
  if (!rows.length) return null;
  const firstValidNonRev = (rows.find((r) => !r.estorno && upperNoAccents(r.subgrupo) !== 'REVERSO') || {}).data || '';
  const ativos = rows.filter((r) => !r.estorno);
  const lastDate = (ativos.length ? ativos : rows)[(ativos.length ? ativos : rows).length - 1].data;
  const diasSemPostar = diffDays(refDate, lastDate);
  const localMap = {}, tipoMap = {}, interMap = {}, ctipoMap = {}, bucketMap = {}, contratoMap = {}, cartaoMap = {};
  let qtdTotal = 0, valorTotal = 0; const recent = [], prev = [], diasHist = new Set(), mesesHist = new Set();
  for (const r of rows) {
    const q = r.estorno ? 0 : num(r.qtd), v = num(r.valor), peso = v || 1;
    qtdTotal += q; valorTotal += v;
    if (!r.estorno) { diasHist.add(r.data); mesesHist.add(r.data.slice(0, 7)); }
    inc(localMap, r.local || 'SEM LOCAL', peso);
    inc(tipoMap, norm(r.subgrupo) || 'SEM TIPO', peso);
    inc(interMap, norm(r.intermediador) || 'SEM CONTRATO', peso);
    if (norm(r.contratoTipo)) inc(ctipoMap, norm(r.contratoTipo), peso);
    inc(bucketMap, bucketDaPostagem(r), peso);
    if (norm(r.contrato)) inc(contratoMap, norm(r.contrato), 1);
    if (norm(r.cartao)) inc(cartaoMap, norm(r.cartao), 1);
    const linha = { data: r.data, qtd: q, valor: v, ativo: !r.estorno };
    if (r.data >= recentStart && r.data <= refDate) recent.push(linha);
    if (r.data >= prevStart && r.data <= prevEnd) prev.push(linha);
  }
  const diasDe = (arr) => uniqueCount(arr.filter((x) => x.ativo).map((x) => x.data));
  const fat30 = sum(recent, 'valor'), qtd30 = sum(recent, 'qtd'), dias30 = diasDe(recent);
  const fatPrev = sum(prev, 'valor'), qtdPrev = sum(prev, 'qtd'), diasPrev = diasDe(prev);
  const bucket = topKey(bucketMap) || 'INTERMEDIADOR';
  return {
    CLIENTE_ID: clienteId,
    NUMERO_CONTRATO: topKey(contratoMap), CARTAO_POSTAGEM: topKey(cartaoMap),
    LOCAL_POSTAGEM_PREDOMINANTE: topKey(localMap) || 'SEM LOCAL',
    TIPO_SERVICO_PREDOMINANTE: topKey(tipoMap), INTERMEDIADOR_PREDOMINANTE: topKey(interMap), TIPO_CONTRATO_PREDOMINANTE: topKey(ctipoMap),
    BUCKET_NEGOCIO: bucket, TEM_CONTRATO: bucket === 'CONTRATO' ? 'SIM' : 'NAO',
    DATA_PRIMEIRA_POSTAGEM: rows[0].data, DATA_PRIMEIRA_VALIDA_NAO_REVERSO: firstValidNonRev, DATA_ULTIMA_POSTAGEM: lastDate,
    DIAS_SEM_POSTAR: diasSemPostar, STATUS_ATIVIDADE: statusAtividade(diasSemPostar),
    FAT_30D: fat30, QTD_30D: qtd30, DIAS_ATIVOS_30D: dias30, TICKET_30D: qtd30 > 0 ? fat30 / qtd30 : 0,
    FAT_31_60D: fatPrev, QTD_31_60D: qtdPrev, DIAS_ATIVOS_31_60D: diasPrev, TICKET_31_60D: qtdPrev > 0 ? fatPrev / qtdPrev : 0,
    TENDENCIA: tendencia(fat30, fatPrev), QTD_TOTAL: qtdTotal, VALOR_TOTAL: valorTotal,
    DIAS_ATIVOS_TOTAL: diasHist.size, MESES_ATIVOS_TOTAL: mesesHist.size,
    RECORRENTE_30D: dias30 >= R.MIN_RECORRENCIA_DIAS_30D ? 'SIM' : 'NAO',
    RECORRENCIA_NIVEL: dias30 >= 4 ? 'FORTE' : dias30 >= 3 ? 'MEDIA' : dias30 >= 1 ? 'PONTUAL' : 'SEM_BASE',
    FD_PCT: pctDelta(fat30, fatPrev), QD_PCT: pctDelta(qtd30, qtdPrev), DD_PCT: pctDelta(dias30, diasPrev),
  };
}

/** Pos-processamento de um LOCAL: curva, share, alertas, perfil e acao. Mesmo fluxo do op_buildMasterRows_. */
export function fecharLocal(metrics, refDate) {
  const selYm = refDate.slice(0, 7);
  aplicarCurva(metrics, 'ATUAL', { fatField: 'FAT_30D', qtdField: 'QTD_30D', ticketField: 'TICKET_30D', diasField: 'DIAS_ATIVOS_30D', outField: 'CURVA' });
  aplicarCurva(metrics, 'ANTERIOR', { fatField: 'FAT_31_60D', qtdField: 'QTD_31_60D', ticketField: 'TICKET_31_60D', diasField: 'DIAS_ATIVOS_31_60D', outField: 'CURVA_ANTERIOR' });
  const totalLocal30 = metrics.reduce((t, m) => t + m.FAT_30D, 0);
  for (const m of metrics) {
    m.MOVIMENTO_CURVA = compareCurva(m.CURVA_ANTERIOR, m.CURVA);
    m.SHARE_LOCAL_30D = totalLocal30 > 0 ? m.FAT_30D / totalLocal30 : 0;
    m.PORTE_OPERACIONAL = (m.QTD_30D >= 30 || m.FAT_30D >= 1500) ? 'GRANDE' : ((m.QTD_30D >= 10 || m.FAT_30D >= 500) ? 'MEDIO' : 'MICRO');
    m.QUEDA_REAL = (m.FD_PCT <= -25) && (m.DD_PCT <= -20 || m.QD_PCT <= -20) ? 'SIM' : 'NAO';
    m.QUEDA_LEVE_SAZONAL = (m.FD_PCT < 0 && m.FD_PCT > -25 && (m.DD_PCT > -20 || m.DD_PCT === 0) && (m.QD_PCT > -20 || m.QD_PCT === 0)) ? 'SIM' : 'NAO';
    const quedaPersist = m.QUEDA_REAL === 'SIM' && upperNoAccents(m.TENDENCIA) === 'CAINDO' && m.MOVIMENTO_CURVA === 'CAIU';
    m.NIVEL_ALERTA = quedaPersist ? 'QUEDA_PERSISTENTE' : (m.QUEDA_REAL === 'SIM' ? 'QUEDA_REAL' : (upperNoAccents(m.TENDENCIA) === 'CAINDO' ? 'ALERTA' : 'SAUDAVEL'));
    m.PERFIL_COMERCIAL = perfilComercial(m);
    if (m.PERFIL_COMERCIAL === 'VR_INTERNO') m.TEM_CONTRATO = 'NAO';
    m.IS_REVERSO_BAIXO = isReversoBaixo(m) ? 'SIM' : 'NAO';
    m.NOVO_CLIENTE = (m.DATA_PRIMEIRA_VALIDA_NAO_REVERSO && m.DATA_PRIMEIRA_VALIDA_NAO_REVERSO.slice(0, 7) === selYm) ? 'SIM' : 'NAO';
    m.INATIVO_30D = m.DIAS_SEM_POSTAR >= 30 ? 'SIM' : 'NAO';
    m.INATIVO_60D = m.DIAS_SEM_POSTAR >= 60 ? 'SIM' : 'NAO';
  }
  for (const m of metrics) { calcularAcao(m); m.MIDIA = midiaDaSubAcao(m.SUB_ACAO || m.ACAO) || ''; }
  return metrics;
}

/**
 * Motor completo. clientes: Map(id -> { nome, local }) ; linhasPorCliente: Map(id -> linhas).
 * Retorna { refDate, porLocal: {AGF:n,...}, metricas: [...] } com a curva calculada DENTRO de cada LOCAL.
 * Cliente sem LOCAL da carteira (empate exato) fica no grupo SEM_LOCAL, que tambem tem curva propria.
 */
export function executarCrm(clientes, linhasPorCliente, refDateForcada) {
  let refDate = refDateForcada || '';
  if (!refDate) for (const ls of linhasPorCliente.values()) for (const l of ls) if (!l.estorno && l.data > refDate) refDate = l.data;
  if (!refDate) return { refDate: '', porLocal: {}, metricas: [] };
  const grupos = new Map();
  for (const [id, linhas] of linhasPorCliente) {
    const c = clientes.get(id);
    if (!c) continue;
    const m = metricasDoCliente(id, linhas, refDate);
    if (!m) continue;
    m.CLIENTE = c.nome; m.LOCAL = c.local || 'SEM_LOCAL';
    if (!grupos.has(m.LOCAL)) grupos.set(m.LOCAL, []);
    grupos.get(m.LOCAL).push(m);
  }
  const metricas = [], porLocal = {};
  for (const [local, ms] of grupos) { fecharLocal(ms, refDate); porLocal[local] = ms.length; metricas.push(...ms); }
  metricas.sort((a, b) => (priorityRank(b.PRIORIDADE_FILA) - priorityRank(a.PRIORIDADE_FILA)) || ((b.SCORE_PRIORIDADE || 0) - (a.SCORE_PRIORIDADE || 0)) ||
    ((b.SHARE_LOCAL_30D || 0) - (a.SHARE_LOCAL_30D || 0)) || String(a.CLIENTE || '').localeCompare(String(b.CLIENTE || ''), 'pt-BR'));
  return { refDate, porLocal, metricas };
}
