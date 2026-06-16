# PLANILHAS_E_DADOS

Documento tecnico em preparacao.

## Modulo Reverso - dados e planilhas

Base operacional:
- Google Sheets usado como base operacional do modulo Reverso.
- Apps Script em apps-script/logistica acessa abas por getSheetByName().
- A estrutura depende de nomes de abas e cabecalhos.

Arquivos relacionados:
- apps-script/logistica/01_SetupSheets.gs: estrutura inicial, abas e cabecalhos.
- apps-script/logistica/02_SupportData.gs: listas auxiliares, parametros e validacoes.
- apps-script/logistica/03_Core.gs: regras centrais do Reverso.
- apps-script/logistica/04_Api.gs: entrada API e funcoes de consulta/resposta ao frontend.

Funcoes que exigem atencao em dados:
- reversaReadEtiqueta(payload)
- reversaConfirmDropoff(payload)
- apiGetUserHistory_(req)
- apiGetDashboard_(req)
- apiGetUnitStatus_(req)

Cuidados:
- Nao alterar nomes de abas ou cabecalhos sem mapear impacto.
- Nao registrar IDs completos de planilhas em documentacao publica do repositorio.
- Documentar qualquer nova aba, coluna ou status antes de alterar codigo.
- Avaliar dados pessoais e operacionais antes de expor resposta ao frontend.

## Modulo /app - planilhas e dados

Base operacional:
- O /app usa Google Sheets como base principal por meio do Apps Script em apps-script/etiquetas.
- A mesma planilha principal tambem e citada como base do /balcao.
- O modulo /superfrete usa planilha propria separada e nao deve substituir a base do /app.

Abas principais identificadas:
- CLIENTES_APP
- CONFIG_APP
- LISTAS_APP
- HISTORICO_ETIQUETAS
- DESTINATARIOS
- LOG_APP

Dados tratados pelo /app:
- Credenciais de login do cliente no app.
- Dados do remetente configurado para postagem.
- Dados de contrato, cartao de postagem e configuracoes Correios/CWS.
- Dados de destinatarios: nome, CPF/CNPJ, telefone/celular, e-mail, CEP e endereco.
- Dados de cotacao, servico, preco, prazo, peso e dimensoes.
- Dados de etiqueta, prepostagem, rastreio, status, PDFs e historico.
- Dados de NF-e/DANFE importados para preencher envio e declaracao.

Modelo de importacao:
- frontend/app/modelos/modelo_importacao_destinatarios.csv define campos esperados para importacao de destinatarios.

Dependencias sensiveis:
- A configuracao real de planilha e Drive fica no Apps Script.
- IDs completos de planilha e pasta Drive nao devem ser copiados para documentacao.
- Payloads reais de clientes, NF-e, destinatarios ou historico nao devem ser usados como exemplo em docs.

Riscos de regressao em dados:
- Alterar nomes de abas ou cabecalhos quebra leitura e escrita do Apps Script.
- Alterar formato de campos de CPF/CNPJ, CEP, telefone, valores ou status pode quebrar validacoes e historico.
- Alterar colunas de historico pode afetar reimpressao, cancelamento, rastreio e recuperacao de PDF.
- Importacao em lote de destinatarios pode gerar atualizacoes indevidas se os criterios de upsert mudarem.

Cuidados recomendados:
- Antes de alterar dados, mapear onde a aba/cabecalho e usado no Apps Script e no frontend.
- Preferir operacoes em lote em Apps Script.
- Usar exemplos anonimizados e sem dados reais.
- Documentar qualquer nova aba, coluna, status ou payload antes da alteracao funcional.
