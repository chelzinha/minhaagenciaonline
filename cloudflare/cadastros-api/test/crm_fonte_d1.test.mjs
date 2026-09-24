// Apps Script 18_CRM_FONTE_D1: escopo por LOCAL do responsavel e montagem final da master (sandbox, sem planilha).
process.env.TZ = 'UTC';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const AS = path.resolve(aqui, '../../../apps-script/base-metro');
const props = { CRM_FONTE_CLIENTES: 'D1' };
const pad = (n) => String(n).padStart(2, '0');
const sb = {
  console, Session: { getScriptTimeZone: () => 'UTC' },
  Utilities: { formatDate: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
};
vm.createContext(sb);
for (const f of ['00_CLIENTES_MASTER_FINAL.js', '18_CRM_FONTE_D1.js']) vm.runInContext(fs.readFileSync(path.join(AS, f), 'utf8'), sb);
vm.runInContext(`op_readExistingManualFields_=function(){return {CLI_000001:{CLIENTE:'NOME MANUAL',ACAO_ATUAL:''}};};op_lookupMidiaLink_=function(){return '';};`, sb);
let falhas = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.error('FALHOU:', m); } };
const run = (c) => vm.runInContext(c, sb);

// 1) escopo: responsavel so METRO
sb.__obj = {
  config: { funis: [], locais: [{ nome: 'AGF' }, { nome: 'BALCÃO' }, { nome: 'METRO' }] },
  journeyClients: { items: [{ tipoEntidade: 'CLIENTE', local: 'METRO' }, { tipoEntidade: 'CLIENTE', local: 'AGF' }], columns: [{ items: [{ tipoEntidade: 'CLIENTE', local: 'AGF' }], total: 1 }] },
};
run(`CRMD1_USUARIO_={role:'user',crm:{locais:['METRO']}}; __r=crmd1_aplicarEscopo_(__obj);`);
ok(sb.__r.config.locais.length === 1 && sb.__r.config.locais[0].nome === 'METRO', 'config.locais so METRO');
ok(sb.__r.journeyClients.items.length === 1 && sb.__r.journeyClients.columns[0].total === 0, 'tratativas de outro LOCAL saem');
sb.__cad = { tipo: 'CLIENTE', items: [{ local: 'BALCAO' }, { local: 'METRO' }] };
run(`CRMD1_USUARIO_={role:'user',crm:{locais:['BALCAO']}}; __r2=crmd1_aplicarEscopo_(__cad);`);
ok(sb.__r2.items.length === 1 && sb.__r2.items[0].local === 'BALCAO', 'cadastro filtrado (BALCAO sem acento casa com BALCÃO)');
sb.__cad2 = { tipo: 'CLIENTE', items: [{ local: 'AGF' }, { local: 'METRO' }] };
run(`CRMD1_USUARIO_={role:'admin',crm:{locais:[]}}; __r3=crmd1_aplicarEscopo_(__cad2);`);
ok(sb.__r3.items.length === 2, 'admin ve tudo');
run(`CRMD1_USUARIO_={role:'user',crm:{locais:[]}}; __r4=crmd1_aplicarEscopo_({tipo:'CLIENTE',items:[{local:'AGF'}]});`);
ok(sb.__r4.items.length === 0, 'responsavel sem LOCAL nao ve clientes');
props.CRM_FONTE_CLIENTES = '';
run(`CRMD1_USUARIO_={role:'user',crm:{locais:['METRO']}}; __r5=crmd1_aplicarEscopo_({tipo:'CLIENTE',items:[{local:'AGF'}]});`);
ok(sb.__r5.items.length === 1, 'chave desligada: comportamento antigo, sem filtro');
props.CRM_FONTE_CLIENTES = 'D1';

// 2) master final: acao pronta preservada, manual aplicado
const base = { FAT_30D: 100, QTD_30D: 5, DIAS_ATIVOS_30D: 3, TICKET_30D: 20, FAT_31_60D: 0, QTD_31_60D: 0, DIAS_ATIVOS_31_60D: 0, TICKET_31_60D: 0,
  QTD_TOTAL: 5, VALOR_TOTAL: 100, MESES_ATIVOS_TOTAL: 1, DIAS_SEM_POSTAR: 2, STATUS_ATIVIDADE: 'ATIVO_30D', CURVA: 'B', PERFIL_COMERCIAL: 'CONTRATO_ECT_DIRETO',
  NIVEL_ALERTA: 'SAUDAVEL', RECORRENCIA_NIVEL: 'MEDIA', SHARE_LOCAL_30D: 0.5 };
sb.__m = [{ ...base, CLIENTE_ID: 'CLI_000001', NOME_REMETENTE_BASE: 'NOME D1', ACAO: 'FIDELIZAR', SUB_ACAO: 'X_TESTE', PRIORIDADE_FILA: 'MEDIA', SCORE_PRIORIDADE: 60 },
  { ...base, CLIENTE_ID: 'CLI_ABC', NOME_REMETENTE_BASE: 'NOVO', ACAO: '' }];
run(`__rows = op_finalizeMasterRows_(__m, '2026-09-23', { acaoPronta: true });`);
const r1 = sb.__rows.find((x) => x.CLIENTE_ID === 'CLI_000001'), r2 = sb.__rows.find((x) => x.CLIENTE_ID === 'CLI_ABC');
ok(r1.SUB_ACAO === 'X_TESTE' && r1.ACAO === 'FIDELIZAR', 'acao do D1 nao e recalculada');
ok(r1.CLIENTE === 'NOME MANUAL', 'nome manual do CRM preservado');
ok(!!r2.ACAO && !!r2.SUB_ACAO, 'linha sem acao recebe acao do motor');
ok(run(`crmd1_localLegado_('CF')`) === 'METRO' && run(`crmd1_localLegado_('ROTA AGF1')`) === 'ROTA AGF1', 'LOCAL legado CF vira METRO');

console.log(`${total - falhas}/${total} verificacoes ok (fonte D1)`);
if (falhas) process.exit(1);
