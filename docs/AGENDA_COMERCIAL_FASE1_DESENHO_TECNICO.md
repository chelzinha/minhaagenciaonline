# Agenda Comercial — Fase 1 — Desenho Técnico

**Status:** aprovado para implementação incremental  
**Data do fechamento:** 2026-08-29  
**Branch de trabalho:** `feat/crm-agenda-avulsa-fase1`

## 1. Objetivo

Preparar a Agenda Comercial para aceitar atividades sem vínculo com Cliente, Prospect ou Tratativa, preservando integralmente os fluxos existentes das atividades vinculadas.

A Fase 1 é uma mudança técnica pequena e homologável. Não inclui redesign amplo da Agenda.

## 2. Decisões fechadas

1. `ENTIDADE_TIPO = AVULSA` é a representação canônica de atividade sem vínculo.
2. `INTERNA` não é tipo de entidade. Atividade interna é categoria/tipo de atividade.
3. Para AVULSA:
   - `ENTIDADE_ID` fica vazio;
   - `TRATATIVA_ID` fica vazio;
   - nunca criar Cliente, Prospect ou Tratativa artificial.
4. Adicionar `TITULO` ao final de `AGENDA_EXECUCAO`.
   - obrigatório para AVULSA;
   - opcional para atividade vinculada;
   - não reutilizar a coluna `CLIENTE` como título.
5. Adicionar `APLICA_AVULSA` ao final de `CRM_TIPOS_ATIVIDADE`, seguindo a parametrização já usada por `APLICA_CLIENTE` e `APLICA_PROSPECT`.
6. Tipos permitidos para AVULSA não serão hardcoded no frontend.
7. Corrigir o default fixo de duração de 30 minutos. A duração inicial deve vir de `DURACAO_PADRAO_MIN` do tipo selecionado.
8. Se o usuário alterar a duração manualmente, uma troca posterior de tipo não deve sobrescrever essa escolha.
9. Atividade vinculada mantém o workspace rico atual.
10. Atividade AVULSA usa workspace enxuto e não carrega:
    - checklist;
    - mídia de entidade;
    - notas de entidade;
    - snapshot;
    - transição de funil.
11. Não criar `AGENDA_EVENTOS` nesta etapa.
12. `AGENDA_EXECUCAO` permanece como trilha operacional da atividade avulsa.
13. Operações de CRM passam a ser condicionais à existência real de entidade/tratativa.
14. Não criar mini-cadastro de contato avulso nesta primeira versão.
15. Campos iniciais da AVULSA: Título, Local e Observação, além dos campos operacionais normais da Agenda.
16. AVULSA respeita normalmente:
    - responsável;
    - `canViewTeam`;
    - `agendaScope`;
    - tipo;
    - status;
    - local.
17. AVULSA não pode cair por fallback no contexto de Cliente.
18. Fim de semana fica fora da experiência operacional padrão:
    - Diária pula sexta → segunda;
    - Diária anterior em segunda volta para sexta;
    - Semanal mostra segunda → sexta;
    - rótulo semanal reflete segunda → sexta;
    - backend não bloqueará sábado/domingo por enquanto.
19. AVULSA deve evitar carregamentos desnecessários de Clientes/Prospects quando não houver vínculo.
20. Após salvar AVULSA, não recarregar funis/tratativas.
21. Preferência atual: visão Diária como abertura padrão, ainda pendente de validação visual antes de virar decisão definitiva.

## 3. Alterações de schema/configuração

### 3.1 `AGENDA_EXECUCAO`

Adicionar ao final:

```text
TITULO
```

Representação canônica de AVULSA:

```text
ENTIDADE_TIPO = AVULSA
ENTIDADE_ID = vazio
TRATATIVA_ID = vazio
TITULO = obrigatório
```

Os demais campos atuais continuam válidos: data, horário, duração, tipo, responsável, status, resultado, local, observação, request ID e timestamps.

### 3.2 `CRM_TIPOS_ATIVIDADE`

Adicionar ao final:

```text
APLICA_AVULSA
```

Regra:

- `SIM` → tipo permitido para AVULSA;
- vazio/`NAO` → não permitido.

A migração não preencherá automaticamente `SIM` nos tipos existentes. A habilitação será explícita.

## 4. Migração segura

Criar uma rotina administrativa idempotente específica para a Agenda AVULSA.

Responsabilidades:

1. usar `DocumentLock`;
2. adicionar `TITULO` se ausente;
3. adicionar `APLICA_AVULSA` se ausente;
4. não alterar linhas antigas;
5. invalidar/revisar apenas os caches necessários;
6. retornar quais cabeçalhos foram adicionados.

