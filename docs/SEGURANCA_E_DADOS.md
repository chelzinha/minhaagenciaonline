# SEGURANCA_E_DADOS

Documento tecnico em preparacao.

## Apps Script e arquivos locais

Os arquivos .clasp.json foram ignorados via .gitignore para evitar exposicao de identificadores locais dos projetos Apps Script.

Antes do commit inicial dos Apps Script, foi realizada verificacao por termos sensiveis como token, secret, senha, password, api_key, client_secret, authorization, bearer, credencial, private_key, CWS e NUVEMSHOP.

Resultado informado: apareceram apenas referencias a nomes de variaveis/funcoes, sem segredo real identificado.

## Modulo Reverso - atencao de seguranca e dados

Tipo de atencao:
- Endpoint Web App usado pelo frontend.
- Actions publicas recebidas pelo backend.
- Planilhas com possiveis dados pessoais, historico operacional e rastreio.

Cuidados obrigatorios:
- Nao registrar URL completa de Web App em documentacao.
- Nao registrar ID completo de planilha.
- Nao registrar token, senha, chave ou segredo.
- Nao registrar payload completo com dados reais.
- Evitar logs com CPF, telefone, e-mail ou dados de cliente completos.

Validacoes recomendadas:
- Cada action deve validar payload.
- Cada action deve validar usuario e unidade quando aplicavel.
- Operacoes de escrita devem validar permissao e estado atual do registro.
- Respostas ao frontend devem retornar apenas os dados necessarios.

## Modulo /app - seguranca e dados sensiveis

Tipo de atencao:
- SPA/PWA publica acessivel em /app/.
- Login proprio pelo backend Apps Script de etiquetas.
- Sessao armazenada no navegador em localStorage.
- Web App principal de etiquetas exposto para chamadas do frontend.
- Web App separado para importacao de NF-e/DANFE em PDF.
- Dados pessoais, fiscais e operacionais trafegam entre frontend, Apps Script, Google Sheets, Google Drive e Correios/CWS.

Pontos sensiveis identificados:
- URL completa do Web App principal nao deve ser reproduzida em documentacao.
- URL completa do Web App de NF-e nao deve ser reproduzida em documentacao.
- IDs completos de planilha, pasta Drive ou arquivos Drive nao devem ser reproduzidos em documentacao.
- Tokens, senhas, credenciais Correios/CWS, secrets e sessionToken nao devem ser registrados em docs, logs ou exemplos.
- CPF, CNPJ, telefone, e-mail, endereco, NF-e, DANFE, rastreio e PDF sao dados sensiveis ou operacionais.

Riscos tecnicos:
- Sessao em localStorage facilita o PWA estatico, mas aumenta impacto de qualquer XSS.
- Origem CORS permissiva em Apps Script exige validacao forte de action, sessao e payload.
- Web App de NF-e em modo sem autenticacao, quando usado para teste, nao deve permanecer permissivo em producao.
- Logs de erro podem expor payloads se nao forem truncados e filtrados.
- Compartilhamento ou recuperacao de PDF no Drive deve evitar exposicao indevida.

Cuidados obrigatorios:
- Nao colar URLs completas de Web App em README, docs ou changelog.
- Nao colar IDs reais de planilha, Drive ou arquivo.
- Nao usar dados reais de cliente como exemplo.
- Validar sessao antes de actions privadas.
- Retornar ao frontend apenas campos necessarios para a tela.
- Mascarar ou omitir dados pessoais em logs, diagnosticos e mensagens de erro.
- Revisar qualquer mudanca em importacao de NF-e antes de publicar.

Validacoes recomendadas:
- Conferir se actions privadas rejeitam chamada sem sessionToken.
- Conferir se cancelamento, reimpressao e historico pertencem ao cliente logado.
- Conferir se diagnostico nao retorna segredo, token completo ou credencial.
- Conferir se o extrator de NF-e valida a sessao do app em ambiente de producao.

## Checklist de seguranca - /app Minhas Postagens

Objetivo:
- Validar pontos sensiveis do /app sem expor URLs completas, IDs reais, tokens, credenciais ou dados reais.
- Usar somente contas, registros e arquivos de teste autorizados.
- Registrar evidencias de teste de forma anonima, sem prints com dados pessoais.

