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
