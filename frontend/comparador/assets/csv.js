/* csv.js - leitura do CSV de postagens (Portal Postal "postagens analítico" e variações).
   Funções puras, testáveis fora do navegador. */

function detectarDelimitador(linha) {
  let melhor = ';', max = -1;
  for (const d of [';', ',', '\t']) {
    const n = linha.split(d).length;
    if (n > max) { max = n; melhor = d; }
  }
  return melhor;
}

function lerLinha(linha, d) {
  const campos = [];
  let v = '', aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { v += '"'; i++; } else aspas = !aspas;
    } else if (c === d && !aspas) { campos.push(v); v = ''; } else v += c;
  }
  campos.push(v);
  return campos;
}

const normCab = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

export function parseCsv(texto) {
  const limpo = String(texto ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const linhas = limpo.split('\n').filter((l) => l.trim() !== '');
  if (!linhas.length) return { cabecalhos: [], linhas: [] };
  const d = detectarDelimitador(linhas[0]);
  const cabecalhos = lerLinha(linhas[0], d).map(normCab);
  return {
    cabecalhos,
    linhas: linhas.slice(1).map((l) => {
      const v = lerLinha(l, d);
      return Object.fromEntries(cabecalhos.map((h, i) => [h, (v[i] ?? '').trim()]));
    }),
  };
}

/** Nomes aceitos para cada campo (o primeiro que existir no arquivo vence). */
const ALIAS = {
  id: ['OBJETO', 'CODIGO_OBJETO', 'ETIQUETA', 'RASTREIO'],
  servico: ['SERVICO', 'NOME_SERVICO'],
  codigo: ['CODIGO_ECT', 'CODIGO_SERVICO', 'COD_SERVICO'],
  peso: ['PESO', 'PESO_G', 'PESO_GRAMAS', 'PESO_REAL'],
  altura: ['ALTURA', 'ALTURA_CM'],
  largura: ['LARGURA', 'LARGURA_CM'],
  comprimento: ['COMPRIMENTO', 'COMPRIMENTO_CM'],
  declarado: ['DECLARADO', 'VALOR_DECLARADO'],
  valor: ['VALOR', 'VALOR_ATENDIMENTO', 'VALOR_PAGO', 'VALOR_POSTAGEM'],
  cidade: ['CIDADE', 'MUNICIPIO', 'CIDADE_DESTINO', 'MUNICIPIO_DESTINO'],
  uf: ['UF', 'UF_DESTINO', 'ESTADO'],
  cep: ['CEP', 'CEP_DESTINO', 'CEP_DESTINATARIO'],
  data: ['POSTAGEM', 'DATA_POSTAGEM', 'DATA'],
  adicionais: ['ADICIONAIS', 'SERVICOS_ADICIONAIS'],
};

export function mapearColunas(cabecalhos) {
  const m = {};
  for (const [campo, nomes] of Object.entries(ALIAS)) m[campo] = nomes.find((n) => cabecalhos.includes(n)) || null;
  const faltando = [];
  if (!m.servico && !m.codigo) faltando.push('SERVICO ou CODIGO_ECT');
  for (const c of ['peso', 'cidade', 'uf']) if (!m[c]) faltando.push(ALIAS[c][0]);
  const semMedidas = !(m.altura && m.largura && m.comprimento);
  return { mapa: m, faltando, semMedidas };
}

/** "68,00" -> 68; "1.234,56" -> 1234.56; "560" -> 560; "34.5" -> 34.5 */
export function numeroBR(v) {
  const t = String(v ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : 0;
}

/** Linhas do CSV -> linhas para o Worker (uma postagem por linha, como no Portal Postal). */
export function montarLinhas(linhasCsv, mapa) {
  const pega = (r, c) => (mapa[c] ? r[mapa[c]] : '');
  return linhasCsv.map((r, i) => ({
    id: pega(r, 'id') || 'linha ' + (i + 2),
    servico: pega(r, 'servico'), codigo: pega(r, 'codigo'),
      pesoG: numeroBR(pega(r, 'peso')),
      alturaCm: numeroBR(pega(r, 'altura')), larguraCm: numeroBR(pega(r, 'largura')), comprimentoCm: numeroBR(pega(r, 'comprimento')),
      valorDeclarado: numeroBR(pega(r, 'declarado')),
      valorPago: numeroBR(pega(r, 'valor')),
      cidade: pega(r, 'cidade'), uf: pega(r, 'uf'), cep: pega(r, 'cep'),
      data: pega(r, 'data'), adicionais: pega(r, 'adicionais'),
  }));
}
