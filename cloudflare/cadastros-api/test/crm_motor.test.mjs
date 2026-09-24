// Paridade: o motor portado (src/crm_motor.js) contra o ORIGINAL do Apps Script, carregado em sandbox.
process.env.TZ = "UTC";   // o Apps Script original usa datas locais; UTC deixa as duas contas no mesmo fuso
// Rodar com: node test/crm_motor.test.mjs (ou npm test)
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executarCrm, fecharLocal, metricasDoCliente, bucketDaPostagem } from '../src/crm_motor.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL = path.resolve(aqui, '../../../apps-script/base-metro/00_CLIENTES_MASTER_FINAL.js');
const pad = (n) => String(n).padStart(2, '0');
const sandbox = {
  Session: { getScriptTimeZone: () => 'UTC' },
  Utilities: { formatDate: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` },
  console,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(ORIGINAL, 'utf8'), sandbox);
vm.runInContext(`op_readExistingManualFields_ = function(){ return {}; }; op_lookupMidiaLink_ = function(){ return ''; };`, sandbox);

let falhas = 0, total = 0;
const ok = (cond, msg) => { total++; if (!cond) { falhas++; console.error('FALHOU:', msg); } };

// gerador deterministico
let seed = 20260924;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const PERFIS = ['VR', 'MKT', 'CTR', 'BAL', 'CTR_REV'];
function gerar(nClientes, refDate) {
  const antigos = [], novos = new Map();
  for (let i = 0; i < nClientes; i++) {
    const id = 'C' + String(i).padStart(4, '0');
    const perfil = PERFIS[Math.floor(rnd() * PERFIS.length)];
    const intensidade = rnd() ** 2;                             // poucos grandes, muitos pequenos
    const inicio = Math.floor(rnd() * 140), parada = rnd() < 0.3 ? Math.floor(rnd() * 90) : 0;
    const linhasNovas = [];
    for (let d = 0; d < 140 - inicio; d++) {
      const diasAtras = d + parada;
      if (diasAtras > 140 || rnd() > intensidade) continue;
      const data = new Date(Date.parse(refDate) - diasAtras * 864e5).toISOString().slice(0, 10);
      const qtd = 1 + Math.floor(rnd() * 6 * intensidade);
      for (let k = 0; k < qtd; k++) {
        const valor = Math.round((10 + rnd() * 90) * 100) / 100;
        const rev = perfil === 'CTR_REV' && rnd() < 0.7;
        const o = { nomeRemetenteBase: id, data, qtd: 1, valor, local: 'AGF', segmento: '', categoria: '', razaoSocialLinha: '', CLIENTE_ID: id,
          tipoServico: perfil === 'BAL' ? 'BALCAO' : rev ? 'REVERSO' : 'SEDEX',
          intermediador: perfil === 'VR' ? 'VR' : perfil === 'MKT' ? 'MERCADO LIVRE' : perfil.startsWith('CTR') ? 'CONTRATO ECT' : '',
          numeroContrato: perfil.startsWith('CTR') ? '99120' + i : '', cartaoPostagem: '', etiquetaContrato: '', ifEtiqueta: '' };
        antigos.push(o);
        linhasNovas.push({ data, qtd: 1, valor, estorno: 0, local: 'AGF',
          intermediador: perfil === 'VR' ? 'VR' : perfil === 'MKT' ? 'INTERMEDIADOR' : perfil.startsWith('CTR') ? 'CONTRATO ECT' : '',
          contratoTipo: perfil === 'MKT' ? 'MERCADO LIVRE' : '', subgrupo: rev ? 'Reverso' : 'SEDEX', contrato: o.numeroContrato, cartao: '' });
      }
    }
    if (linhasNovas.length) novos.set(id, linhasNovas);
  }
  return { antigos, novos };
}

const CAMPOS = ['CURVA', 'CURVA_ANTERIOR', 'MOVIMENTO_CURVA', 'ACAO', 'SUB_ACAO', 'PRIORIDADE_FILA', 'SCORE_PRIORIDADE', 'CANAL_SUGERIDO',
  'CONTEUDO_SUGERIDO', 'MOTIVO_REGRA', 'PERFIL_COMERCIAL', 'TEM_CONTRATO', 'NIVEL_ALERTA', 'STATUS_ATIVIDADE', 'TENDENCIA', 'PORTE_OPERACIONAL',
  'NOVO_CLIENTE', 'IS_REVERSO_BAIXO', 'RECORRENCIA_NIVEL', 'DIAS_SEM_POSTAR', 'QTD_30D', 'DIAS_ATIVOS_30D', 'QTD_31_60D', 'QTD_TOTAL', 'MESES_ATIVOS_TOTAL', 'MIDIA'];
const NUM = ['FAT_30D', 'FAT_31_60D', 'VALOR_TOTAL', 'SHARE_LOCAL_30D', 'SCORE_CURVA_ATUAL', 'SCORE_CURVA_ANTERIOR'];

for (const [n, refDate] of [[60, '2026-09-23'], [400, '2026-09-05'], [1500, '2026-08-31']]) {
  const { antigos, novos } = gerar(n, refDate);
  sandbox.__rows = antigos; sandbox.__ref = refDate;
  const velho = vm.runInContext(`op_buildMasterRows_(op_groupByClientId_(__rows), __ref)`, sandbox);
  const clientes = new Map([...novos.keys()].map((id) => [id, { nome: id, local: 'AGF' }]));
  const novo = executarCrm(clientes, novos, refDate).metricas;
  ok(velho.length === novo.length, `n=${n}: quantidade ${velho.length} x ${novo.length}`);
  const porId = new Map(novo.map((m) => [m.CLIENTE_ID, m]));
  let dif = 0;
  for (const v of velho) {
    const m = porId.get(v.CLIENTE_ID);
    if (!m) { ok(false, `n=${n}: ${v.CLIENTE_ID} ausente`); continue; }
    for (const c of CAMPOS) if (String(v[c]) !== String(m[c])) { if (dif++ < 8) console.error(`  ${v.CLIENTE_ID} ${c}: original=${v[c]} portado=${m[c]}`); }
    for (const c of NUM) if (Math.abs(Number(v[c]) - Number(m[c])) > 1e-9) { if (dif++ < 8) console.error(`  ${v.CLIENTE_ID} ${c}: original=${v[c]} portado=${m[c]}`); }
  }
  ok(dif === 0, `n=${n}: ${dif} diferencas de campo`);
  ok(velho.map((x) => x.CLIENTE_ID).join() === novo.map((x) => x.CLIENTE_ID).join(), `n=${n}: ordem da fila diferente`);
  const acoes = {}; for (const m of novo) acoes[m.ACAO] = (acoes[m.ACAO] || 0) + 1;
  console.log(`paridade n=${n} ref=${refDate}: ${novo.length} clientes, ${dif} diferencas`, JSON.stringify(acoes));
}

// Curva dentro do LOCAL: o mesmo cliente muda de curva conforme os vizinhos do LOCAL, nunca pelos outros locais.
{
  const ref = '2026-09-23';
  const linhas = (qtdDia, dias) => Array.from({ length: dias }, (_, d) => ({ data: new Date(Date.parse(ref) - d * 864e5).toISOString().slice(0, 10), qtd: qtdDia, valor: qtdDia * 30, estorno: 0, local: 'X', intermediador: 'CONTRATO ECT', contratoTipo: '', subgrupo: 'SEDEX', contrato: '1', cartao: '' }));
  const mapa = new Map([['GRANDE_METRO', linhas(20, 120)], ['PEQ_BALCAO', linhas(2, 120)], ...Array.from({ length: 30 }, (_, i) => [`M${i}`, linhas(1, 20)])]);
  const cl = new Map([['GRANDE_METRO', { nome: 'G', local: 'METRO' }], ['PEQ_BALCAO', { nome: 'P', local: 'BALCAO' }], ...Array.from({ length: 30 }, (_, i) => [`M${i}`, { nome: 'M' + i, local: 'METRO' }])]);
  const r = executarCrm(cl, mapa, ref);
  const peq = r.metricas.find((m) => m.CLIENTE_ID === 'PEQ_BALCAO');
  ok(peq.SHARE_LOCAL_30D === 1, 'cliente sozinho no BALCAO tem share 100% do BALCAO');
  ok(r.porLocal.METRO === 31 && r.porLocal.BALCAO === 1, 'grupos por LOCAL');
  ok(r.metricas.find((m) => m.CLIENTE_ID === 'GRANDE_METRO').CURVA === 'TOP', 'maior do METRO e TOP no METRO');
}

// Tipo de negocio pelas colunas do Atende
ok(bucketDaPostagem({ intermediador: 'VR' }) === 'VR', 'VR');
ok(bucketDaPostagem({ intermediador: 'INTERMEDIADOR' }) === 'INTERMEDIADOR', 'INTERMEDIADOR');
ok(bucketDaPostagem({ intermediador: 'PORTAL POSTAL' }) === 'CONTRATO', 'PORTAL POSTAL = contrato');
ok(bucketDaPostagem({ intermediador: 'CONTRATO ECT' }) === 'CONTRATO', 'CONTRATO ECT');
ok(bucketDaPostagem({ intermediador: '', contrato: '' }) === 'BALCAO', 'sem contrato = balcao');

// Estorno: soma valor, nao conta objeto nem dia
{
  const m = metricasDoCliente('E', [
    { data: '2026-09-20', qtd: 1, valor: 50, estorno: 0, subgrupo: 'SEDEX' },
    { data: '2026-09-21', qtd: 1, valor: -50, estorno: 1, subgrupo: 'SEDEX' },
  ], '2026-09-23');
  ok(m.QTD_30D === 1 && m.FAT_30D === 0 && m.DIAS_ATIVOS_30D === 1 && m.DATA_ULTIMA_POSTAGEM === '2026-09-20', 'estorno');
}

console.log(`${total - falhas}/${total} verificacoes ok`);
if (falhas) process.exit(1);
