/* =====================================================
   COMPARADOR - LOTE
   Recebe as postagens do cliente (CSV lido no navegador) e devolve, por linha,
   o preco em cada cenario:
     AVISTA   tabela a vista do balcao (motor do /balcao, sem alteracao)
     CONTRATO pacote escolhido (padrao PLATINUM)
     CLUBE    pacote Clube Correios
     APP      Correios App
   So D1: nenhuma chamada a API dos Correios (o CSV ja traz cidade e UF).
   ===================================================== */
import { carregarBase, classificarTrecho, calcularPrecos, normalizarMunicipio, PRECO_VERSAO } from '../preco/preco-avista.js';
import { carregarBaseTabelas, classificarTrechoTabela, calcularContrato, calcularApp, TABELAS_VERSAO } from '../preco/preco-tabelas.js';

export const LOTE_MAX_LINHAS = 400;
const ORIGEM = { uf: 'CE', municipio: 'FORTALEZA', cep: '60055974' };

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = String(v == null ? '' : v).replace(/R\$/gi, '').replace(/\s/g, '');
  if (!t) return 0;
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** SEDEX, PAC ou OUTRO, pelo nome ou pelo codigo do servico. */
export function detectarServico(servico, codigo) {
  const s = normalizarMunicipio(servico);
  const c = String(codigo || '').replace(/\D/g, '').replace(/^0+/, '');
  if (s.includes('MINI') || ['4227', '4235', '4391'].includes(c)) return 'PAC';
  if (s.includes('SEDEX 10') || s.includes('SEDEX 12') || s.includes('HOJE')) return 'OUTRO';
  if (s.includes('SEDEX') || ['4014', '3220', '4162', '3050', '7218', '41955', '4195'].includes(c)) return 'SEDEX';
  if (s.includes('PAC') || ['4510', '3298', '4669', '3085', '7285', '3395'].includes(c)) return 'PAC';
  return 'OUTRO';
}

/** AR e MP a partir da coluna ADICIONAIS do Portal Postal (texto livre). */
export function lerAdicionais(txt) {
  const t = ' ' + normalizarMunicipio(txt) + ' ';
  return { ar: /\sAR\s|AVISO DE RECEB/.test(t), maoPropria: /\sMP\s|MAO PROPRIA/.test(t) };
}

function normalizarLinha(l) {
  const ad = lerAdicionais(l.adicionais);
  return {
    id: String(l.id ?? ''),
    servico: detectarServico(l.servico, l.codigo),
    servicoOriginal: String(l.servico || '').trim(),
    uf: String(l.uf || '').trim().toUpperCase(),
    municipio: String(l.cidade || '').trim(),
    entrada: {
      pesoG: num(l.pesoG), alturaCm: num(l.alturaCm), larguraCm: num(l.larguraCm), comprimentoCm: num(l.comprimentoCm),
      valorDeclarado: Math.max(0, num(l.valorDeclarado)), tipoObjeto: 'PACOTE', ar: ad.ar, maoPropria: ad.maoPropria,
    },
    valorPago: num(l.valorPago),
  };
}

function cenario(res) {
  if (!res || !res.ok) return { ok: false, erro: (res && (res.erro || res.motivo)) || 'Sem preço.' };
  const out = { ok: true, total: res.total, coluna: res.coluna || '', pesoTarifadoG: res.pesoTarifadoG || 0 };
  if (res.servicoUsado === 'MINI') out.mini = true;
  if (res.aviso) out.aviso = res.aviso;
  return out;
}

/**
 * @param p { linhas:[{id, servico, codigo, pesoG, alturaCm, larguraCm, comprimentoCm, valorDeclarado, uf, cidade, valorPago, adicionais}],
 *            tabelaContrato:'PLATINUM', usarMini:true, incluirValorDeclarado:true }
 */
