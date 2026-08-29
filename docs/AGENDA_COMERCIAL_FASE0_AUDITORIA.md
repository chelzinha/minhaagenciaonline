# Agenda Comercial AGF — Auditoria da Fase 0

> Registro técnico complementar ao `docs/AGENDA_COMERCIAL_CONTEXTO.md`.
>
> Data do registro: 2026-08-29.
>
> Escopo: consolidar os achados da auditoria visual/técnica da Agenda antes de qualquer implementação funcional ou redesign grande.

---

## 1. Conclusão

A Agenda atual possui uma infraestrutura funcional relevante, mas a experiência ainda está pesada para uso operacional diário.

A evolução deve priorizar simplicidade, velocidade e a ideia de **foto do dia do comercial**.

A primeira mudança funcional não deve ser um redesign amplo. Antes, é necessário corrigir o modelo técnico para permitir **atividade avulsa / sem vínculo cadastral** sem criar Cliente, Prospect ou Tratativa artificial.

Nenhum código, Apps Script, planilha ou deploy foi alterado durante esta auditoria.

---

## 2. Decisões de negócio consolidadas

Considerar fechadas nesta etapa:

- Agenda simples e prática;
- leitura rápida do que precisa ser feito;
- fins de semana não precisam aparecer na experiência operacional padrão;
- suporte a atividades vinculadas a Cliente;
- suporte a atividades vinculadas a Prospect;
- suporte a atividades vinculadas a Tratativa;
- suporte obrigatório a atividade sem vínculo;
- atividade avulsa não cria Prospect fictício;
- atividade avulsa não cria Tratativa artificial;
- preservar performance, filtros, permissões, histórico e idempotência.

---

## 3. Fim de semana

### Confirmado / problema observado

A visão semanal trabalha visualmente de segunda a sexta, porém o período técnico pode continuar calculando segunda a domingo, gerando rótulo incompatível com o que é exibido.

A visão diária também pode abrir sábado/domingo e ocupar uma área grande com um estado vazio que não agrega valor operacional.

### Direção aprovada

Tratar a experiência visual da Agenda como Agenda de dias úteis:

- Semanal: segunda a sexta também no rótulo do período;
- Mensal: manter sábado e domingo fora da grade operacional;
- Diária: navegação anterior/próxima deve pular fim de semana;
- ao abrir a Agenda em sábado/domingo, posicionar no próximo dia útil.

### Regra de segurança

Não bloquear gravação de sábado/domingo no backend nesta fase.

Ocultar na experiência padrão e proibir persistência são decisões diferentes. O backend deve continuar tolerante até existir decisão explícita de negócio sobre atividades excepcionais em fim de semana.

---

## 4. Direção visual

A Agenda não deve virar um dashboard ornamental.

A visão diária precisa reduzir:

- grandes caixas vazias;
- alturas mínimas artificiais;
- excesso de molduras;
- níveis de sombra;
- controles simultâneos que exigem interpretação técnica.

### Direção para a visão diária

Estrutura conceitual:

```text
SEGUNDA · 31 AGO
3 atividades · 1 vencida · 1 concluída

Agora / próxima
09:30 · Ligação
Empresa / assunto
[Abrir]

Hoje
09:30 · Ligação — ...
11:00 · Reunião interna
14:00 · Visita — ...
16:30 · Preparar proposta

1 pendência vencida
```

A prioridade é **trabalho**, não decoração.

---

## 5. Atividade avulsa — bloqueio técnico confirmado

### Frontend

O fluxo atual de criação exige `agendaEntityId` e interrompe o salvamento quando nenhum Cliente/Prospect foi selecionado.

### Backend

O fluxo atual de `crm3_apiSaveAtividade_()` exige `entidadeId`, procura a entidade e usa/cria Tratativa.

A normalização e os helpers atuais foram construídos para o mundo Cliente/Prospect. Portanto, apenas enviar um novo valor de entidade sem revisar os leitores não resolve o problema.

### Consequência

O suporte a atividade avulsa precisa ser implementado explicitamente em:

- criação;
- leitura/renderização;
- filtros;
- conclusão;
- cancelamento;
- exclusão;
- workspace;
- permissões;
- indicadores;
- exportação;
- cache/refresh.

---

## 6. Modelo técnico recomendado para atividade avulsa

### Recomendação

Usar um tipo canônico explícito:

```text
ENTIDADE_TIPO = AVULSA
ENTIDADE_ID = vazio
TRATATIVA_ID = vazio
```

`AVULSA` é preferível a `INTERNA` como tipo de vínculo, porque uma atividade pode ser avulsa e ainda assim ser externa. O caráter interno/comercial pertence ao tipo da atividade, não ao tipo de entidade.

### Título

Adicionar, ao final de `AGENDA_EXECUCAO`, um campo próprio:

