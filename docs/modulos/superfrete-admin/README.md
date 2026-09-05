# SuperFrete Admin

**Module ID:** `superfrete-admin`  
**Tipo:** interno administrativo  
**Rota:** `/superfrete-admin`  
**Frontend:** `frontend/superfrete-admin`  
**Backends relacionados:** etiquetas, Nuvemshop, NF e rotinas SuperFrete - vínculo exato NÃO CONFIRMADO  
**Dados sensíveis:** SIM

## 1. Finalidade

Administrar fluxos do projeto SuperFrete AGF, incluindo clientes, emissões, histórico, documentos e informações financeiras/operacionais quando aplicável.

## 2. Regras críticas conhecidas

- evitar gravação parcial entre etiqueta, declaração/DC-e e conta corrente;
- validar constantes, nomes de abas e contratos de resposta antes de publicar;
- operações financeiras e consumo de carteira devem ser atômicos/idempotentes sempre que possível;
- não expor dados de um cliente para outro.

## 3. Segurança

**Atenção sensível.** Pode envolver clientes, valores, saldo, limite, documentos fiscais, rastreios e credenciais de integrações. A autorização deve ser validada no backend, não apenas pela interface.

## 4. UX/UI

Como módulo interno, deve usar autenticação AGF, permissão por módulo e shell visual compartilhado. O estado atual dessa padronização precisa ser validado.

## 5. Performance

Listas administrativas devem usar paginação/filtros/cache e evitar carregar histórico completo na abertura.

## 6. Testes mínimos

- autenticação/permissão;
- emissão completa sem estado parcial;
- atualização financeira consistente;
- consulta de histórico;
- filtros/paginação;
- erro/retry controlado;
- mobile básico e desktop operacional.

## 7. Pendências

- mapear actions e arquivos de backend efetivamente usados;
- mapear planilhas `SF_*` e suas chaves sem registrar dados reais;
- confirmar integração com conta corrente/carteira;
- classificar M0-M5 após auditoria visual e de autenticação.