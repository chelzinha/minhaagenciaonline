# Inteligência - Operacional

**Module ID:** `inteligencia-operacional`  
**Rota:** `/intra/inteligencia/operacional`  
**Frontend:** `frontend/intra/inteligencia/operacional`  
**Tipo:** interno analítico/operacional  
**Autenticação:** AGF_ACCESS confirmado  
**Backend/fontes:** NÃO MAPEADOS integralmente

## Finalidade

Consolidar indicadores operacionais da agência para acompanhamento de volume, fluxo e desempenho.

## Regras

- usar dados agregados e pré-processados;
- detalhamento apenas sob demanda;
- filtros devem respeitar unidade/período;
- métricas precisam de definição e origem documentadas.

## Segurança

Pode expor dados estratégicos e, em drill-down, dados de postagem. Restringir acesso conforme perfil.

## Performance

É candidato natural a aba-resumo/cache, evitando leitura de bases históricas completas na abertura.

## Testes

- permissão;
- filtros;
- indicadores versus fonte;
- base vazia;
- grande volume;
- atualização/cache;
- desktop/mobile.

## Pendências

- mapear fontes e planilhas;
- documentar indicadores;
- definir TTL/invalidação de cache;
- confirmar module_id real.