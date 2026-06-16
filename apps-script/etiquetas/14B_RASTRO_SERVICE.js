/**
 * APP ETIQUETAS AGF — 14B_RASTRO_SERVICE.gs
 * Normalização do retorno da API Rastro.
 */

function action_rastrearObjeto_(params) {
  const client = getFullClientFromSession_(params.sessionToken);
  const codigo = upper_(sanitize_(params.codigoObjeto)).replace(/\s+/g, '');
  if (!codigo) throw new Error('codigoObjeto obrigatório.');
  if (!/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(codigo)) {
    throw new Error('Código de rastreio inválido. Use o formato AA000000000BR.');
  }

  const raw = cwsRastroConsultarObjeto_(client, codigo, { resultado: 'T' });
  const norm = normalizeRastroResponse_(raw, codigo);
  if (!norm || !norm.codigoObjeto) {
    throw new Error('Não foi possível interpretar a resposta do rastreio para este objeto.');
  }
  return norm;
}

function normalizeRastroResponse_(raw, fallbackCodigo) {
  const root = raw || {};
  const lista = Array.isArray(root.objetos) ? root.objetos : (Array.isArray(root.objeto) ? root.objeto : []);
  const obj = lista.length ? lista[0] : root;
  const eventosRaw = Array.isArray(obj.eventos) ? obj.eventos : (Array.isArray(obj.evento) ? obj.evento : []);

  const eventos = eventosRaw.map(normalizeRastroEvento_).filter(Boolean);
  eventos.sort(function (a, b) {
    return sanitize_(b.dataHoraIso).localeCompare(sanitize_(a.dataHoraIso));
  });

  const atual = eventos[0] || null;
  const codigoObjeto = sanitize_(obj.codObjeto || obj.codigoObjeto || fallbackCodigo);
  const statusLabel = atual ? atual.descricao : sanitize_(obj.descricao || 'Sem atualização');
  const statusClass = inferRastroStatusClass_(statusLabel);
  const localAtual = atual ? joinCidadeUf_(atual.cidade, atual.uf) : '';

  return {
    codigoObjeto: codigoObjeto,
    statusLabel: statusLabel || 'Sem atualização',
    statusClass: statusClass,
    ultimaAtualizacao: atual ? atual.dataHora : '',
    ultimaAtualizacaoIso: atual ? atual.dataHoraIso : '',
    localAtual: localAtual,
    eventos: eventos,
    bruto: raw
  };
}

function normalizeRastroEvento_(ev) {
  if (!ev || typeof ev !== 'object') return null;

  const unidade = ev.unidade || {};
  const end = unidade.endereco || {};
  const unidadeDestino = ev.unidadeDestino || {};
  const endDest = unidadeDestino.endereco || {};
  const dataIso = sanitize_(ev.dtHrCriado || ev.dataHora || '');

  return {
    codigo: sanitize_(ev.codigo),
    tipo: sanitize_(ev.tipo),
    descricao: sanitize_(ev.descricao),
    detalhe: sanitize_(ev.detalhe),
    dataHoraIso: dataIso,
    dataHora: formatRastroDataHora_(dataIso),
    unidadeTipo: sanitize_(unidade.tipo),
    cidade: sanitize_(end.cidade),
    uf: sanitize_(end.uf),
    unidadeDestinoTipo: sanitize_(unidadeDestino.tipo),
    unidadeDestinoCidade: sanitize_(endDest.cidade),
    unidadeDestinoUf: sanitize_(endDest.uf)
  };
}

function formatRastroDataHora_(iso) {
  const s = sanitize_(iso);
  if (!s) return '';
  var d = parseExpiraEm_(s);
  if (!d) {
    try { d = new Date(s); } catch (e) { d = null; }
  }
  if (!d || isNaN(d.getTime())) return s;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function inferRastroStatusClass_(label) {
  const txt = lower_(label);
  if (!txt) return 'is-info';
  if (/entreg|dispon[ií]vel.*retirada|objeto entregue ao destinat[aá]rio/.test(txt)) return 'is-ok';
  if (/devolu|devolvido|devolu[cç][aã]o|tentativa de entrega n[aã]o efetuada|aguardando retirada/.test(txt)) return 'is-warn';
  if (/extravi|roubo|danific|sinistro|nao localizado/.test(txt)) return 'is-err';
  return 'is-info';
}

function joinCidadeUf_(cidade, uf) {
  const c = sanitize_(cidade);
  const u = sanitize_(uf);
  if (c && u) return c + '/' + u;
  return c || u || '';
}

/**
 * AÇÃO PÚBLICA: rastrearPublico
 * Usada pela página /rastreio enviada por WhatsApp.
 * Localiza a etiqueta pelo SRO e consulta o Correios com as credenciais
 * do cliente proprietário sem expor login, token ou dados internos.
 */
function action_rastrearPublico_(params) {
  const codigo = upper_(sanitize_(params.codigoObjeto || params.objeto)).replace(/\s+/g, '');
  if (!codigo) throw new Error('codigoObjeto obrigatório.');
  if (!/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(codigo)) {
    throw new Error('Código de rastreio inválido. Use o formato AA000000000BR.');
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'RASTRO_PUBLICO_' + codigo;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  ensureHistoricoHeaders_();
  const rows = readSheetAsObjects_(CFG.SHEETS.HIST)
    .filter(r => upper_(r.CODIGO_OBJETO).replace(/\s+/g, '') === codigo)
    .sort((a, b) => sanitize_(b.DATA_HORA).localeCompare(sanitize_(a.DATA_HORA)));
  const hist = rows[0];
  if (!hist) throw new Error('Objeto não encontrado no histórico de postagens.');

  const client = findClientByLogin_(hist.LOGIN_APP);
  if (!client) throw new Error('Não foi possível consultar este objeto agora.');

  const raw = cwsRastroConsultarObjeto_(client, codigo, { resultado: 'T' });
  const norm = normalizeRastroResponse_(raw, codigo);
  if (!norm || !norm.codigoObjeto) throw new Error('Não foi possível interpretar o rastreio deste objeto.');

  // Página pública recebe somente dados operacionais necessários ao rastreio.
  const safe = {
    codigoObjeto: norm.codigoObjeto,
    statusLabel: norm.statusLabel,
    statusClass: norm.statusClass,
    ultimaAtualizacao: norm.ultimaAtualizacao,
    ultimaAtualizacaoIso: norm.ultimaAtualizacaoIso,
    localAtual: norm.localAtual,
    eventos: norm.eventos || []
  };
  cache.put(cacheKey, JSON.stringify(safe), 120);
  return safe;
}
