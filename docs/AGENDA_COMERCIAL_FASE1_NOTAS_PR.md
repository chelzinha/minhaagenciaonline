# Agenda Comercial — Fase 1 — Notas do PR

## Objetivo

Primeira entrega pequena e homologável para permitir atividade sem vínculo (`AVULSA`) e corrigir inconsistências técnicas prioritárias da Agenda, sem redesign amplo.

## Incluído

- schema aditivo `TITULO` + `APLICA_AVULSA`;
- backend explícito para AVULSA nas actions existentes;
- nenhuma entidade/tratativa artificial;
- workspace AVULSA enxuto;
- duração padrão por configuração;
- navegação operacional em dias úteis;
- filtros consistentes na seção de vencidas;
- documentação, checklist e rollback.

## Não incluído

- redesign da visão Diária;
- definição definitiva da Diária como abertura padrão;
- bloco visual novo `Quando?`;
- mini-cadastro de contato avulso;
- `AGENDA_EVENTOS`;
- integração com Google Calendar;
- merge/deploy automático.

## Gate

PR deve permanecer Draft até conclusão do checklist `docs/AGENDA_COMERCIAL_FASE1_PENDENCIAS_HOMOLOGACAO.md`.
