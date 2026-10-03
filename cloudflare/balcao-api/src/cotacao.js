/* =====================================================
   COTACAO - junta os dois caminhos, sem misturar regras.
   1. Busca o municipio de origem e destino (../cep).
   2. CAMINHO 1 - PRECO: calcula com as tabelas a vista do D1 (../preco).
   3. CAMINHO 2 - PRAZO: consulta a API Prazo (../prazo), em paralelo.
   O prazo nunca altera o preco. Se o prazo falhar, a cotacao sai com o preco
   e o aviso "Confirmar no SARA".
   ===================================================== */
import { carregarBase, classificarTrecho, calcularPrecos, origemAtendida, ufPorCep, PRECO_VERSAO } from './preco/preco-avista.js';
import { consultarPrazo } from './prazo/prazo-correios.js';
import { buscarCep } from './cep/cep.js';

const num = (v) => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const sim = (v) => v === true || String(v || '').toUpperCase() === 'SIM';
const erro = (msg, status = 422) => { throw Object.assign(new Error(msg), { status }); };

async function resolverPonto(env, cep, rotulo) {
  const r = await buscarCep(env, cep).catch((e) => erro(rotulo + ': ' + e.message, e.status || 422));
  const ufFaixa = ufPorCep(r.cep);
  if (ufFaixa && r.uf !== ufFaixa) erro(rotulo + ': UF do CEP (' + r.uf + ') não confere com a faixa de CEP (' + ufFaixa + ').');
  return r;
}

/**
 * config.exigirDimensoes: false no /postar (o cliente pode não saber as medidas; o atendente confere no balcão).
 */
export async function cotar(env, p, config = {}) {
  const exigirDimensoes = config.exigirDimensoes !== false;
  const tipoObjeto = String(p.tipoObjeto || 'PACOTE').toUpperCase();
  const entrada = {
    tipoObjeto,
    pesoG: num(p.pesoG), alturaCm: num(p.alturaCm), larguraCm: num(p.larguraCm),
    comprimentoCm: num(p.comprimentoCm), diametroCm: num(p.diametroCm),
    valorDeclarado: Math.max(0, num(p.valorDeclarado)), ar: sim(p.ar), maoPropria: sim(p.maoPropria),
  };
  if (entrada.pesoG <= 0) erro('Informe o peso em gramas.');
  if (exigirDimensoes && tipoObjeto === 'PACOTE' && !(entrada.alturaCm > 0 && entrada.larguraCm > 0 && entrada.comprimentoCm > 0)) erro('Informe altura, largura e comprimento.');

  const [base, origem, destino] = await Promise.all([
    carregarBase(env.DB),
    resolverPonto(env, p.cepOrigem, 'Origem'),
    resolverPonto(env, p.cepDestino, 'Destino'),
  ]);
  if (!origemAtendida(base, origem)) erro('A tabela à vista carregada é para origem na Região Metropolitana de Fortaleza. CEP de origem: ' + origem.municipio + '/' + origem.uf + '.');

  // CAMINHO 1 - PRECO (sincrono, so D1)
  const trecho = classificarTrecho(base, origem, destino);
  const preco = calcularPrecos(base, entrada, trecho);

  // CAMINHO 2 - PRAZO (API), so para os servicos com preco valido
  const prazos = await Promise.all(preco.opcoes.map((o) => (o.ok ? consultarPrazo(env, o.codigo, origem.cep, destino.cep) : null)));

  const opcoes = preco.opcoes.map((o, i) => {
    const base = { ok: o.ok, servico: o.chave, nome: o.nome, codigoServico: o.codigo };
    if (!o.ok) return { ...base, erro: o.erro };
    const pz = prazos[i] || { ok: false, erro: 'Sem consulta.' };
    return {
      ...base,
      total: o.total, precoBase: o.precoBase, faixa: o.faixa,
      vdAdicional: o.vdValor, arValor: o.arValor, mpValor: o.mpValor, manuseioValor: o.manuseioValor,
      pesoTarifadoG: preco.peso.pesoTarifadoG,
      fontePreco: preco.fonte,
      prazo: pz, prazoDias: pz.ok ? pz.prazoDias : '', dataMaxima: pz.ok ? pz.dataMaxima : '', fontePrazo: pz.fonte,
    };
  });

  return {
    ok: opcoes.some((o) => o.ok),
    versao: PRECO_VERSAO,
    entrada: {
      cepOrigem: origem.cep, cidadeOrigem: origem.municipio, ufOrigem: origem.uf,
      cepDestino: destino.cep, cidadeDestino: destino.municipio, ufDestino: destino.uf,
      ...entrada, ar: entrada.ar ? 'SIM' : 'NAO', maoPropria: entrada.maoPropria ? 'SIM' : 'NAO',
      pesoCubicoKg: preco.peso.pesoCubicoKg, pesoTarifadoG: preco.peso.pesoTarifadoG, cubagemAplicada: preco.peso.cubagemAplicada,
    },
    origem, destino,
    trecho: { coluna: trecho.coluna, escala: trecho.escala, motivo: trecho.motivo },
    opcoes,
    aviso: 'Preço: ' + preco.fonte + '. Prazo: API Prazo dos Correios.',
  };
}
