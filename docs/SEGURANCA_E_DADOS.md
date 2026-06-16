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
