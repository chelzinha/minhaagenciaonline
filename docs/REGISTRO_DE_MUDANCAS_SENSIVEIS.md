# REGISTRO_DE_MUDANCAS_SENSIVEIS

Documento tecnico em preparacao.

## 2026-07-07 - Instrumentacao de performance do CRM

### Atencao sensivel
Foram adicionados logs tecnicos opcionais para medir performance do CRM.

### O que e registrado
- Tempo em ms por etapa.
- Nome tecnico da etapa.
- Quantidades agregadas.
- Tamanho aproximado da resposta.
- View/subview.

### O que nao e registrado
- CPF/CNPJ.
- Telefone.
- E-mail.
- Endereco.
- Nome de cliente/prospect.
- Tokens ou credenciais.
- Conteudo completo das respostas.

### Arquivos envolvidos
- `frontend/crm/app.js`
- `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`
- `apps-script/base-metro/10_OPERACAO_EXECUCAO_API.js`
## Registro sensivel - 2026-07-07 - CRM importacao em lote pela planilha

Tipo de mudanca:
- Criacao de rotina Apps Script para transformar cadastros manuais em entidades completas do CRM.

Modulo afetado:
- Planilha APP Total CF + Metro.
- Apps Script `apps-script/base-metro`.
- CRM/funil/jornada comercial.

Dados envolvidos:
- CPF/CNPJ.
- Nome de cliente/prospect.
- Telefone, WhatsApp e e-mail.
- Endereco cadastral.
- Responsavel comercial.
- Status de importacao, funil, etapa e tratativa.

Credenciais envolvidas:
- Nenhuma credencial nova.
- A rotina usa permissoes ja existentes do Apps Script sobre a planilha.

Valor sensivel exposto no documento?
- Nao.

Onde o dado/credencial fica armazenado:
- Dados cadastrais em `PROSPECTS` e `CLIENTES_CADASTRO`.
- Relacao de funil em `CRM_TRATATIVAS`.
- Eventos tecnicos em `CRM_EVENTOS`.

Arquivos alterados:
- `apps-script/base-metro/11_CRM_IMPORTACAO_LOTE_MENU.js`.
- `apps-script/base-metro/90_FILTROS.js`.
- `docs/CRM_IMPORTACAO_LOTE_PLANILHA.md`.
- `docs/PLANILHAS_E_DADOS.md`.
- `docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md`.
- `CHANGELOG.md`.

Commit/branch:
- Branch de trabalho: `feature/crm-importacao-lote-menu`.

Risco principal:
- Criar tratativas indevidas para linhas antigas.
- Expor dados reais em logs/documentacao.
- Cliente novo em `CLIENTES_CADASTRO` nao aparecer completo no card se overlay com `CLIENTES_MASTER` estiver desativado.
- Reprocessar cadastro manual sem necessidade.

Mitigacao aplicada:
- A rotina processa automaticamente apenas linhas novas sem ID ou linhas marcadas com `SUBIR_FRONT = SIM`.
- A rotina reaproveita tratativa aberta/pausada quando ja existir para a mesma entidade/funil.
- Erros sao gravados de forma curta em `ERRO_IMPORTACAO_CRM`, sem payload bruto.
- Documentacao usa apenas nomes de colunas e fluxos, sem dados reais.

Como testar:
- Usar linha ficticia em `PROSPECTS` sem `PROSPECT_ID`.
- Usar linha ficticia em `CLIENTES_CADASTRO` sem `CLIENTE_ID`.
- Confirmar preenchimento de IDs, `TRATATIVA_ATIVA_ID`, status de importacao e criacao de `CRM_TRATATIVAS`.
- Confirmar que linha antiga so e reprocessada se `SUBIR_FRONT = SIM`.
- Confirmar que logs/documentacao nao exibem CPF/CNPJ, telefone, e-mail ou endereco real.

Como reverter:
- Reverter a branch/commit antes de publicar.
- Se ja publicado no Apps Script, remover o arquivo `11_CRM_IMPORTACAO_LOTE_MENU.js`, restaurar `90_FILTROS.js` e executar `clasp push`.
- As colunas auxiliares podem permanecer sem afetar o front, mas devem ser removidas manualmente somente se a base estiver validada.

Observacao para consulta futura:
- Esta rotina nao habilita automaticamente overlay de `CLIENTES_CADASTRO` para `CLIENTES_MASTER`.

## Registro sensivel - 2026-07-03 - Nuvemshop apenas pedidos pagos

Tipo de mudanca:
- Ajuste de integracao, dados de pedidos e regra de elegibilidade para emissao.

Modulo afetado:
- /nuvem - Minhas Postagens Nuvemshop.
- apps-script/nuvemshop.

Dados envolvidos:
- Pedido Nuvemshop.
- Status de pagamento.
- Status do pedido.
- Nome, telefone e endereco de destinatario.
- Valor do pedido.
- Dados de rastreio e documentos de postagem.

Credenciais envolvidas:
- Token Nuvemshop armazenado em PropertiesService.
- Credenciais Correios/CWS usadas apenas pelo backend relacionado ao App de Postagens.

Valor sensivel exposto no documento?
- Nao.

Onde o dado/credencial fica armazenado:
- Dados operacionais em planilhas do conector.
- Credenciais em PropertiesService do Apps Script.

Arquivos alterados:
- frontend/nuvem/styles/base.css.
- frontend/nuvem/js/ui.js.
- frontend/nuvem/js/screens/pedidos.js.
- apps-script/nuvemshop/06_WEBHOOKS.gs.
- apps-script/nuvemshop/12_SYNC_PAID_ONLY.gs.
- apps-script/nuvemshop/98_FRONT_PAID_OVERRIDES.gs.

Commit:
- Branch de trabalho: codex/nuvem-paid-sync-ui.

Risco principal:
- Importar ou permitir emissao de etiqueta para pedido nao pago ou cancelado.
- Expor dados reais em logs ou documentacao.
- Alterar webhook de pedido sem rastreabilidade.

Mitigacao aplicada:
- Sincronizacao incremental busca apenas payment_status paid.
- Webhook passa por sync pago e ignora pedido cancelado ou sem pagamento confirmado.
- Frontend bloqueia selecao e botao de gerar etiqueta para item nao elegivel.
- Documentacao nao registra tokens, URLs completas, IDs reais, payloads brutos ou dados reais.

Como testar:
- Usar loja/usuario de teste.
- Sincronizar pedidos e confirmar que somente pedidos pagos aparecem na fila.
- Confirmar que pedido cancelado nao aparece como pronto para gerar.
- Confirmar que tentativa de gerar etiqueta em pedido nao pago retorna erro seguro no backend.
- Confirmar que logs nao exibem token, endereco completo em exemplos de documentacao ou payload bruto.

Como reverter:
- Reverter a branch/commit desta alteracao antes de publicar.
- Se ja publicado no Apps Script, restaurar versao anterior via clasp/Git e redeploy do Web App.

Observacao para consulta futura:
- Esta mudanca nao altera valores reais de token nem remove pedidos antigos da planilha. Ela impede nova importacao/geracao indevida e filtra a exibicao para pedidos pagos.

## 2026-06-16 - Versionamento inicial dos Apps Script

Mudanca sensivel registrada: os Apps Script do projeto foram adicionados ao repositorio GitHub.

Risco: exposicao acidental de identificadores, credenciais, tokens, URLs ou dados operacionais.

Controle aplicado: arquivos .clasp.json ignorados via .gitignore e verificacao inicial por termos sensiveis antes do commit.

Commit relacionado: badf763.

