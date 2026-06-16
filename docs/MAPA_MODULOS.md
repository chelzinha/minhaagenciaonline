# Mapa tecnico dos modulos

Este documento registra a relacao entre frontend, Apps Script, planilhas e integracoes da Plataforma Digital AGF.

Objetivo: manter rastreabilidade tecnica sem misturar este projeto com a governanca institucional do Assis.

## 1. Visao geral

A Plataforma Digital AGF esta organizada em modulos de frontend, backend Apps Script, planilhas de apoio e integracoes externas.

Fluxo geral:

frontend -> Apps Script -> planilhas -> integracoes externas

## 2. Modulos frontend

Frontend versionado em:

- frontend/reverso
- frontend/reverso-admin
- frontend/reverso-coleta
- frontend/reverso-expedicao
- frontend/superfrete-admin
- frontend/balcao
- frontend/agf
- frontend/shared

## 3. Modulos Apps Script

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

## 4. Mapa inicial frontend x Apps Script

| Frontend | Apps Script provavel | Status | Observacao |
|---|---|---|---|
| reverso | logistica, autenticacao | confirmar | Modulo de logistica reversa |
| reverso-admin | logistica, autenticacao | confirmar | Area administrativa do reverso |
| reverso-coleta | logistica, autenticacao | confirmar | Fluxo de coleta |
| reverso-expedicao | logistica, autenticacao | confirmar | Fluxo de expedicao |
| superfrete-admin | etiquetas, nuvemshop, nf | confirmar | Area SuperFrete / etiquetas / integracoes |
| balcao | etiquetas, cep, caixa | confirmar | Fluxo de balcao e calculos |
| agf | autenticacao, atende | confirmar | Area institucional ou operacional AGF |
| shared | varios | confirmar | CSS, JS, componentes e assets compartilhados |

## 5. Integracoes externas conhecidas

| Integracao | Modulo relacionado | Status | Observacao |
|---|---|---|---|
| CWS / Correios | etiquetas, logistica, nuvemshop | atencao sensivel | Pode envolver tokens, rastreio, preco, prazo e etiquetas |
| Nuvemshop | nuvemshop, etiquetas | atencao sensivel | Pode envolver OAuth, webhooks, pedidos e clientes |
| CEP | cep, etiquetas, balcao | confirmar | Consulta e normalizacao de enderecos |
| NF / DANFE | nf, etiquetas | atencao sensivel | Pode envolver CNPJ, IE, chaves e dados fiscais |
| Caixa | caixa, balcao | confirmar | Confirmar uso atual |
| SLA | sla | confirmar | Confirmar uso atual no frontend |

## 6. Planilhas e dados

Pendencia: mapear quais planilhas sao usadas por cada modulo.

| Modulo | Planilha | Abas principais | Dados sensiveis | Status |
|---|---|---|---|---|
| autenticacao | confirmar | confirmar | sim | pendente |
| base-metro | confirmar | confirmar | sim | pendente |
| logistica | confirmar | confirmar | sim | pendente |
| etiquetas | confirmar | confirmar | sim | pendente |
| nuvemshop | confirmar | confirmar | sim | pendente |
| nf | confirmar | confirmar | sim | pendente |

## 7. Atencao sensivel

Este mapa envolve dados e integracoes sensiveis.

Nao registrar neste documento:

- tokens
- senhas
- chaves
- secrets
- URLs privadas com segredo
- dados reais de clientes
- CPF, CNPJ, telefone, email ou endereco de clientes

Registrar apenas nomes tecnicos, finalidade, modulo e status.

## 8. Pendencias de mapeamento

- Confirmar qual frontend chama qual Web App.
- Confirmar quais Apps Script estao em producao.
- Confirmar quais planilhas cada Apps Script usa.
- Confirmar dependencias entre etiquetas, nuvemshop, nf e cep.
- Confirmar quais modulos ainda sao teste, legado ou producao.

## 9. Status

Documento inicial criado para orientar auditoria tecnica dos modulos.
