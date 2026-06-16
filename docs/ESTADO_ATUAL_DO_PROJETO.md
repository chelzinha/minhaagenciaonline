# Estado atual do projeto

Este documento registra a situacao tecnica atual do repositorio minhaagenciaonline.

Objetivo: manter uma visao clara do que ja foi organizado, versionado, documentado e do que ainda precisa ser mapeado.

## 1. Repositorio

Repositorio principal:

- chelzinha/minhaagenciaonline

Branch de producao:

- main

Site principal:

- www.minhaagenciaonline.com.br

Hospedagem:

- Netlify conectado ao GitHub

## 2. Estrutura local usada por Rachel

Pasta principal:

- G:\Meu Drive\___AGF-Codex

Repositorio local:

- G:\Meu Drive\___AGF-Codex\01_REPOS_GITHUB\minhaagenciaonline

Origem local dos Apps Script antes da copia:

- G:\Meu Drive\___BASE AGF\AppsScript minhaagenciaonline

## 3. O que ja esta versionado

Ja estao versionados no GitHub:

- frontend atual do site
- estrutura de documentacao tecnica
- Apps Script do projeto
- .gitignore protegendo .clasp.json
- rotina segura de trabalho
- mapa tecnico dos modulos
- mapa de chamadas do frontend
- cruzamento inicial entre modulos e chamadas
- mapa de dados e planilhas
- mapa de credenciais e acessos sem segredos

## 4. Frontend

Frontend versionado em:

- frontend/reverso
- frontend/reverso-admin
- frontend/reverso-coleta
- frontend/reverso-expedicao
- frontend/superfrete-admin
- frontend/balcao
- frontend/agf
- frontend/shared

Status:

- publicado via Netlify a partir da branch main
- preservar estrutura atual antes de qualquer refatoracao
- revisar UX/UI e mobile antes de mudancas visuais

## 5. Apps Script

Apps Script versionados em:

- apps-script/autenticacao
- apps-script/base-metro
- apps-script/logistica
- apps-script/atende
- apps-script/base-cliente-etiquetas
- apps-script/caixa
- apps-script/cep
- apps-script/etiquetas
- apps-script/nf
- apps-script/nuvemshop
- apps-script/sla

Status:

- copiados para o repositorio
- .clasp.json ignorados pelo Git
- varredura inicial por termos sensiveis realizada
- documentacao inicial criada

## 6. Documentos tecnicos principais

Documentos existentes ou criados:

- README.md
- CHANGELOG.md
- VERSION.md
- AGENTS.md
- docs/ROTINA_SEGURA.md
- docs/MAPA_MODULOS.md
- docs/MAPA_CHAMADAS_FRONTEND.md
- docs/CRUZAMENTO_MODULOS_E_CHAMADAS.md
- docs/MAPA_DE_DADOS.md
- docs/CREDENCIAIS_E_ACESSOS_SEM_SEGREDOS.md
- docs/APPS_SCRIPT.md
- docs/FRONTEND.md
- docs/PLANILHAS_E_DADOS.md
- docs/PERFORMANCE.md
- docs/SEGURANCA_E_DADOS.md
- docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md
- docs/DEPLOY.md
- docs/TESTES.md
- docs/ARQUITETURA.md
- docs/FLUXOS.md
- docs/DECISOES_TECNICAS.md

## 7. Seguranca e dados

Status atual:

- .clasp.json ignorados
- nao registrar tokens, senhas, chaves ou secrets no GitHub
- nao registrar dados reais de clientes na documentacao
- mudancas sensiveis devem atualizar docs/SEGURANCA_E_DADOS.md
- mudancas sensiveis devem atualizar docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md

Atencao sensivel:

- CWS / Correios
- Nuvemshop
- NF / DANFE
- dados de clientes
- CPF, CNPJ, telefone, email e endereco
- rastreios
- dados financeiros ou fiscais
- PropertiesService
- Web Apps e permissoes

## 8. Performance

Pontos conhecidos:

- muitos fluxos dependem de Google Sheets
- telas podem ficar lentas se carregarem dados demais
- antes de otimizar, mapear chamada, Apps Script, planilha, abas e volume de dados

Estrategias recomendadas:

- CacheService
- leitura em lote com getValues
- escrita em lote com setValues
- dados resumidos
- paginacao
- carregamento progressivo
- abas-cache
- abas-resumo
- JSON enxuto para o frontend

## 9. Pendencias principais

- Confirmar qual frontend chama qual Apps Script.
- Confirmar quais Web Apps estao em producao.
- Confirmar quais planilhas cada Apps Script acessa.
- Confirmar abas e colunas principais por modulo.
- Confirmar dados sensiveis por modulo.
- Confirmar gargalos de performance por tela.
- Confirmar quais modulos sao producao, teste ou legado.
- Revisar UX/UI modulo por modulo.
- Definir prioridade do primeiro modulo a melhorar.

## 10. Proximo passo tecnico recomendado

Proximo passo recomendado:

- escolher um modulo para auditoria completa

Ordem sugerida:

1. reverso
2. reverso-admin
3. superfrete-admin
4. balcao
5. nuvemshop
6. etiquetas

Para cada modulo, seguir:

1. mapear tela principal
2. mapear arquivos JS
3. mapear chamadas externas
4. mapear Apps Script
5. mapear planilhas
6. revisar dados sensiveis
7. revisar performance
8. revisar UX/UI
9. documentar
10. commitar

## 11. Status

Ambiente tecnico inicial organizado, versionado e documentado.

Projeto pronto para iniciar auditoria tecnica por modulo, sem misturar com governanca institucional.
