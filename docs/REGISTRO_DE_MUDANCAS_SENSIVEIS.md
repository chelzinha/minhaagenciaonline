# REGISTRO_DE_MUDANCAS_SENSIVEIS

Documento tecnico em preparacao.

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
