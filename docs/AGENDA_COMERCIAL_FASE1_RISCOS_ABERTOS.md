# Agenda Comercial — Fase 1 — Riscos abertos

## P1 — arquivo legado 06

`apps-script/base-metro/06_CRM_JORNADA_FASE3.js` foi regravado pelo conector e o diff removeu comentários inline além das alterações funcionais. Não foi detectada remoção de função, mas a homologação de Cliente/Prospect é obrigatória.

## P1 — abertura via agendaWin

O problema auditado no core (`openActivityModal()` procura a coleção inicial e vencidas, mas não `agendaWin.items`) ainda exige correção direta no core ou validação de uma alternativa segura. O módulo AVULSA contorna o caso de AVULSA por interceptar o clique, mas o risco legado permanece para atividade vinculada navegada em janela nova.

## P1 — configuração APLICA_AVULSA

Nenhum tipo deve ser habilitado automaticamente. A homologação funcional depende de definir explicitamente na configuração quais tipos terão `APLICA_AVULSA=SIM`.

## P2 — integração frontend isolada

Os módulos da Fase 1 foram isolados para reduzir regressão no `app.js`. Antes de merge, validar ordem de carregamento e comportamento em navegador real.

## P2 — documentação geral

`CHANGELOG.md` já foi atualizado. A consolidação final em `FRONTEND.md`, `APPS_SCRIPT.md`, `PLANILHAS_E_DADOS.md` e `PERFORMANCE.md` deve ocorrer antes do merge.
