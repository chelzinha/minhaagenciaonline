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
  const previsaoIso = sanitize_(obj.dtPrevista || obj.dataPrevista || obj.previsaoEntrega || '');

  return {
    codigoObjeto: codigoObjeto,
    statusLabel: statusLabel || 'Sem atualização',
    statusClass: statusClass,
    previsao: formatRastroDataHora_(previsaoIso),
    previsaoIso: previsaoIso,
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

function painelClienteDataMs_(value) {
  if (value instanceof Date) return value.getTime();
  const s = sanitize_(value);
  if (!s) return 0;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])).getTime();
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function painelClienteRastroSeguro_(norm) {
  return {
    codigoObjeto: sanitize_(norm && norm.codigoObjeto),
    situacao: sanitize_(norm && norm.statusLabel),
    previsao: sanitize_(norm && (norm.previsao || norm.previsaoIso)),
    dataSituacao: sanitize_(norm && (norm.ultimaAtualizacao || norm.ultimaAtualizacaoIso))
  };
}

function painelClienteCacheKey_(codigo) {
  return 'PAINEL_RASTRO_' + upper_(sanitize_(codigo)).replace(/\s+/g, '');
}

function painelClienteGetRastros_(client, codigos) {
  const cache = CacheService.getScriptCache();
  const keys = codigos.map(painelClienteCacheKey_);
  const cached = keys.length ? cache.getAll(keys) : {};
  const rastros = {};
  const faltantes = [];

  codigos.forEach(function (codigo, i) {
    const hit = cached[keys[i]];
    if (hit) {
      try {
        rastros[codigo] = JSON.parse(hit);
        return;
      } catch (e) {}
    }
    faltantes.push(codigo);
  });

  if (faltantes.length) {
    const consultados = cwsRastroConsultarObjetosEmLote_(client, faltantes, { resultado: 'T' });
    const cacheOk = {};
    const cacheFalha = {};

    consultados.forEach(function (item) {
      const codigo = item.codigoObjeto;
      if (item.ok) {
        const safe = painelClienteRastroSeguro_(normalizeRastroResponse_(item.raw, codigo));
        rastros[codigo] = safe;
        cacheOk[painelClienteCacheKey_(codigo)] = JSON.stringify(safe);
      } else {
        const safe = { codigoObjeto: codigo, situacao: '', previsao: '', dataSituacao: '' };
        rastros[codigo] = safe;
        cacheFalha[painelClienteCacheKey_(codigo)] = JSON.stringify(safe);
      }
    });

    if (Object.keys(cacheOk).length) cache.putAll(cacheOk, 900);
    if (Object.keys(cacheFalha).length) cache.putAll(cacheFalha, 120);
  }

  return rastros;
}

/**
 * ACAO: painelCliente
 * Retorna somente postagens concluidas pertencentes ao cliente da sessao.
 * dias aceitos: 30, 60, 90 ou 0 (todo o historico carregado pelo backend).
 */
function action_painelCliente_(params) {
  ensureHistoricoHeaders_();
  const sessionClient = getSessionClient_(params.sessionToken);
  const client = getFullClientFromSession_(params.sessionToken);
  const diasInformados = Number(params.dias);
  const dias = [0, 30, 60, 90].indexOf(diasInformados) >= 0 ? diasInformados : 60;
  const limiteHistorico = dias === 0 ? 10000 : 3000;
  const corteMs = dias ? Date.now() - dias * 86400000 : 0;
  const vistos = {};

  const registros = readSheetTailAsObjects_(CFG.SHEETS.HIST, limiteHistorico)
    .filter(function (r) {
      if (sanitize_(r.LOGIN_APP) !== sessionClient.LOGIN_APP) return false;
      if (upper_(r.STATUS) !== 'CONCLUIDO') return false;
      const codigo = upper_(sanitize_(r.CODIGO_OBJETO)).replace(/\s+/g, '');
      if (!/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(codigo)) return false;
      const dataMs = painelClienteDataMs_(r.DATA_HORA);
      return !corteMs || (dataMs && dataMs >= corteMs);
    })
    .sort(function (a, b) {
      return painelClienteDataMs_(b.DATA_HORA) - painelClienteDataMs_(a.DATA_HORA);
    })
    .filter(function (r) {
      const codigo = upper_(sanitize_(r.CODIGO_OBJETO)).replace(/\s+/g, '');
      if (vistos[codigo]) return false;
      vistos[codigo] = true;
      return true;
    });

  const codigos = registros.map(function (r) {
    return upper_(sanitize_(r.CODIGO_OBJETO)).replace(/\s+/g, '');
  });
  const rastros = painelClienteGetRastros_(client, codigos);

  return {
    dias: dias,
    total: registros.length,
    linhas: registros.map(function (r) {
      const codigo = upper_(sanitize_(r.CODIGO_OBJETO)).replace(/\s+/g, '');
      const rastreio = rastros[codigo] || {};
      return {
        objeto: codigo,
        servico: upper_(r.SERVICO),
        cidade: sanitize_(r.DEST_CIDADE),
        uf: upper_(r.DEST_UF),
        valor: historicoMoneyNumber_(r.PRECO_COTADO),
        postagem: sanitize_(r.DATA_HORA),
        previsao: sanitize_(rastreio.previsao),
        dataSituacao: sanitize_(rastreio.dataSituacao),
        situacao: sanitize_(rastreio.situacao)
      };
    })
  };
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
