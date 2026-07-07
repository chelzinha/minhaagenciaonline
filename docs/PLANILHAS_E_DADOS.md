# PLANILHAS_E_DADOS

Documento tecnico em preparacao.

## Planilha APP Total CF + Metro - CRM, agenda, midias e manuais

Documento principal:
- `docs/PLANILHA_APP_TOTAL_CF_METRO.md`

Resumo:
- A planilha APP Total CF + Metro deve ser tratada como fonte viva das regras operacionais do CRM, agenda, visitas, materiais e manuais.
- O codigo deve ler, validar, cachear e executar regras vindas da planilha sempre que elas forem parametrizaveis.
- O Codex nao deve substituir regra parametrizada por valor fixo sem justificativa documentada.

Distincao importante:
- `MIDIAS_CRM` e a biblioteca estrategica de conteudos usados pelas acoes do CRM.
- `Manuais` e a biblioteca ampla da tela `/intra/manuais/`.
- `Manuais` pode incluir conteudos proprios e tambem conteudos vinculados ou equivalentes a `MIDIAS_CRM`.
- `Manuais` nao substitui `MIDIAS_CRM`, e `MIDIAS_CRM` nao representa todo o escopo de `Manuais`.

Abas principais ja identificadas pelo codigo ou pela Rachel:
- BASE_TOTAL
- CLIENTES_MASTER
- CLIENTES_ALIAS
- AGENDA_BLOCOS
- AGENDA_EXECUCAO
- CRM_INTERACOES
- MIDIAS_CRM
- Manuais
- PROSPECTS
- CRM_VISITA_CHECKLIST
- CLIENTES_CADASTRO
- CLIENTES_ACESSOS_APP
- CLIENTES_CREDENCIAIS_CWS
- CRM_TRATATIVAS
- CRM_FUNIS
- CRM_FUNIL_ETAPAS
- CRM_TIPOS_ATIVIDADE
- CRM_RESULTADOS_ATIVIDADE
- CRM_EVENTOS
- CRM_RESPONSAVEIS
- CRM_TRANSICOES
- CRM_SEGMENTOS
- CRM_LOCAIS

Regra para a aba Manuais:
- A tela `/intra/manuais/` deve ser alimentada pela aba `Manuais` da planilha APP Total CF + Metro.
- A estrutura esperada usa `ID`, `CATEGORIA`, `ORDEM_C`, `ICONE_CATEGORIA`, `TITULO`, `DESCRICAO`, `FORMATO`, `LINK` e coluna de ordem do item quando existir.
- Para vincular conteudos a acao/filtro de cliente, usar colunas opcionais como `ORIGEM_CONTEUDO`, `MIDIA_CRM_ID`, `ACAO_CRM`, `SUB_ACAO`, `PUBLICO`, `FILTRO_CLIENTE`, `CURVA`, `STATUS_ATIVIDADE`, `PERFIL_COMERCIAL`, `BUCKET_NEGOCIO`, `RECORRENCIA_NIVEL`, `TENDENCIA`, `NIVEL_ALERTA`, `PORTE_OPERACIONAL`, `TEM_CONTRATO` e `CANAL_SUGERIDO`.

Regra para a aba CRM_LOCAIS:
- Esta secao documenta uma correcao funcional ja aplicada na branch `redesign-crm`.
- A aba `CRM_LOCAIS` e unica e atende CRM/clientes e Prospects.
- A coluna `EXIBIR_EM` define onde cada local aparece.
- Valores aceitos em `EXIBIR_EM`: `CRM`, `PROSPECTS`, `CRM;PROSPECTS`, `AMBOS` e `TODOS`.
- `EXIBIR_EM=CRM` alimenta filtros e configuracoes de CRM/clientes.
- `EXIBIR_EM=PROSPECTS` alimenta filtros e cadastro de Prospects.
- `CRM;PROSPECTS`, `AMBOS` e `TODOS` podem alimentar os dois contextos.
- Nao existe aba separada `PROSPECTS_LOCAIS`.
- Nao recriar a constante `PROSPECTS_LOCAIS`.
- O objetivo e evitar regressao em que locais de clientes, como CF e METRO, aparecam em Prospects.
- Prospects devem usar locais como ESTACAO FASHION, SHOPPING PARANGABA e REVERSA quando configurados com `EXIBIR_EM=PROSPECTS`.
- Exemplos e testes documentados nao devem usar dados sensiveis reais.