```text
TITULO
```

Regra proposta:

- atividade avulsa: `TITULO` obrigatório;
- atividade vinculada: `TITULO` opcional;
- renderização de registros antigos: fallback para o nome atual do Cliente/Prospect ou para o rótulo da atividade.

Não reutilizar artificialmente a coluna `CLIENTE` como título de atividade avulsa.

### Atenção de compatibilidade

Todos os helpers que hoje tratam qualquer coisa diferente de `PROSPECT` como `CLIENTE` precisam ganhar ramificação explícita para `AVULSA`.

---

## 7. Tipos de atividade avulsa

O backend atual conhece aplicabilidade a Cliente e Prospect.

### Recomendação técnica

Não hardcodar no frontend quais tipos aceitam atividade avulsa.

A melhor direção é adicionar configuração explícita em `CRM_TIPOS_ATIVIDADE`, por exemplo:

```text
APLICA_AVULSA
```

Os valores iniciais devem ser decididos na homologação.

Não presumir automaticamente que todos os tipos existentes aceitam modo avulso.

Quando essa coluna for implementada, atualizar `docs/PLANILHAS_E_DADOS.md` e `docs/APPS_SCRIPT.md`.

---

## 8. Duração — bug funcional confirmado

`CRM_TIPOS_ATIVIDADE` possui duração padrão parametrizada por tipo.

O frontend atual inicia `Nova atividade` com duração fixa de 30 minutos e envia esse valor ao backend. Com isso, o backend deixa de utilizar a duração padrão do tipo na maior parte das criações.

### Correção recomendada

- remover o default fixo de 30 minutos do fluxo de criação;
- preencher a duração a partir de `DURACAO_PADRAO_MIN` do tipo selecionado;
- permitir ajuste manual;
- após o usuário alterar manualmente a duração, não sobrescrever silenciosamente o valor ao rerenderizar o formulário.

---

## 9. Data, horário e bloco

O modal atual expõe simultaneamente:

- Janela ou horário;
- Horário livre;
- Duração estimada.

Isso apresenta a implementação ao usuário em vez de apresentar a intenção.

### Direção de UX

Organizar como um único bloco **Quando?**:

1. Data;
2. modo de horário:
   - Janela;
   - Horário específico;
   - Sem horário, quando permitido;
3. mostrar somente o campo pertinente;
4. duração sugerida automaticamente pelo tipo, com possibilidade de ajuste.

---

## 10. Workspace da atividade

### Atividade vinculada

Preservar o workspace rico atual:

- materiais;
- checklist;
- notas;
- resultado;
- follow-up;
- jornada/transição quando aplicável.

### Atividade avulsa

Usar versão enxuta:

- resumo;
- título;
- observação;
- data/horário;
- responsável;
- resultado quando exigido pelo tipo;
- concluir;
- reagendar;
- cancelar;
- excluir conforme permissão.

Não carregar checklist comercial, mídia de Cliente ou notas de entidade quando não existe entidade.

---

## 11. Eventos, interações e auditoria de atividade avulsa

Na primeira versão, não criar uma entidade fictícia apenas para alimentar `CRM_EVENTOS` ou `CRM_INTERACOES`.

### Recomendação

- usar os campos de `AGENDA_EXECUCAO` como trilha principal da atividade avulsa;
- tornar atualizações de CRM condicionais à existência de entidade/tratativa;
- só criar uma estrutura `AGENDA_EVENTOS` futura se houver necessidade real de histórico de eventos mais granular.

Evitar ampliar o modelo de dados antes de existir uso concreto.

---

## 12. Filtros e permissões para atividade avulsa

Atividade avulsa deve respeitar normalmente:

- Responsável;
- Tipo de atividade;
- Status;
- Local quando informado;
- `canViewTeam`;
- `agendaScope`.

Ela não deve cair no filtro/contexto de Cliente por fallback técnico.

Helpers como resolução de entidade e filtros de contexto precisam tratar `AVULSA` explicitamente.

---

## 13. Performance

A implementação de atividade avulsa cria uma oportunidade de reduzir trabalho desnecessário:

- se o usuário optar por atividade sem vínculo, não carregar Clientes/Prospects apenas para salvar a atividade;
- não recarregar jornadas/funis quando uma atividade avulsa não altera CRM;
- atualizar somente a janela da Agenda afetada;
- preservar `REQUEST_ID`, lock e refresh otimista.

A atividade avulsa não deve piorar o boot do CRM.

---

## 14. Contato livre em atividade avulsa

### Recomendação para a primeira versão

Não criar agora um mini-cadastro paralelo de contato com nome, telefone e outros campos.

Começar com:

- `TITULO`;
- Local;
- Observação.

Se a operação demonstrar necessidade real de contato avulso estruturado, decidir depois se o dado deve continuar na Agenda ou virar Prospect.

