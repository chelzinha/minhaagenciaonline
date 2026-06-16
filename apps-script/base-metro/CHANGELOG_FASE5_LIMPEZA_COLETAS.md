# Changelog — Fase 5: Limpeza controlada de COLETAS

## Objetivo
Remover integralmente a funcionalidade e os dados históricos relacionados a COLETAS da planilha operacional ativa, sem interromper o CRM, Agenda Comercial, Dashboard Gerencial ou aplicativos externos.

## Alterações aditivas e seguras antes da remoção física
- Criação de `07_CRM_LIMPEZA_FASE5.js`.
- Preview detalhado: `previewRemocaoColetasFase5()`.
- Backup externo automático da planilha completa: `backupAntesRemocaoColetasFase5()`.
- Exclusão protegida por confirmação textual: `removeColetasFase5('EXCLUIR_COLETAS')`.
- Auditoria pós-limpeza: `auditRemocaoColetasFase5()`.
- Status consolidado: `getStatusRemocaoColetasFase5()`.

## Estruturas removidas ou normalizadas
- Aba legada `COLETAS_EXECUCAO`.
- Registros históricos de coletas em Agenda, interações, eventos, checklist e transições.
- Colunas exclusivas de coletas em `PROSPECTS` e `CRM_VISITA_CHECKLIST`.
- Tipos de atividade, resultados, etapas e mídias parametrizadas que contenham referência a coletas.
- Blocos de Agenda antigos são normalizados para `AGENDA`.
- Prospects legados na etapa `COLETA` são normalizados para `OPORTUNIDADE`.
- Descrições de mídias preservadas recebem limpeza textual quando a referência à coleta não define a identidade do material.

## Compatibilidade
- Rotas antigas continuam existindo temporariamente, mas filtram coletas.
- Tentativas de criar novas coletas recebem erro claro.
- Payload legado mantém `coletas: []` temporariamente para evitar regressão em consumidores antigos.
- `VISITAR` permanece apenas como tipo de atividade física (`ATV_VISITA`), nunca como recomendação automática.

## Reversão
- O backup externo completo é criado antes da remoção.
- Para reverter, reimplante a versão anterior do Apps Script e restaure a planilha pelo backup gerado.


## Fix 5.0.1 — execução manual no editor
O editor do Apps Script executa funções sem argumentos. Para realizar a exclusão confirmada pelo seletor **Executar**, use:
```javascript
executarRemocaoColetasConfirmadaFase5()
```
A função chama internamente `removeColetasFase5('EXCLUIR_COLETAS')`.