### Prioridade critica

- [ ] Web App de NF-e/DANFE exige autenticacao em producao.
  - Atencao sensivel: SIM.
  - Risco: importacao de PDF fiscal sem validacao de sessao pode expor processamento indevido de documentos fiscais.
  - Como testar com seguranca: usar usuario de teste, PDF de teste sem dado real e confirmar que chamada sem sessao valida e recusada.
  - Nao registrar: URL completa do Web App, PDF real, chave de NF-e, CPF/CNPJ, token ou resposta completa.

- [ ] Actions privadas do Web App principal recusam chamadas sem sessao.
  - Atencao sensivel: SIM.
  - Risco: acesso indevido a historico, destinatarios, reimpressao, cancelamento, diagnostico ou emissao.
  - Como testar com seguranca: em ambiente controlado, chamar uma action privada com sessionToken vazio ou invalido e confirmar erro seguro.
  - Nao registrar: URL completa, sessionToken, payload real ou dados retornados.

- [ ] Diagnostico nao retorna segredo, token completo ou credencial Correios/CWS.
  - Atencao sensivel: SIM.
  - Risco: vazamento de credenciais operacionais ou dados de contrato.
  - Como testar com seguranca: executar diagnostico com usuario autorizado e verificar apenas se campos sensiveis aparecem mascarados, booleanos ou omitidos.
  - Nao registrar: credenciais, contrato completo, cartao completo, token CWS ou resposta integral.

- [ ] Reimpressao, cancelamento e historico pertencem ao cliente logado.
  - Atencao sensivel: SIM.
  - Risco: usuario acessar, cancelar ou reimprimir etiqueta de outro cliente.
  - Como testar com seguranca: usar dois usuarios de teste e verificar se um nao acessa registros do outro.
  - Nao registrar: IDs reais de etiquetas, PDFs reais, rastreios reais ou dados de cliente.

### Prioridade alta

- [ ] Logs nao gravam dados pessoais completos.
  - Atencao sensivel: SIM.
  - Risco: CPF/CNPJ, telefone, e-mail, endereco, NF-e, payload ou PDF ficarem persistidos em log.
  - Como testar com seguranca: provocar erro controlado com dados ficticios e revisar se o log esta truncado e sem dado pessoal completo.
  - Nao registrar: conteudo bruto de log, payload completo ou dados reais.

- [ ] Payloads de emissao, destinatarios e NF-e sao validados antes de processar.
  - Atencao sensivel: SIM.
  - Risco: dados invalidos gerarem etiqueta errada, registro inconsistente ou erro em Apps Script/Correios.
  - Como testar com seguranca: usar payloads ficticios incompletos e confirmar mensagens de validacao sem gravacao indevida.
  - Nao registrar: payload real, documento real ou endereco real.

- [ ] Google Drive nao expoe PDFs indevidamente.
  - Atencao sensivel: SIM.
  - Risco: etiqueta, declaracao ou PDF fiscal acessivel por pessoa sem permissao.
  - Como testar com seguranca: gerar PDF de teste e verificar permissao/acesso usando conta sem autorizacao.
  - Nao registrar: link completo do Drive, fileId, conteudo do PDF ou dados de postagem.

- [ ] Planilhas nao retornam colunas alem do necessario ao frontend.
  - Atencao sensivel: SIM.
  - Risco: frontend receber credenciais, dados internos ou campos que nao precisa exibir.
  - Como testar com seguranca: revisar resposta de telas com usuario de teste e confirmar minimizacao de dados.
  - Nao registrar: resposta completa, ID de planilha ou dados reais.

- [ ] Credenciais Correios/CWS permanecem apenas no backend.
  - Atencao sensivel: SIM.
  - Risco: credenciais vazarem para frontend, logs, diagnostico ou documentacao.
  - Como testar com seguranca: pesquisar no frontend por termos sensiveis e confirmar que nao ha credenciais reais.
  - Nao registrar: valor de token, login, senha, cartao ou contrato completo.

### Prioridade media

