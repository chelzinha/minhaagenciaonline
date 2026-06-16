# Fase 8 — Backend aditivo do refinamento fino

Execute após importar o pacote:

```javascript
setupCrmRefinamentoFase8()
smokeTestCrmRefinamentoFase8()
```

A nova aba `CRM_ANOTACOES` é criada de forma aditiva e append-only.

Novas rotas:
- GET `get_entity_notes_v8`
- POST `save_entity_note_v8`

A gravação aceita `REQUEST_ID` para impedir duplicação em retentativas de rede.

Também foi propagado `LOCAL` e `CURVA` no payload analítico de `CRM → Ações`, mantendo a compatibilidade com o dashboard incorporado.
