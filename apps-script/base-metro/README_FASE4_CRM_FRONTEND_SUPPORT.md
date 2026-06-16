# Fase 4 — Suporte de backend para o frontend CRM isolado

Este pacote consolida integralmente as Fases 2 e 3 e acrescenta um ajuste mínimo para o frontend CRM isolado em `/crm/`.

## Alteração desta fase

A rota `get_crm_dashboard_v3` passou a aceitar o parâmetro opcional `responsavelId`.

Quando informado, os indicadores retornados são filtrados pelo responsável:

- atividades da Agenda Comercial;
- tratativas da jornada comercial;
- métricas semanais;
- pendências e distribuição por etapa.

## Objetivo

Evitar que um usuário configurado com escopo de agenda própria visualize indicadores consolidados da equipe.

## Compatibilidade

- Nenhuma rota existente foi removida.
- Nenhuma aba foi criada ou excluída nesta fase.
- Nenhum setup adicional é necessário especificamente para a Fase 4.
- O frontend antigo continua funcionando, pois `responsavelId` é opcional.

## Implantação

1. Faça backup da versão atual do projeto Apps Script.
2. Substitua o conteúdo pelos arquivos deste pacote.
3. Salve.
4. Publique uma nova versão da implantação existente, preservando a URL `/exec`.
5. Valide o CRM atual e o novo `/crm/`.

## Reversão

Republique a versão anterior do Web App. As abas e os dados das Fases 2 e 3 permanecem compatíveis.