- [ ] Sessao em localStorage tem limpeza segura no logout e em sessao invalida.
  - Atencao sensivel: SIM.
  - Risco: sessao antiga permanecer no navegador compartilhado.
  - Como testar com seguranca: entrar com usuario de teste, sair, recarregar a pagina e confirmar que volta ao login.
  - Nao registrar: token salvo ou dados do cliente.

- [ ] Mensagens de erro sao humanas e nao revelam detalhes internos.
  - Atencao sensivel: SIM.
  - Risco: erro expor nome de funcao, stack trace, payload, URL, ID ou credencial.
  - Como testar com seguranca: simular falha de login, falha de PDF e falha de action privada com dados ficticios.
  - Nao registrar: stack trace completo ou resposta bruta.

- [ ] Importacao CSV de destinatarios evita dados reais em teste e respeita criterio de atualizacao.
  - Atencao sensivel: SIM.
  - Risco: atualizar destinatario errado por criterio de upsert ou importar base real por engano.
  - Como testar com seguranca: usar CSV pequeno, ficticio e identificado como teste.
  - Nao registrar: arquivo real de clientes ou dados pessoais.

- [ ] Service worker nao mantem versao antiga apos mudanca sensivel.
  - Atencao sensivel: NAO, exceto quando envolver correcao de seguranca.
  - Risco: usuario continuar usando JS/CSS antigo depois de deploy.
  - Como testar com seguranca: apos deploy autorizado, limpar cache ou testar em janela anonima e conferir versao esperada.
  - Nao registrar: nenhuma informacao sensivel.

### Prioridade baixa

- [ ] Documentacao e changelog nao contem valores sensiveis.
  - Atencao sensivel: SIM.
  - Risco: segredo ou dado real entrar no Git por descuido.
  - Como testar com seguranca: pesquisar por padroes de Web App, IDs, token, senha, CPF/CNPJ e e-mails reais antes de commit.
  - Nao registrar: valor encontrado; se houver achado real, remover antes de qualquer commit.

- [ ] Checklists de teste usam usuarios, PDFs, CSVs e etiquetas ficticias.
  - Atencao sensivel: SIM.
  - Risco: evidencia de teste expor cliente real.
  - Como testar com seguranca: manter massa de teste anonima e descartar prints com dados pessoais.
  - Nao registrar: prints com dados reais, rastreios reais ou PDFs reais.

- [ ] Links de suporte e mensagens publicas nao expõem dados internos.
  - Atencao sensivel: NAO, desde que sejam canais publicos autorizados.
  - Risco: tela publica revelar informacao operacional desnecessaria.
  - Como testar com seguranca: revisar telas publicas e mensagens sem usar conta real.
  - Nao registrar: dados internos ou detalhes de configuracao.

## Mapa de sensibilidade das actions - /app

Critico:
- criarEtiqueta, criarEtiquetaDireta e parseNfePdf.
- Motivo: envolvem emissao, NF-e/DANFE, PDF, dados fiscais, destinatario, Drive e Correios/CWS.

Alto:
- login, me, cancelarEtiqueta, reimprimirEtiqueta, listarHistorico, detalheEtiqueta, buscarDestinatarios, listarDestinatarios, salvarDestinatario, excluirDestinatario, importarDestinatariosCsv, testarTokenCws e diagnostico.
- Motivo: envolvem sessao, credenciais, dados pessoais, historico, PDFs, CWS ou permissao do cliente.

Medio:
- cep, cotar, cotarTodos e rastrearObjeto.
- Motivo: envolvem endereco, parametros de envio, rastreio e chamadas externas.

Baixo:
- ping.
- Motivo: deve retornar apenas saude do servico, sem dados pessoais ou credenciais.

Cuidados obrigatorios no mapa de payloads:
- Usar somente nomes genericos de campos.
- Nao colar payload bruto de navegador, Apps Script ou planilha.
- Nao colar resposta integral de Web App.
- Nao registrar URL completa, ID real, token, senha, credencial, PDF, NF-e ou dado pessoal.
- Ao revisar logs ou diagnostico, copiar apenas conclusoes anonimas.