Também atualizar o mecanismo padrão de append de cabeçalhos para novas instalações.

Não usar uma reexecução ampla de setup como mecanismo principal de migração em produção.

## 5. Arquivos previstos

### Backend

- `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`

### Frontend

- `frontend/crm/app.js`
- `frontend/crm/index.html`
- `frontend/crm/styles.css` apenas se necessário para estados condicionais mínimos

### Documentação

- `CHANGELOG.md`
- `docs/FRONTEND.md`
- `docs/APPS_SCRIPT.md`
- `docs/PLANILHAS_E_DADOS.md`
- `docs/PLANILHA_APP_TOTAL_CF_METRO.md`
- `docs/PERFORMANCE.md`

## 6. Funções/pontos que precisam ganhar suporte explícito a AVULSA

### Backend

- normalização de tipo de entidade: aceitar explicitamente `CLIENTE`, `PROSPECT` e `AVULSA`;
- `crm3_apiSaveAtividade_()`;
- projeção/leitura da Agenda para retornar `titulo`;
- `crm3_apiCompleteAtividade_()`;
- cancelamento;
- exclusão, preservando a semântica atual nesta etapa;
- condicionais de interação, evento, snapshot e transição;
- validação de `APLICA_AVULSA`.

### Frontend

- `activityEntityRef()`;
- `entityForActivity()`;
- `activityMatchesContext()`;
- criação de atividade;
- lista de tipos permitidos;
- leitura/exibição de `titulo`;
- workspace da atividade;
- refresh pós-salvamento;
- abertura de atividade usando também `agendaWin.items`;
- filtros das pendências vencidas, alinhando Tipo e Status ao restante da Agenda.

## 7. Fluxo de criação

### Vinculada

Preservar o fluxo atual.

### AVULSA

Fluxo esperado:

```text
validar ENTIDADE_TIPO=AVULSA
→ garantir ENTIDADE_ID vazio
→ garantir TRATATIVA_ID vazio
→ exigir TITULO
→ validar APLICA_AVULSA
→ validar tipo/data/responsável
→ gravar somente AGENDA_EXECUCAO
```

Não executar para AVULSA:

- busca/criação de Tratativa;
- leitura de Cliente/Prospect;
- snapshot;
- interação de entidade;
- transição de funil;
- evento de CRM.

## 8. Nova atividade — interface mínima da Fase 1

Na abertura pela Agenda, permitir escolher entre:

- atividade vinculada;
- atividade sem vínculo.

### Vinculada

Preservar o formulário atual.

### Sem vínculo

Exibir apenas o necessário:

- Título *;
- Tipo *;
- Responsável;
- Local;
- Data/horário no formato atual da Fase 1;
- Duração;
- Observação.

Não exibir busca de Cliente/Prospect nem mídia recomendada quando estiver em modo AVULSA.

A reorganização completa em bloco progressivo “Quando?” fica para a etapa visual seguinte.

## 9. Duração

Regra:

1. ao abrir o modal, usar `DURACAO_PADRAO_MIN` do tipo selecionado;
2. enquanto o usuário não editar a duração, trocar de tipo atualiza para o novo default;
3. após alteração manual, não sobrescrever automaticamente.

## 10. Workspace AVULSA

Usar o mesmo modal estrutural, com conteúdo reduzido.

Exibir:

- Título;
- Data/horário;
- Tipo;
- Responsável;
- Local;
- Status;
- Observação;
- conclusão/resultado quando aplicável;
- observação de execução;
- cancelar;
- excluir;
- concluir.

Não carregar checklist, materiais, notas de entidade, snapshot ou transição de funil.

## 11. Performance

Para AVULSA:

- não executar carregamento de Clientes/Prospects se não houver vínculo;
- não executar autocomplete de entidade;
- após salvar, atualizar somente a Agenda;
- não recarregar jornadas/funis;
- preservar `agendaWin` e o cache V5 existente.

Para vinculadas, preservar o comportamento atual, podendo usar recarga escopada por Cliente ou Prospect.

## 12. Fim de semana

Mudança separada do núcleo AVULSA para facilitar homologação/rollback.

Comportamento operacional:

- Diária: sexta + próximo = segunda;
- Diária: segunda + anterior = sexta;
- abertura no sábado/domingo: apontar para o próximo dia útil;
- Semanal: segunda → sexta;
- rótulo semanal: segunda → sexta;
- Mensal: manter somente dias úteis na grade operacional;
- backend: não bloquear gravação em sábado/domingo nesta etapa.

## 13. Compatibilidade com registros antigos

Não migrar nem reinterpretar linhas antigas.

Não preencher automaticamente:

