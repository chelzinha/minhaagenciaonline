// Testes das regras de data e permissao do agf-mural-api (node test/datas.test.mjs)
import assert from 'node:assert/strict';
import { _interno as t } from '../src/index.js';

assert.equal(t.somarDias('2026-10-31', 1), '2026-11-01');
assert.equal(t.somarDias('2026-12-31', 1), '2027-01-01');
const lim = t.limitesDoMesUtc('2026-10-03');
assert.equal(lim.ini, '2026-10-01T03:00:00.000Z');
assert.equal(lim.fim, '2026-11-01T03:00:00.000Z');
const dez = t.limitesDoMesUtc('2026-12-15');
assert.equal(dez.fim, '2027-01-01T03:00:00.000Z');
assert.equal(t.dataValida('2026-02-29'), false);
assert.equal(t.dataValida('2028-02-29'), true);
assert.equal(t.dataValida('03/10/2026'), false);
assert.equal(t.limpar('  oi  '), 'oi');
assert.equal(t.limpar('abcdef', 3), 'abc');
assert.deepEqual(t.perfil({ username: 'ana', displayName: 'Ana', role: 'manager' }).gestor, true);
assert.deepEqual(t.perfil({ username: 'ana', role: 'manager' }).admin, false);
assert.deepEqual(t.perfil({ username: 'leo', role: 'user' }).gestor, false);
assert.match(t.hojeLocal(), /^\d{4}-\d{2}-\d{2}$/);
console.log('[mural-api] datas e perfis: ok');

// v1.1.0: perfis
assert.deepEqual(t.validarData('', ''), { dia: null, mes: null });
assert.deepEqual(t.validarData(7, 12), { dia: 7, mes: 12 });
assert.throws(() => t.validarData(31, 4));
assert.throws(() => t.validarData(5, ''));
assert.equal(t.validarAvatar(''), '');
assert.equal(t.validarAvatar('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
assert.throws(() => t.validarAvatar('data:text/html;base64,AAAA'));
assert.throws(() => t.validarAvatar('data:image/jpeg;base64,' + 'A'.repeat(70000)));
assert.equal(t.validarUsername(' Julio '), 'julio');
assert.throws(() => t.validarUsername('a b'));
console.log('[mural-api] perfis: ok');
