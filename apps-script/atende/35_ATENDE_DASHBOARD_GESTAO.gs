// ============================================================
// ATENDE - DASHBOARD GERENCIAL V2
// Endpoint Apps Script separado para evitar alterar o proxy legado.
// ============================================================

function ATENDE_buscarDashboardGestaoD1(params) {
  params = params || {};
  const query = ['view=dashboard'];
  ATENDE_adicionarContextoFiltroQuery_(query, params);
  const startedAt = Date.now();
  const response = ATENDE_fetchD1_('/atende?' + query.join('&'), { method: 'get' });

  return {
    ok: response && response.ok !== false,
    kpis: response.kpis || { postagens:0, faturamento:0, valorMedio:0, estornos:0, valorEstornos:0 },
    granularidade: String(response.granularidade || 'mes'),
    evolucao: response.evolucao || [],
    tipoServico: response.tipoServico || [],
    tabela: response.tabela || [],
    subgrupo: response.subgrupo || [],
    servicos: response.servicos || [],
    local: response.local || [],
    atendentes: response.atendentes || [],
    atendentesDesempenho: response.atendentesDesempenho || [],
    intermediadores: response.intermediadores || [],
    tiposContrato: response.tiposContrato || [],
    clientesPortal: response.clientesPortal || [],
    razoesSociais: response.razoesSociais || [],
    gestao: response.gestao || {
      clientesPortalAtivos:0,
      vinculadasPortal:0,
      semClientePortal:0,
      coberturaPortal:0,
      diasAtivos:0,
      mediaDiariaFaturamento:0,
      mediaDiariaPostagens:0
    },
    comparacao: response.comparacao || { disponivel:false },
    gestaoErro: String(response.gestaoErro || ''),
    meta: { tempoMs: Date.now() - startedAt }
  };
}