- `TITULO`;
- `ENTIDADE_TIPO`;
- `ENTIDADE_ID`;
- `TRATATIVA_ID`.

Registros antigos continuam usando os fallbacks legados.

Somente registros com `ENTIDADE_TIPO = AVULSA` serão tratados como AVULSA.

## 14. Itens explicitamente fora da Fase 1

- redesign amplo da Agenda;
- novos KPIs;
- bloco completo “Agora / Próxima ação”;
- novo layout da Diária;
- novo layout da Semana;
- novo layout do Mês;
- mini-cadastro de contato avulso;
- telefone/e-mail avulso;
- Google Calendar;
- `AGENDA_EVENTOS`;
- nova planilha;
- nova API paralela;
- alteração de autenticação.

## 15. Testes obrigatórios

1. migração executada duas vezes sem duplicar colunas;
2. Cliente antigo continua funcionando;
3. Prospect antigo continua funcionando;
4. criar atividade vinculada a Cliente preserva o fluxo atual;
5. criar atividade vinculada a Prospect preserva o fluxo atual;
6. AVULSA sem título é bloqueada;
7. AVULSA com `ENTIDADE_ID` é bloqueada;
8. AVULSA com `TRATATIVA_ID` é bloqueada;
9. tipo com `APLICA_AVULSA` vazio/NAO é bloqueado;
10. tipo com `APLICA_AVULSA=SIM` é permitido;
11. request duplicado não duplica atividade;
12. duração inicial vem da configuração;
13. duração manual não é sobrescrita;
14. abrir AVULSA não busca entidade;
15. concluir AVULSA altera somente Agenda;
16. cancelar AVULSA altera somente Agenda;
17. AVULSA não cria Tratativa;
18. AVULSA não cria interação/evento de CRM;
19. AVULSA não altera Cliente/Prospect;
20. filtros de responsável/tipo/status/local funcionam;
21. `agendaScope=OWN` funciona;
22. `canViewTeam` funciona;
23. save AVULSA não recarrega funis;
24. atividade vinculada continua atualizando o escopo necessário;
25. abertura de cards funciona também quando o item veio de `agendaWin.items`;
26. PNG/PDF continuam funcionando.

## 16. Riscos

### Risco 1 — downgrade de código

Código antigo não reconhece AVULSA e pode tratá-la como Cliente.

Mitigação: depois que houver AVULSAS reais, não fazer rollback para backend que desconheça `AVULSA`.

### Risco 2 — indicadores comerciais

Ainda não está decidido se atividades AVULSAS devem entrar nos indicadores da Home/CRM.

Decisão provisória da Fase 1: não usar AVULSA para alterar métricas comerciais até existir decisão explícita.

### Risco 3 — exclusão física

A exclusão atual remove a linha da Agenda.

A Fase 1 preserva essa semântica para não ampliar escopo. Soft delete/auditoria adicional fica para decisão futura.

## 17. Rollout

1. deploy de compatibilidade com AVULSA sem habilitar criação;
2. executar migração idempotente de schema;
3. validar leitura e regressão de vinculadas;
4. habilitar UI mínima de AVULSA;
5. marcar explicitamente `APLICA_AVULSA=SIM` apenas nos tipos aprovados;
6. homologar criação/abertura/conclusão/cancelamento/filtros/performance.

## 18. Rollback

Se ainda não houver AVULSAS reais, reverter commits normalmente.

Se já houver AVULSAS reais:

1. definir `APLICA_AVULSA=NAO`;
2. desabilitar criação no frontend;
3. manter `TITULO` e `APLICA_AVULSA` no schema;
4. manter backend compatível para leitura das AVULSAS existentes;
5. corrigir;
6. reativar.

Não remover colunas aditivas como parte de rollback.

## 19. Baseline visual confirmado em interface real

Auditoria via Playwright em 2026-08-29 confirmou:

- Semanal: grandes áreas vazias quando não há atividades;
- Diária: cartão vazio ocupa espaço relevante e pode abrir em sábado;
- Mensal: usa 5 colunas de dias úteis, porém mantém uma grade extensa e pouco prática no mobile;
- Nova atividade: formulário longo, orientado a Cliente/Prospect, com `Duração estimada = 30` fixa na abertura;
- workspace vinculado: rico e extenso, adequado para Cliente/Prospect, inadequado para AVULSA;
- mobile 390 px: modal de Nova atividade ocupa praticamente toda a tela e confirma necessidade de simplificação posterior.

Esses achados reforçam a decisão de manter a Fase 1 técnica e pequena e deixar o redesign operacional para a etapa seguinte.

## 20. Próximo passo

Implementar primeiro a fundação técnica mínima e homologável de AVULSA, sem redesign amplo.