Isso evita criar um segundo CRM escondido dentro da Agenda.

---

## 15. Dados antigos / registros suspeitos

Registros antigos visualmente estranhos não devem ser usados como referência para desenhar a nova UX.

Também não devem ser apagados automaticamente.

Auditar separadamente e decidir entre:

- manter histórico;
- corrigir;
- cancelar;
- arquivar;
- excluir somente quando comprovadamente teste/lixo.

---

## 16. Fases recomendadas após a auditoria

### Fase 1 — Fundação técnica

- suporte real a `AVULSA`;
- normalização explícita;
- vínculo opcional;
- nenhuma Tratativa artificial;
- conclusão/cancelamento condicionais;
- `TITULO`;
- tipos aplicáveis parametrizados;
- duração parametrizada;
- idempotência/cache/permissões preservados;
- testes de regressão.

### Fase 2 — Nova atividade simples

- vínculo opcional;
- formulário progressivo;
- horário intuitivo;
- defaults do tipo;
- campos comerciais somente quando houver vínculo.

### Fase 3 — Foto do dia

- eliminar grandes vazios;
- Agora/Próxima;
- vencidas em prioridade;
- lista cronológica compacta;
- concluídas sem poluir.

### Fase 4 — Semanal e Mensal

- segunda a sexta;
- rótulo coerente com semana útil;
- cards compactos;
- mês como panorama/navegação.

### Fase 5 — Mobile e refinamento

- 360/390/430px;
- ações rápidas;
- conclusão rápida;
- acessibilidade;
- exportação;
- performance fina.

---

## 17. Decisões que ainda precisam de homologação explícita

Mesmo após a Fase 0, não implementar silenciosamente:

1. se `Diária` será o modo padrão ao abrir a Agenda;
2. comportamento exato do botão `Hoje` quando a data real cair em fim de semana;
3. quais tipos terão `APLICA_AVULSA = SIM`;
4. se atividades avulsas entram nos indicadores comerciais ou em indicadores gerais de execução;
5. se Local avulso será lista, texto livre ou híbrido;
6. regra operacional para vencidas com mais de 180 dias;
7. necessidade futura de histórico de eventos próprio da Agenda.

### Recomendação de produto

Como a meta é ser a **foto do dia do comercial**, a direção preferencial é abrir a Agenda na visão **Diária**, salvo decisão contrária na homologação.

---

## 18. Critérios adicionais de aceite

Além do checklist do documento principal, validar:

- `AVULSA` nunca é convertida implicitamente em `CLIENTE`;
- criar avulsa não cria Tratativa;
- concluir avulsa não atualiza snapshot de entidade;
- cancelar/excluir avulsa não exige entidade;
- avulsa aparece em Dia/Semana/Mês;
- avulsa entra em vencidas quando aplicável;
- filtros de responsável/tipo/status funcionam;
- permissões OWN/equipe continuam corretas;
- exportação exibe título corretamente;
- registros antigos vinculados continuam funcionando;
- duração padrão do tipo é usada quando o usuário não altera;
- navegar sexta → segunda e segunda → sexta anterior funciona;
- backend continua tolerante a datas de fim de semana;
- nenhuma leitura completa desnecessária de `AGENDA_EXECUCAO` é reintroduzida.

---

## 19. Arquivos que a implementação deverá revisar primeiro

### Frontend

- `frontend/crm/app.js`
- `frontend/crm/index.html`
- `frontend/crm/styles.css`

### Apps Script

- `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`
- `apps-script/base-metro/10_OPERACAO_EXECUCAO_API.js`
- arquivo atual de performance/cache do CRM

### Dados/configuração

- `AGENDA_EXECUCAO`
- `AGENDA_BLOCOS`
- `CRM_TIPOS_ATIVIDADE`
- `CRM_RESPONSAVEIS`
- `CRM_LOCAIS`

---

## 20. Regra de execução

A primeira implementação deve ser pequena e homologável.

Antes de escrever:

1. preparar diff técnico esperado;
2. listar colunas/configurações que serão alteradas;
3. garantir compatibilidade com registros antigos;
4. preparar testes de criação vinculada e avulsa;
5. preparar rollback;
6. só então implementar.

Após implementação funcional:

- atualizar `CHANGELOG.md`;
- atualizar `docs/FRONTEND.md`;
- atualizar `docs/APPS_SCRIPT.md`;
- atualizar `docs/PLANILHAS_E_DADOS.md` se houver `TITULO`/`APLICA_AVULSA`;
- atualizar `docs/PERFORMANCE.md` se o carregamento/cache mudar.

---

## 21. Status

**Fase 0: auditada e documentada.**

Próximo marco técnico recomendado: desenho e homologação da **Fase 1 — suporte real a atividade avulsa**, antes do redesign grande.