Cuidados:
- Nao documentar IDs completos de planilha, links privados reais, tokens ou dados de clientes.
- Antes de alterar cabecalhos, revisar Apps Script, frontend, cache e endpoints afetados.
- Alteracoes nesta planilha podem impactar CRM, agenda, visitas, diagnostico, manuais e recomendacao de materiais.

## CRM - importacao em lote pela planilha

Documento principal:
- `docs/CRM_IMPORTACAO_LOTE_PLANILHA.md`

Abas afetadas:
- `PROSPECTS`
- `CLIENTES_CADASTRO`
- `CRM_TRATATIVAS`
- `CRM_EVENTOS`
- `CRM_RESPONSAVEIS`

Colunas auxiliares adicionadas em `PROSPECTS` e `CLIENTES_CADASTRO`:
- `SUBIR_FRONT`
- `STATUS_IMPORTACAO_CRM`
- `IMPORTADO_EM`
- `ERRO_IMPORTACAO_CRM`

Regra de processamento:
- Linhas novas sem `PROSPECT_ID` ou sem `CLIENTE_ID` podem ser processadas pelo menu `🚀 CRM > Subir aba atual para o front`.
- Linhas existentes so devem ser reprocessadas quando `SUBIR_FRONT = SIM`.
- Apos processar, a rotina marca `SUBIR_FRONT = NAO` e `STATUS_IMPORTACAO_CRM = IMPORTADO`.
- A rotina cria ou reaproveita tratativa aberta/pausada em `CRM_TRATATIVAS` e grava `TRATATIVA_ATIVA_ID` na entidade.

Cuidados de regressao:
- Nao alterar os nomes das colunas auxiliares sem revisar `apps-script/base-metro/11_CRM_IMPORTACAO_LOTE_MENU.js`.
- Nao processar automaticamente todas as linhas antigas da base; usar `SUBIR_FRONT = SIM` para casos especificos.
- Clientes em `CLIENTES_CADASTRO` dependem da regra de overlay para aparecerem completos em `CLIENTES_MASTER`.
- Testes e documentacao nao devem conter dados reais de cliente/prospect.

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

## Modulo /app - relacao actions x dados

Actions com impacto direto em planilhas:
- login, me e logout usam CLIENTES_APP e cache de sessao.
- listarHistorico, detalheEtiqueta, reimprimirEtiqueta e cancelarEtiqueta dependem de HISTORICO_ETIQUETAS.
- criarEtiqueta e criarEtiquetaDireta gravam/atualizam HISTORICO_ETIQUETAS e podem salvar PDFs no Drive.
- buscarDestinatarios, listarDestinatarios, salvarDestinatario, excluirDestinatario e importarDestinatariosCsv dependem de DESTINATARIOS.
- testarTokenCws e diagnostico consultam cadastro/configuracoes do cliente e dados Correios/CWS.
- cotar, cotarTodos, cep e rastrearObjeto usam dados do cliente para chamadas Correios/CWS e nao devem gravar dados operacionais sem necessidade.
- parseNfePdf usa PDF externo e pode alimentar payload de destinatario, NF-e e declaracao antes de salvar ou emitir.

Dados sensiveis por grupo de action:
- Autenticacao: login, senha, sessionToken e client.
- Cotacao/CEP: CEP, dimensoes, peso, valor declarado e opcionais.
- Emissao: destinatario, CPF/CNPJ, endereco, NF-e, declaracao, etiqueta, PDF e rastreio.
- Historico: idRegistro, status, codigoObjeto, PDFs, destinatario, valores e erros.
- Destinatarios: nome, CPF/CNPJ, telefone/celular, e-mail, CEP e endereco.
- Configuracao/CWS: contrato, cartao, credenciais, autorizacoes e diagnostico.

Riscos se payload ou resposta mudar:
- Campos de destinatario quebram autocomplete, importacao CSV, NF-e e emissao.
- Campos de historico quebram reimpressao, cancelamento, rastreio e tela de sucesso.
- Campos de PDF/Drive quebram download, preview e recuperacao de documentos.
- Campos de CWS quebram cotacao, emissao e diagnostico.
- Mudanca em criterio de upsert pode atualizar ou excluir destinatarios incorretos.

Regra de documentacao:
- Qualquer mudanca futura em action, payload, resposta, aba ou cabecalho deve atualizar este documento e o mapa de actions em docs/APPS_SCRIPT.md.
