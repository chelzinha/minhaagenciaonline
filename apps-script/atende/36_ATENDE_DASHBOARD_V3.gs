// ============================================================
// ATENDE - DASHBOARD GERENCIAL V3/V6
// Proxy dos agregados do Worker para o front.
// ============================================================

function ATENDE_buscarDashboardGestaoV3D1(params) {
  params = params || {};
  const query = ['view=dashboard'];
  ATENDE_adicionarContextoFiltroQuery_(query, params);
  const startedAt = Date.now();
  const response = ATENDE_fetchD1V6Test_('/atende?' + query.join('&'), { method: 'get' });

  return {
    ok: response && response.ok !== false,
    versaoDashboard: String(response.versaoDashboard || 'gestao-v6'),
    kpis: response.kpis || { postagens:0, faturamento:0, valorMedio:0, estornos:0, valorEstornos:0 },
    granularidade: String(response.granularidade || 'mes'),
    evolucao: response.evolucao || [],
    evolucao6Meses: response.evolucao6Meses || [],
    tipoServico: response.tipoServico || [],
    tabela: response.tabela || [],
    subgrupo: response.subgrupo || [],
    servicos: response.servicos || [],
    local: response.local || [],
    localGlobal: response.localGlobal || response.local || [],
    atendentes: response.atendentes || [],
    atendentesDesempenho: response.atendentesDesempenho || [],
    intermediadores: response.intermediadores || [],
    canais: response.canais || response.intermediadores || [],
    tiposContrato: response.tiposContrato || [],
    clientesPortal: response.clientesPortal || [],
    razoesSociais: response.razoesSociais || [],
    linhaRemuneracao: response.linhaRemuneracao || [],
    oportunidadeEmbalagem: response.oportunidadeEmbalagem || {
      encomendas:0, encomendasBalcao:0, embalagens:0, taxaAtual:0, umaACada:0,
      meta10:{taxa:10,adicionais:0,ganhoEstimado:0},
      meta20:{taxa:20,adicionais:0,ganhoEstimado:0},
      retornoMedioUnitario:3.78
    },
    remuneracao: response.remuneracao || {},
    metas: response.metas || { disponivel:false, competencia:'' },
    projecaoReceita: response.projecaoReceita || { disponivel:false, grupos:{}, locais:{} },
    taxaEfetiva: response.taxaEfetiva || { serie:[], atual:null },
    saudeDado: response.saudeDado || { status:'amarelo', verificacoes:[] },
    decomposicao: response.decomposicao || { disponivel:false },
    diario: response.diario || { dias:[] },
    banda: response.banda || { disponivel:false },
    captacao: response.captacao || { origem:[], destino:[], cobertura:0 },
    baseRecorrente: response.baseRecorrente || { disponivel:false },
    quedaClientes: response.quedaClientes || { disponivel:false, clientes:[] },
    radarR5: response.radarR5 || { disponivel:false, clientes:[] },
    riscoConcentracao: response.riscoConcentracao || {},
    dashboardV6Meta: response.dashboardV6Meta || {},
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
    dashboardV3Erro: String(response.dashboardV3Erro || ''),
    dashboardV6Erro: String(response.dashboardV6Erro || ''),
    meta: { tempoMs: Date.now() - startedAt }
  };
}

function ATENDE_adminBuscarMetasDashboard(platformToken, competencia) {
  const mes = String(competencia || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Competência inválida. Use AAAA-MM.');
  return ATENDE_adminGetV6Test_(platformToken, '/admin/dashboard-targets?competencia=' + encodeURIComponent(mes));
}

function ATENDE_adminSalvarMetasDashboard(platformToken, payload) {
  return ATENDE_adminPostV6Test_(platformToken, '/admin/dashboard-targets', payload || {});
}
