# Fase 5 — Limpeza controlada de COLETAS

## Pré-requisitos
- Fases 1 a 4 implantadas.
- Novo módulo `/crm/` homologado.
- Backup manual adicional recomendado antes do deploy.

## Ordem obrigatória

### 1. Publicar este backend mantendo a mesma URL `/exec`
A publicação desativa novas coletas e impede recriação automática da aba legada.

### 2. Visualizar o impacto sem gravar
```javascript
previewRemocaoColetasFase5()
```

### 3. Criar uma cópia externa completa da planilha
```javascript
backupAntesRemocaoColetasFase5()
```
Guarde o campo `backupUrl` retornado pela função.

### 4. Executar a remoção física explícita
```javascript
removeColetasFase5('EXCLUIR_COLETAS')
```

### 5. Auditar
```javascript
auditRemocaoColetasFase5()
```
Resultado esperado:
```text
ok: true
residualTotal: 0
```

### 6. Consultar status consolidado
```javascript
getStatusRemocaoColetasFase5()
```

## Importante
- Não execute versões antigas dos setups após a limpeza. Elas podem recriar estruturas legadas.
- Use somente este pacote ou versões posteriores.
- A planilha lateral `APP CRM Metrô` ainda não é arquivada nesta fase.


## Fix 5.0.1 — execução manual no editor
O editor do Apps Script executa funções sem argumentos. Para realizar a exclusão confirmada pelo seletor **Executar**, use:
```javascript
executarRemocaoColetasConfirmadaFase5()
```
A função chama internamente `removeColetasFase5('EXCLUIR_COLETAS')`.