export async function calcularLote(env, p) {
  const linhas = Array.isArray(p.linhas) ? p.linhas : [];
  if (!linhas.length) throw Object.assign(new Error('Nenhuma postagem enviada.'), { status: 422 });
  if (linhas.length > LOTE_MAX_LINHAS) throw Object.assign(new Error('Envie no máximo ' + LOTE_MAX_LINHAS + ' postagens por vez.'), { status: 413 });
  const tabelaContrato = String(p.tabelaContrato || 'PLATINUM').toUpperCase();
  const usarMini = p.usarMini !== false;
  const incluirVD = p.incluirValorDeclarado !== false;

  const [baseA, baseT] = await Promise.all([carregarBase(env.DB), carregarBaseTabelas(env.DB)]);
  if (!baseT.porCodigo.has(tabelaContrato) || baseT.porCodigo.get(tabelaContrato).tipo !== 'CONTRATO') {
    throw Object.assign(new Error('Pacote de contrato inválido: ' + tabelaContrato + '.'), { status: 422 });
  }
  const adicionais = { AR: baseA.ad.AR || 0, MP: baseA.ad.MP || 0 };

  const resultados = linhas.map((bruta) => {
    const l = normalizarLinha(bruta);
    if (!incluirVD) l.entrada.valorDeclarado = 0;
    const base = { id: l.id, servico: l.servico, servicoOriginal: l.servicoOriginal, uf: l.uf, cidade: l.municipio, pesoG: l.entrada.pesoG, valorPago: l.valorPago };
    if (l.servico === 'OUTRO') return { ...base, status: 'IGNORADO', aviso: 'Serviço fora da comparação (só SEDEX e PAC).' };
    if (!l.uf || !l.municipio) return { ...base, status: 'REVISAR', aviso: 'Cidade ou UF ausente.' };
    if (l.entrada.pesoG <= 0) return { ...base, status: 'REVISAR', aviso: 'Peso ausente.' };
    const destino = { uf: l.uf, municipio: l.municipio };
    try {
      const trechoA = classificarTrecho(baseA, ORIGEM, destino);
      const precoA = calcularPrecos(baseA, l.entrada, trechoA).opcoes.find((o) => o.chave === l.servico);
      const avista = precoA && precoA.ok ? { ok: true, total: precoA.total, coluna: trechoA.coluna + ' ' + trechoA.escala } : { ok: false, erro: precoA ? precoA.erro : 'Sem preço à vista.' };
      const trechoT = classificarTrechoTabela(baseT, baseA.loc, ORIGEM, destino);
      const opc = { servico: l.servico, usarMini, adicionais };
      const contrato = cenario(calcularContrato(baseT, l.entrada, trechoT, { ...opc, tabela: tabelaContrato }));
      const clube = cenario(calcularContrato(baseT, l.entrada, trechoT, { ...opc, tabela: 'CLUBE_CORREIOS' }));
      const app = cenario(calcularApp(baseT, l.entrada, trechoT, opc));
      const confere = avista.ok && l.valorPago > 0 ? Math.abs(avista.total - l.valorPago) < 0.02 : null;
      return {
        ...base, status: 'CALCULADO', trecho: trechoT.motivo, classe: trechoT.classe,
        AVISTA: avista, CONTRATO: contrato, CLUBE: clube, APP: app, pagoConfereAvista: confere,
      };
    } catch (e) {
      return { ...base, status: 'REVISAR', aviso: e.message };
    }
  });

  return {
    versao: { avista: PRECO_VERSAO, tabelas: TABELAS_VERSAO },
    vigencia: baseT.vigencia,
    tabelaContrato,
    linhas: resultados,
    resumo: resumir(resultados),
  };
}

function resumir(rs) {
  const s = { linhas: rs.length, calculadas: 0, revisar: 0, ignoradas: 0 };
  for (const r of rs) {
    if (r.status === 'CALCULADO') s.calculadas++;
    else if (r.status === 'IGNORADO') s.ignoradas++;
    else s.revisar++;
  }
  return s;
}

/** Catalogo de tabelas para a tela (pacotes de contrato + App). */
export async function catalogo(env) {
  const [baseA, baseT] = await Promise.all([carregarBase(env.DB), carregarBaseTabelas(env.DB)]);
  return {
    vigenciaAvista: baseA.vigencia,
    vigenciaTabelas: baseT.vigencia,
    tabelas: baseT.tabelas.map((t) => ({ codigo: t.codigo, nome: t.nome, tipo: t.tipo, observacao: t.observacao || '' })),
    loteMaxLinhas: LOTE_MAX_LINHAS,
    regras: {
      contratoAdValorem: baseT.re.CTR_VD_PCT, appAdValorem: baseT.re.APP_VD_PCT, avistaAdValorem: baseA.ad.VD_PERCENTUAL,
      appDivisor: baseT.re.APP_DIVISOR, contratoDivisor: baseT.re.CTR_DIVISOR,
    },
    versao: { avista: PRECO_VERSAO, tabelas: TABELAS_VERSAO },
  };
}
