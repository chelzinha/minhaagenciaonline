/* =====================================================
   CAMINHO 1 - PRECO (tabela a vista do balcao)
   - Fonte unica: tabelas balcao_* do D1, carregadas a partir da pasta
     FONTE_D1_BALCAO_A_VISTA (PAC 04510 e SEDEX 04014 a vista, origem CE).
   - NAO acessa a internet. NAO usa credencial dos Correios.
   - NAO importa nada de ../prazo, ../correios ou ../cep.
   - Validado contra postagens reais a vista do Atende (ago-set/2026).
   ===================================================== */

export const PRECO_VERSAO = 'preco-avista-2026.10.03';
const FAIXAS_G = [300, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const BASE_TTL_MS = 10 * 60 * 1000;
let baseMem = null;          // { base, ate }

// ---------------------------------------------------------------- helpers
const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export function normalizarMunicipio(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

const UF_POR_CEP = [
  ['SP', 1000, 19999], ['RJ', 20000, 28999], ['ES', 29000, 29999], ['MG', 30000, 39999],
  ['BA', 40000, 48999], ['SE', 49000, 49999], ['PE', 50000, 56999], ['AL', 57000, 57999],
  ['PB', 58000, 58999], ['RN', 59000, 59999], ['CE', 60000, 63999], ['PI', 64000, 64999],
  ['MA', 65000, 65999], ['PA', 66000, 68899], ['AP', 68900, 68999], ['AM', 69000, 69299],
  ['RR', 69300, 69399], ['AM', 69400, 69899], ['AC', 69900, 69999], ['DF', 70000, 72799],
  ['GO', 72800, 72999], ['DF', 73000, 73699], ['GO', 73700, 76799], ['RO', 76800, 76999],
  ['TO', 77000, 77999], ['MT', 78000, 78899], ['MS', 79000, 79999], ['PR', 80000, 87999],
  ['SC', 88000, 89999], ['RS', 90000, 99999]
];

/** UF pela faixa de CEP (usada para conferir a UF devolvida pela busca de CEP). */
export function ufPorCep(cep) {
  const c5 = Number(String(cep || '').replace(/\D/g, '').slice(0, 5));
  const f = UF_POR_CEP.find(([, a, b]) => c5 >= a && c5 <= b);
  return f ? f[0] : '';
}

// ---------------------------------------------------------------- base (D1)
/** Monta indices em memoria a partir das linhas das tabelas. Funcao pura (usada tambem nos testes). */
export function montarBase({ servicos, tarifas, colunaUf, localidades, adicionais, vigencia }) {
  const tar = new Map();
  for (const t of tarifas) tar.set([t.servico, t.escala, t.coluna, t.tipo, Number(t.peso_max_g)].join('|'), Number(t.preco));
  const col = new Map(colunaUf.map((r) => [r.uf_origem + '|' + r.uf_destino, r.coluna]));
  const loc = new Map(localidades.map((r) => [r.uf + '|' + r.municipio_norm, r]));
  const ad = {};
  for (const a of adicionais) ad[a.chave] = Number(a.valor);
  const srv = servicos.filter((s) => Number(s.ativo) === 1).sort((a, b) => Number(a.ordem) - Number(b.ordem));
  return { servicos: srv, tar, col, loc, ad, vigencia: vigencia || (srv[0] && srv[0].vigencia) || '' };
}

/** Le as tabelas do D1 (cache de 10 min por isolate). */
export async function carregarBase(db) {
  const agora = Date.now();
  if (baseMem && baseMem.ate > agora) return baseMem.base;
  const [s, t, c, l, a] = await db.batch([
    db.prepare('SELECT codigo, chave, nome, ativo, limite_peso_g, vd_max, ordem, vigencia FROM balcao_servicos'),
    db.prepare('SELECT servico, escala, coluna, tipo, peso_max_g, preco FROM balcao_tarifas'),
    db.prepare('SELECT uf_origem, uf_destino, coluna FROM balcao_coluna_uf'),
    db.prepare('SELECT uf, municipio_norm, municipio, classe_avista, trecho_especial FROM balcao_localidades'),
    db.prepare('SELECT chave, valor FROM balcao_adicionais'),
  ]);
  const base = montarBase({ servicos: s.results, tarifas: t.results, colunaUf: c.results, localidades: l.results, adicionais: a.results });
  if (!base.servicos.length || base.tar.size === 0) throw Object.assign(new Error('Tabelas de preco nao carregadas no D1.'), { status: 503 });
  baseMem = { base, ate: agora + BASE_TTL_MS };
  return base;
}

// ---------------------------------------------------------------- regras
/** Peso tarifado em gramas: maior entre real e cubico (cubico ate 5 kg e ignorado). */
export function calcularPeso({ pesoG, alturaCm, larguraCm, comprimentoCm }, ad) {
  const real = Math.ceil(Number(pesoG) || 0);
  const vol = (Number(alturaCm) || 0) * (Number(larguraCm) || 0) * (Number(comprimentoCm) || 0);
  const cubicoKg = vol > 0 ? vol / (ad.CUBAGEM_DIVISOR || 6000) : 0;
  const isento = cubicoKg <= (ad.CUBAGEM_ISENCAO_KG || 5);
  const cubicoG = isento ? 0 : Math.ceil(cubicoKg) * 1000;
  return { pesoRealG: real, pesoCubicoKg: r2(cubicoKg), cubagemAplicada: !isento && cubicoG > real, pesoTarifadoG: Math.max(real, cubicoG) };
}

/** Origem precisa estar na Regiao Metropolitana de Fortaleza (tabela carregada so para essa origem). */
export function origemAtendida(base, origem) {
  const lo = base.loc.get(origem.uf + '|' + normalizarMunicipio(origem.municipio));
  return !!(lo && lo.trecho_especial === 'LOCAL');
}

/** Coluna (LOCAL, ESTADUAL, F1..F6) e escala (CAPITAL ou INTERIOR) do trecho. */
export function classificarTrecho(base, origem, destino) {
  const locO = base.loc.get(origem.uf + '|' + normalizarMunicipio(origem.municipio));
  const locD = base.loc.get(destino.uf + '|' + normalizarMunicipio(destino.municipio));
  let coluna, motivo;
  if (locO && locO.trecho_especial === 'LOCAL' && locD && locD.trecho_especial === 'LOCAL') {
    coluna = 'LOCAL'; motivo = 'Local (Região Metropolitana de Fortaleza)';
  } else if (locD && locD.trecho_especial === 'DIVISA') {
    coluna = 'ESTADUAL'; motivo = 'Divisa (cobrado como estadual)';
  } else {
    coluna = base.col.get(origem.uf + '|' + destino.uf);
    motivo = coluna === 'ESTADUAL' ? 'Estadual' : 'Nacional ' + coluna;
  }
  if (!coluna) throw Object.assign(new Error('Sem coluna de preço para ' + origem.uf + ' → ' + destino.uf + '.'), { status: 422 });
  const escala = (locO && locO.classe_avista === 'CAPITAL') && (locD && locD.classe_avista === 'CAPITAL') ? 'CAPITAL' : 'INTERIOR';
  return { coluna, escala, motivo, destinoCapital: escala === 'CAPITAL' };
}

function precoDaFaixa(base, servico, escala, coluna, pesoG) {
  const k = (tipo, p) => base.tar.get([servico, escala, coluna, tipo, p].join('|'));
  const p = Math.max(1, pesoG);
  for (const f of FAIXAS_G) {
    if (p <= f) {
      const v = k('FAIXA', f);
      if (v == null) throw new Error('Tarifa ausente: ' + [servico, escala, coluna, f].join(' / '));
      return { preco: v, faixa: f === 300 ? 'até 300 g' : 'até ' + (f >= 1000 ? f / 1000 + ' kg' : f + ' g') };
    }
  }
  const v10 = k('FAIXA', 10000), kg = k('KG_ADICIONAL', 10000);
  if (v10 == null || kg == null) throw new Error('Tarifa de kg adicional ausente.');
  const extras = Math.ceil((p - 10000) / 1000);
  return { preco: r2(v10 + extras * kg), faixa: '10 kg + ' + extras + ' kg adicional' };
}

/**
 * Preco de todos os servicos ativos para um trecho ja classificado.
 * entrada: { pesoG, alturaCm, larguraCm, comprimentoCm, tipoObjeto, valorDeclarado, ar:boolean, maoPropria:boolean }
 */
export function calcularPrecos(base, entrada, trecho) {
  const ad = base.ad;
  const peso = calcularPeso(entrada, ad);
  if (peso.pesoRealG <= 0) throw Object.assign(new Error('Informe o peso em gramas.'), { status: 422 });
  const dims = [entrada.alturaCm, entrada.larguraCm, entrada.comprimentoCm].map(Number).filter((v) => v > 0);
  const manuseio = String(entrada.tipoObjeto || '').toUpperCase() === 'ROLO' || dims.some((d) => d > (ad.DIMENSAO_ESPECIAL_CM || 70));
  const vd = Math.max(0, Number(entrada.valorDeclarado) || 0);

  const opcoes = base.servicos.map((s) => {
    try {
      if (peso.pesoTarifadoG > Number(s.limite_peso_g)) throw new Error('Peso tarifado acima do limite de ' + Number(s.limite_peso_g) / 1000 + ' kg.');
      if (vd > Number(s.vd_max)) throw new Error('Valor declarado acima do máximo de R$ ' + Number(s.vd_max).toFixed(2).replace('.', ',') + '.');
      const pb = precoDaFaixa(base, s.codigo, trecho.escala, trecho.coluna, peso.pesoTarifadoG);
      const vdValor = vd > 0 ? r2(Math.max(0, vd - ad.INDENIZACAO_AUTOMATICA) * ad.VD_PERCENTUAL) : 0;
      const arValor = entrada.ar ? ad.AR : 0;
      const mpValor = entrada.maoPropria ? ad.MP : 0;
      const manuseioValor = manuseio ? ad.MANUSEIO_ESPECIAL : 0;
      return {
        ok: true, codigo: s.codigo, chave: s.chave, nome: s.nome,
        precoBase: pb.preco, faixa: pb.faixa, vdValor, arValor, mpValor, manuseioValor,
        total: r2(pb.preco + vdValor + arValor + mpValor + manuseioValor),
      };
    } catch (e) {
      return { ok: false, codigo: s.codigo, chave: s.chave, nome: s.nome, erro: e.message };
    }
  });
  const vig = String(base.vigencia || '').split('-').reverse().join('/');
  return { peso, manuseio, opcoes, fonte: 'Tabela à vista' + (vig ? ' - vigência ' + vig : '') };
}
