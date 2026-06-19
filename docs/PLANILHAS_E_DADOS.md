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

## Modulo Atende - planilha de postagens

Abas esperadas criadas por `setupInicial()`:
- `CONFIG`
- `RAW_ATENDIMENTOS`
- `RAW_OBJETOS_CAPTADOS`
- `Postagens`
- `EVENTOS_OBJETOS`
- `LOG_IMPORTACOES`
- `ERROS`

Aba principal:
- `Postagens` e a fonte do front `/atende`.
- `Objeto` e a chave anti-duplicidade.
- O JSON de atendimentos cria a base por item postal.
- O JSON de objetos captados enriquece dados pelo `codObjeto`.

Campos obrigatorios de `Postagens`:
- Data
- Atendente
- Objeto
- codigo
- descricao
- Categoria
- Contrato
- Cartão Postagem
- Remetente
- Rem. Documento
- Valor
- Forma Pagamento
- Peso (kg)
- Larg. (cm)
- Comp. (cm)
- Alt. (cm)
- Diâm. (cm)
- VD
- Formato
- Rem. CEP
- Rem. Logradouro
- Rem. Número
- Rem. Comp
- Rem. Bairro
- Rem. Cidade
- Rem. UF
- Rem. Telefone
- Dest. Nome
- Dest. Documento
- Dest. CEP
- Dest. Logradouro
- Dest. Número
- Dest. Complemento
- Dest. Bairro
- Dest. Cidade
- Dest. UF
- Tipo Postagem
- Status
- Prev. Entrega
- tipo
- formaPagamento
