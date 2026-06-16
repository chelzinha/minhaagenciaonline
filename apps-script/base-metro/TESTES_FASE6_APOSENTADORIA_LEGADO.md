# Testes — Fase 6: aposentadoria do CRM legado

1. Execute `previewAposentadoriaLegadoCrmFase6()`.
2. Confirme `ok: true`.
3. Execute `aposentarCrmLateralFase6()`.
4. Execute `auditAposentadoriaLegadoCrmFase6()`.
5. Confirme `ok: true`, `sidebarEnabled: false` e ausência de triggers residuais.
6. Reabra a planilha principal e confirme que o menu `CRM Lateral` não reaparece.
7. Abra `/crm/` e teste Home, Prospects, Clientes e Agenda.
8. Em emergência, execute `restaurarCrmLateralFase6()`.
