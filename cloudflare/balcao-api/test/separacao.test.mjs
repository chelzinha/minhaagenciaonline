// Garante a separacao entre os caminhos de PRECO e PRAZO e que a API de preco dos Correios nunca e chamada.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const arquivos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? arquivos(path.join(dir, d.name)) : [path.join(dir, d.name)]);
const todos = arquivos(src).filter((f) => f.endsWith('.js'));
const ler = (f) => fs.readFileSync(f, 'utf8');

for (const f of todos) {
  assert.ok(!/preco\/v\d|correios\.com\.br\/preco/i.test(ler(f)), 'Endereco da API de preco encontrado em ' + f);
}
for (const f of todos.filter((f) => f.includes(path.sep + 'preco' + path.sep))) {
  const t = ler(f);
  assert.ok(!/from\s+['"][^'"]*(prazo|correios|cep)\//.test(t), 'preco/ importa prazo, correios ou cep: ' + f);
  assert.ok(!/CORREIOS_|fetch\(/.test(t), 'preco/ usa credencial ou internet: ' + f);
}
for (const f of todos.filter((f) => f.includes(path.sep + 'prazo' + path.sep) || f.includes(path.sep + 'cep' + path.sep) || f.includes(path.sep + 'correios' + path.sep))) {
  assert.ok(!/from\s+['"][^'"]*preco\//.test(ler(f)), 'prazo/cep/correios importa preco: ' + f);
}
const credencial = todos.filter((f) => /CORREIOS_(USUARIO|CODIGO_ACESSO|CARTAO)/.test(ler(f)) && !f.endsWith('index.js'));
assert.deepEqual(credencial.map((f) => path.basename(f)), ['cliente-correios.js'], 'credencial lida fora do cliente dos Correios');
console.log(`separacao OK: ${todos.length} arquivos conferidos`);
