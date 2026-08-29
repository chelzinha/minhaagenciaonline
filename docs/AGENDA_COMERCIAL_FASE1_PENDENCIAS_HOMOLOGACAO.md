# Agenda Comercial — Fase 1 — Checklist de homologação

## Schema
- [ ] `setupCrmAgendaAvulsaFase1()` executa sem erro.
- [ ] Segunda execução não duplica cabeçalhos.
- [ ] `auditCrmAgendaAvulsaFase1Schema()` retorna `ok=true`.
- [ ] `TITULO` está ao final de `AGENDA_EXECUCAO`.
- [ ] `APLICA_AVULSA` está ao final de `CRM_TIPOS_ATIVIDADE`.

## Compatibilidade vinculada
- [ ] Criar atividade de Cliente.
- [ ] Criar atividade de Prospect.
- [ ] Abrir atividade vinculada.
- [ ] Concluir atividade vinculada.
- [ ] Cancelar atividade vinculada.
- [ ] Confirmar atualização normal da jornada/funil.

## AVULSA
- [ ] Modo Sem vínculo não carrega autocomplete de Cliente/Prospect.
- [ ] Título vazio é bloqueado.
- [ ] Tipo sem `APLICA_AVULSA=SIM` não aparece/é rejeitado.
- [ ] `ENTIDADE_ID` vazio.
- [ ] `TRATATIVA_ID` vazio.
- [ ] Nenhum Cliente/Prospect/Tratativa artificial criado.
- [ ] Card usa `TITULO`.
- [ ] Local aparece e responde ao filtro.
- [ ] Workspace não carrega materiais/checklist/notas de entidade.
- [ ] Conclusão não cria `CRM_INTERACOES` ou `CRM_EVENTOS`.
- [ ] Cancelamento não cria evento de CRM.
- [ ] Exclusão preserva a semântica física atual.

## Duração
- [ ] WhatsApp/Email usam 5 minutos quando habilitados para AVULSA.
- [ ] Ligação/Proposta/Retorno usam 15 minutos quando habilitados.
- [ ] Visita/Reunião/Treinamento usam 60 minutos quando habilitados.
- [ ] Alteração manual da duração não é sobrescrita por troca posterior de tipo.

## Dias úteis
- [ ] Diária: sexta -> segunda.
- [ ] Diária: segunda -> sexta anterior.
- [ ] Hoje no sábado/domingo -> próxima segunda, no modo Diária.
- [ ] Semanal mostra segunda a sexta.
- [ ] Rótulo semanal termina na sexta.
- [ ] Data manual de sábado/domingo continua aceita.

## Filtros
- [ ] Vencidas respeitam Local.
- [ ] Vencidas respeitam Responsável.
- [ ] Vencidas respeitam Tipo.
- [ ] Vencidas respeitam Status.
- [ ] Combinações múltiplas permanecem coerentes com a grade principal.

## Performance
- [ ] Abrir/criar AVULSA não dispara carga de Clientes/Prospects.
- [ ] Salvar AVULSA não recarrega jornadas/funis.
- [ ] Nenhum full scan de planilha foi adicionado por clique.
- [ ] `debugPerf=1` continua sem dados pessoais nos logs.

## Visual
- [ ] Desktop.
- [ ] 390px.
- [ ] Modal Nova atividade.
- [ ] Workspace AVULSA.
- [ ] Diária, Semanal e Mensal.

## Segurança
- [ ] Nenhum token/credencial novo.
- [ ] Logs não contêm título/observação/payload completo.
- [ ] Permissões de responsável/equipe permanecem respeitadas.
