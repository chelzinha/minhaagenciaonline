const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'base-metro', '18_CURVA_ABC_API.js'), 'utf8');
const context = {
  console,
  Date,
  JSON,
  Math,
  Object,
  Array,
  String,
  Number,
  Session:{getScriptTimeZone:()=> 'America/Fortaleza'},
  Utilities:{
    DigestAlgorithm:{MD5:'md5'},
    Charset:{UTF_8:'utf8'},
    computeDigest:(_algorithm,value)=>Array.from(crypto.createHash('md5').update(String(value),'utf8').digest()),
    formatDate:(date,_tz,format)=>format==='yyyy-MM-dd'
      ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
      : date.toISOString().slice(0,19)
  }
};
vm.createContext(context);
vm.runInContext(source, context);

function months(){
  return Array.from({length:12},(_,i)=>{
    const d=new Date(2025,8+i,1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return {key,label:`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`};
  });
}

function client(name,total,firstPost='2025-09'){
  const defs=months(),monthly={};
  defs.forEach(m=>{monthly[m.key]={qtd:0,value:0};});
  monthly['2026-07']={qtd:10,value:total};
  return context.abc_finalizeClient_({clientId:name,client:name,months:monthly,firstPost},defs);
}

test('seleciona exatamente os últimos 12 meses',()=>{
  const result=context.abc_lastMonths_(12,new Date(2026,7,21));
  assert.equal(result.length,12);
  assert.equal(result[0].key,'2025-09');
  assert.equal(result[11].key,'2026-08');
});

test('aplica A até 80%, B até 95% ou piso de R$ 5 mil',()=>{
  const clients=[client('A',80000),client('B1',10000),client('B2',6000),client('C',4000)];
  context.abc_assignCurves_(clients);
  assert.equal(clients[0].curve,'A');
  assert.equal(clients[1].curve,'B');
  assert.equal(clients[2].curve,'B');
  assert.equal(clients[3].curve,'C');
});

test('marca NOVO somente quando a primeira postagem é 03/2026 ou posterior',()=>{
  assert.equal(client('Anterior',1000,'2026-02').status,'CARTEIRA');
  assert.equal(client('Marco',1000,'2026-03').status,'NOVO');
  assert.equal(client('Posterior',1000,'2026-06').status,'NOVO');
});

test('eleva a prioridade de queda grave conforme a curva',()=>{
  const a=client('Risco A',80000,'2025-09');
  const b=client('Risco B',10000,'2025-09');
  const floor=client('Piso B',6000,'2025-09');
  const c=client('Risco C',4000,'2025-09');
  [a,b,floor,c].forEach(item=>{item.signal='QUEDA CRÍTICA';item.priority='MÉDIA';item.score=82;});
  context.abc_assignCurves_([a,b,floor,c]);
  assert.equal(a.priority,'CRÍTICA');
  assert.equal(b.priority,'ALTA');
  assert.equal(c.priority,'MÉDIA');
});

test('reconhece os pares QTD e VALOR no snapshot',()=>{
  const result=context.abc_snapshotMonthDefs_(['','08/2025','08/2025','09/2025','09/2025'],['CLIENTE','QTD','VALOR','QTD','VALOR']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),[
    {key:'2025-08',label:'08/2025',qtdCol:1,valueCol:2},
    {key:'2025-09',label:'09/2025',qtdCol:3,valueCol:4}
  ]);
});

test('valida os quatro cabeçalhos mínimos da fonte RAW',()=>{
  const valid=context.abc_headerMap_(['DATA','NOME_REMETENTE','QTD','VALOR']);
  assert.doesNotThrow(()=>context.abc_requireRawHeaders_(valid));
  const invalid=context.abc_headerMap_(['DATA','NOME_REMETENTE','VALOR']);
  assert.throws(()=>context.abc_requireRawHeaders_(invalid),/QTD ou QUANTIDADE/);
});
