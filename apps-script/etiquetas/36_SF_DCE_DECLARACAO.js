/**
 * AGF SUPERFRETE — 36_SF_DCE_DECLARACAO.gs
 * Regras e validação dos dados de DC-e/DACE.
 *
 * A documentação pública da SuperFrete informa que a DC-e é gerada no
 * mesmo fluxo da etiqueta e usa: dados do remetente, dados do destinatário
 * com CPF/CNPJ e itens/produtos com descrição, quantidade e valor.
 *
 * O formato exato do payload API deve ser confirmado em Sandbox antes da
 * Etapa 2. Este módulo deixa os dados padronizados para montagem futura.
 */

function sfValidateDeclaracaoConteudo_(payload) {
  const erros = [];
  const itens = (payload && payload.itens) || (payload && payload.products) || [];
  const destinatario = (payload && payload.destinatario) || (payload && payload.to) || {};
  const remetente = (payload && payload.remetente) || (payload && payload.from) || {};

  if (!sfNormalizeDoc_(destinatario.documento || destinatario.cpf_cnpj || destinatario.cpf || destinatario.cnpj)) {
    erros.push('Destinatário precisa ter CPF/CNPJ para DC-e.');
  }

  if (!sfNormalizeDoc_(remetente.documento || remetente.cnpj_cpf || remetente.cpf_cnpj || remetente.cpf || remetente.cnpj)) {
    erros.push('Remetente precisa ter CPF/CNPJ para DC-e.');
  }

  if (!Array.isArray(itens) || itens.length === 0) {
    erros.push('Informe pelo menos 1 item na declaração de conteúdo.');
  } else {
    itens.forEach(function (item, idx) {
      const n = idx + 1;
      if (!sanitize_(item.descricao || item.description || item.name)) erros.push('Item ' + n + ': descrição obrigatória.');
      if (sfToMoney_(item.quantidade || item.quantity) <= 0) erros.push('Item ' + n + ': quantidade precisa ser maior que zero.');
      if (sfToMoney_(item.valor_unitario || item.unitary_value || item.unit_value || item.price) <= 0) erros.push('Item ' + n + ': valor unitário precisa ser maior que zero.');
    });
  }

  return {
    ok: erros.length === 0,
    erros: erros,
    totalItens: Array.isArray(itens) ? itens.length : 0,
    valorTotal: sfToMoney_((Array.isArray(itens) ? itens : []).reduce(function (acc, item) {
      const qtd = sfToMoney_(item.quantidade || item.quantity);
      const unit = sfToMoney_(item.valor_unitario || item.unitary_value || item.unit_value || item.price);
      return acc + (qtd * unit);
    }, 0))
  };
}

function sfNormalizeDeclaracaoItens_(itens) {
  if (!Array.isArray(itens)) return [];
  return itens.map(function (item, idx) {
    const qtd = sfToMoney_(item.quantidade || item.quantity);
    const unit = sfToMoney_(item.valor_unitario || item.unitary_value || item.unit_value || item.price);
    return {
      ITEM_SEQ: idx + 1,
      DESCRICAO: sanitize_(item.descricao || item.description || item.name),
      QUANTIDADE: qtd,
      VALOR_UNITARIO: unit,
      VALOR_TOTAL: sfToMoney_(qtd * unit),
      UNIDADE: sanitize_(item.unidade || item.unit) || 'UN',
      NCM_OPCIONAL: sanitize_(item.ncm || item.NCM_OPCIONAL),
      PESO_APROX_G: sfToMoney_(item.peso_aprox_g || item.weight_g),
      OBS: sanitize_(item.obs || item.note)
    };
  });
}

function action_sfValidateDcePayload_(params) {
  const user = sfGetSession_(params.sessionToken);
  const validation = sfValidateDeclaracaoConteudo_(params);
  return {
    user: user.USUARIO_ID,
    validation: validation,
    itensNormalizados: sfNormalizeDeclaracaoItens_(params.itens || params.products || [])
  };
}
