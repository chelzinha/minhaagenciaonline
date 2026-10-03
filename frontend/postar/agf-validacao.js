/* =====================================================
   AGF - Validação de remetente e destinatário (fonte única)
   Usado em 3 lugares, sempre este mesmo arquivo:
   - /postar (cliente): validação na hora, campo a campo;
   - /balcao (atendente): padronização da ficha digitada no balcão;
   - Worker agf-balcao-api: validação final antes de gravar (o servidor não confia no navegador).
   Regras: texto em MAIÚSCULAS, sem acentos, espaços simples. E-mail em minúsculas.
   ===================================================== */
(function (root) {
  'use strict';

  var UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
  var LIMITES = { nome: 50, endereco: 50, numero: 8, complemento: 30, bairro: 50, cidade: 50, email: 60 };
  var ORDEM = ['documento', 'nome', 'celular', 'email', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
  var ROTULOS = { documento: 'CPF/CNPJ', nome: 'Nome', celular: 'Celular', email: 'E-mail', cep: 'CEP', endereco: 'Endereço',
    numero: 'Número', complemento: 'Complemento', bairro: 'Bairro', cidade: 'Cidade', uf: 'UF' };

  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  /** MAIÚSCULAS, sem acento, só caracteres seguros para etiqueta e sistemas dos Correios. */
  function texto(v) {
    return String(v == null ? '' : v)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[ºª°]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 .,\-\/&()']/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^ /, '');
  }
  function textoFinal(v) { return texto(v).trim(); }
  function email(v) { return String(v == null ? '' : v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function cpfValido(c) {
    c = digitos(c);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (var t = 9; t < 11; t++) {
      var s = 0;
      for (var i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
      var d = (s * 10) % 11 % 10;
      if (d !== Number(c[t])) return false;
    }
    return true;
  }
  function cnpjValido(c) {
    c = digitos(c);
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    var pesos = [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]];
    for (var k = 0; k < 2; k++) {
      var s = 0;
      for (var i = 0; i < pesos[k].length; i++) s += Number(c[i]) * pesos[k][i];
      var r = s % 11;
      if ((r < 2 ? 0 : 11 - r) !== Number(c[12 + k])) return false;
    }
    return true;
  }
  function formatarDocumento(v) {
    var d = digitos(v);
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    return d;
  }
  function formatarCep(v) { var d = digitos(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }
  function formatarCelular(v) {
    var d = digitos(v).slice(0, 11);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
  }

  /**
   * Valida e padroniza uma pessoa.
   * papel: 'remetente' (CPF/CNPJ obrigatório) ou 'destinatario' (CPF/CNPJ opcional).
   * @returns {{ok:boolean, dados:object, erros:Object<string,string>}}
   */
  function validarPessoa(p, papel) {
    p = p || {};
    var d = {
      documento: digitos(p.documento),
      nome: textoFinal(p.nome),
      celular: digitos(p.celular),
      email: email(p.email),
      cep: digitos(p.cep),
      endereco: textoFinal(p.endereco),
      numero: textoFinal(p.numero),
      complemento: textoFinal(p.complemento),
      bairro: textoFinal(p.bairro),
      cidade: textoFinal(p.cidade),
      uf: textoFinal(p.uf).replace(/[^A-Z]/g, '').slice(0, 2)
    };
    var e = {};
    if (!d.documento) { if (papel === 'remetente') e.documento = 'Informe o CPF ou CNPJ.'; }
    else if (d.documento.length === 11) { if (!cpfValido(d.documento)) e.documento = 'CPF inválido. Confira os números.'; }
    else if (d.documento.length === 14) { if (!cnpjValido(d.documento)) e.documento = 'CNPJ inválido. Confira os números.'; }
    else e.documento = 'CPF tem 11 números e CNPJ tem 14.';

    if (d.nome.replace(/[^A-Z]/g, '').length < 3) e.nome = 'Informe o nome completo.';
    if (d.celular && !/^[1-9]{2}\d{8,9}$/.test(d.celular)) e.celular = 'Celular com DDD, só números.';
    if (d.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(d.email)) e.email = 'E-mail inválido.';
    if (d.cep.length !== 8) e.cep = 'CEP precisa ter 8 números.';
    if (!d.endereco) e.endereco = 'Informe o endereço.';
    if (!d.numero) e.numero = 'Informe o número (ou S/N).';
    if (!d.bairro) e.bairro = 'Informe o bairro.';
    if (!d.cidade) e.cidade = 'Informe a cidade.';
    if (UFS.indexOf(d.uf) < 0) e.uf = 'UF inválida.';
    Object.keys(LIMITES).forEach(function (k) {
      if (!e[k] && d[k] && d[k].length > LIMITES[k]) e[k] = 'Máximo de ' + LIMITES[k] + ' caracteres.';
    });
    return { ok: Object.keys(e).length === 0, dados: d, erros: e };
  }

  /** Valor pronto para colar no sistema (CPF, CEP e celular só com números). */
  function valorParaColar(campo, v) {
    if (campo === 'documento' || campo === 'cep' || campo === 'celular') return digitos(v);
    return String(v == null ? '' : v);
  }
  function valorParaExibir(campo, v) {
    if (campo === 'documento') return formatarDocumento(v);
    if (campo === 'cep') return formatarCep(v);
    if (campo === 'celular') return formatarCelular(v);
    return String(v == null ? '' : v);
  }

  root.AgfValidacao = {
    UFS: UFS, LIMITES: LIMITES, ORDEM: ORDEM, ROTULOS: ROTULOS,
    digitos: digitos, texto: texto, textoFinal: textoFinal, email: email,
    cpfValido: cpfValido, cnpjValido: cnpjValido,
    formatarDocumento: formatarDocumento, formatarCep: formatarCep, formatarCelular: formatarCelular,
    validarPessoa: validarPessoa, valorParaColar: valorParaColar, valorParaExibir: valorParaExibir
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
