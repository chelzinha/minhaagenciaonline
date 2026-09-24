import test from 'node:test';
import assert from 'node:assert/strict';
import { key, resolveIdentity, isSharedPortal, isNamePrefix } from '../src/identity.js';

test('somente os três CLIENTES PORTAL declarados usam NOME REMETENTE', () => {
  for (const portal of ['BALCÃO','GAS SHOPPING METRO','GAS SHOPPING CENTRO FASHION']) assert.equal(isSharedPortal(portal),true);
  assert.equal(isSharedPortal('CENTRO FASHION EMPREENDIMENTOS LTDA'),false);
  assert.equal(isSharedPortal('GAS CENTRO FASHION'),false);
});

test('alias do remetente consolida os portais compartilhados, sem alterar o nome original', () => {
  const aliases = new Map([['SENDER:ACME LTDA','cus_acme']]);
  for (const portal of ['BALCÃO','GAS SHOPPING METRO','GAS SHOPPING CENTRO FASHION']) {
    assert.deepEqual(resolveIdentity(portal,'Acme Ltda',aliases),{customerId:'cus_acme',resolution:'SENDER_ALIAS',reason:''});
  }
  assert.equal(key('  ácme  ltda '),'ACME LTDA');
});

test('cliente direto mantém identidade de CLIENTE PORTAL apesar do remetente', () => {
  const aliases = new Map([['PORTAL:CENTRO FASHION EMPREENDIMENTOS LTDA','cus_fashion'],['SENDER:ACME LTDA','cus_acme']]);
  assert.deepEqual(resolveIdentity('CENTRO FASHION EMPREENDIMENTOS LTDA','Acme Ltda',aliases),
    {customerId:'cus_fashion',resolution:'PORTAL',reason:''});
});

test('remetente de portal compartilhado coincide com um CLIENTE PORTAL direto', () => {
  const aliases = new Map([['PORTAL:ACME LTDA','cus_portal']]);
  assert.deepEqual(resolveIdentity('BALCÃO','Ácme   Ltda',aliases),
    {customerId:'cus_portal',resolution:'SENDER_ALIAS',reason:''});
  aliases.set('SENDER:ACME LTDA','cus_confirmado');
  assert.equal(resolveIdentity('GAS SHOPPING METRO','Acme Ltda',aliases).customerId,'cus_confirmado');
});

test('grafias desconhecidas e ausência de portal ou remetente ficam em revisão', () => {
  const aliases = new Map();
  assert.equal(resolveIdentity('BALCÃO','Nova grafia',aliases).resolution,'PENDING');
  assert.equal(resolveIdentity('BALCÃO','',aliases).reason,'SEM_REMETENTE');
  assert.equal(resolveIdentity('','Acme',aliases).reason,'SEM_CLIENTE_PORTAL');
});

test('nome abreviado encontra continuação completa e plural no último termo', () => {
  assert.equal(isNamePrefix('DILOHAN COMERCIO ATACADISTA DE','DILOHAN COMERCIO ATACADISTA DE ROUPAS LTDA'),true);
  assert.equal(isNamePrefix('DONA LUIZA ATACADISTA DE CALCADO','DONA LUIZA ATACADISTA DE CALCADOS LTDA'),true);
  assert.equal(isNamePrefix('DONA LUIZA ATACADISTA DE CALCADO','DONA LUIZA ATACADISTA DE CALCADO NOVO'),true);
  assert.equal(isNamePrefix('DONA LUIZA','DONA LUIZA ATACADISTA DE CALCADOS LTDA'),false);
  assert.equal(isNamePrefix('CARLOS EDUARDO SILVA','CARLOS EDUARDO SOUZA LTDA'),false);
  assert.equal(resolveIdentity('','DONA LUIZA ATACADISTA DE CALCADO',new Map([['SENDER:DONA LUIZA ATACADISTA DE CALCADO','cus_dona']])).customerId,'cus_dona');
});
