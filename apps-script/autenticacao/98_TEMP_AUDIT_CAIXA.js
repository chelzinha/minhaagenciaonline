function AAA_AUDITAR_CAIXA_AGORA() {
  var resultado = auditarAcessoCaixaBalcaoV2();
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}