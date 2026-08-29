# Agenda Comercial — Fase 1E — Consistência dos filtros

**Data do fechamento:** 2026-08-29  
**Branch:** `feat/crm-agenda-avulsa-fase1`  
**Status:** implementado na branch; pendente de homologação integrada.

## Problema confirmado na Fase 0

A grade da Agenda aplicava Local, Responsável, Tipo e Status, mas a seção `Pendências vencidas` aplicava apenas parte desse conjunto. Isso fazia o mesmo filtro produzir resultados diferentes na mesma tela.

## Regra aplicada

A seção de vencidas passa a respeitar visualmente os mesmos filtros próprios da Agenda:

- Local;
- Responsável;
- Tipo de atividade;
- Status.

## Implementação

Arquivo novo:

`frontend/crm/agenda-filtros-vencidas-fase1.js`

O módulo:

- observa as respostas de Agenda que o CRM já realiza;
- não cria nova consulta ao backend;
- mantém um mapa leve por `AGENDA_ID`;
- lê as seleções dos chips já existentes;
- oculta na seção de vencidas os itens que não correspondem aos filtros;
- exibe estado vazio específico quando todos os vencidos são eliminados pelo filtro.

## Compatibilidade

- não altera o estado interno dos filtros do `app.js`;
- não altera API ou planilha;
- não muda os filtros aplicados à grade principal;
- funciona igualmente para atividade vinculada e AVULSA.

## Commits

- `c137bd6a331056cdefb792ddde2326c0d62f0720` — `fix(crm): alinhar filtros das atividades vencidas`
- `0135b109dc79671618df9fa04ab4b100cac52efd` — `fix(crm): carregar consistencia dos filtros da agenda`

## Homologação necessária

Testar combinações simples e múltiplas de Tipo, Status, Responsável e Local e confirmar que grade e vencidas respondem de forma coerente.
