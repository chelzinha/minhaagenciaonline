# Agenda Comercial — Fase 1D — Dias úteis

**Data do fechamento:** 2026-08-29  
**Branch:** `feat/crm-agenda-avulsa-fase1`  
**Status:** implementado na branch; pendente de homologação integrada.

## Decisão aplicada

O fim de semana permanece fora da experiência operacional padrão da Agenda, sem virar bloqueio técnico de datas no backend.

## Comportamento

### Diária

- `Próximo` pula sexta-feira para segunda-feira.
- `Anterior` pula segunda-feira para sexta-feira.
- Se `Hoje` cair em sábado/domingo e a visão ativa for Diária, o cursor vai para o próximo dia útil.
- Ao entrar na visão Diária durante o fim de semana atual, o cursor operacional é normalizado para a próxima segunda-feira.
- Uma data de fim de semana escolhida manualmente continua permitida.

### Semanal

- A grade continua com cinco colunas: segunda a sexta.
- O rótulo do período passa a refletir somente segunda a sexta.
- O backend não recebe nenhuma nova validação de dia da semana.

### Nova atividade

- Quando aberta pelos botões da própria Agenda, usa como default a data atualmente selecionada na Agenda.
- Se a tela estiver simplesmente posicionada no fim de semana atual, o default operacional passa para o próximo dia útil.
- O usuário ainda pode informar manualmente sábado/domingo no campo de data.

## Arquivo

`frontend/crm/agenda-dias-uteis-fase1.js`

## Integração

`frontend/crm/config.js` carrega o módulo antes do `app.js` principal, separado do módulo `agenda-avulsa-fase1.js`.

## Commits

- `4b02bc5e1a31e4f62e4bdf626599181945cdbf59` — `fix(crm): normalizar navegacao da agenda em dias uteis`
- `51c7ff6fa400a5910bc9ec6e74d5ffb988d6e5b8` — `fix(crm): carregar regras de dias uteis da agenda`

## Fora do escopo

- proibir gravação em sábado/domingo;
- inserir sábado/domingo na visão Semanal;
- mudar a regra de negócio da Agenda mensal;
- definir a visão Diária como default definitivo.
