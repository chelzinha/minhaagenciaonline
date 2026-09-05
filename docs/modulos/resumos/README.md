# Resumos

**Module ID:** `resumos`  
**Tipo:** interno gerencial  
**Rota:** `/intra/resumo`  
**Frontend:** `frontend/intra/resumo`  
**Backend/fontes:** NÃO MAPEADOS integralmente  
**Dados sensíveis:** depende dos dados agregados

## 1. Finalidade

Disponibilizar resumos diário, semanal e mensal da operação em formato de leitura rápida para a equipe/gestão.

## 2. UX/UI

A página usa o shell do `/intra`. Deve privilegiar resumo visual, comparação com meta/período, mensagens curtas e boa leitura mobile.

## 3. Regras

- definir claramente período e data de referência;
- não misturar dias úteis e corridos sem regra explícita;
- cálculos devem ter fonte/fórmula documentada;
- mostrar ausência de dados sem transformar zero em dado inexistente.

## 4. Performance

Resumos são candidatos naturais a dados pré-processados/aba-resumo/cache. Não recalcular histórico completo a cada abertura se o resultado puder ser mantido de forma segura.

## 5. Segurança

Quando houver valores financeiros ou dados estratégicos, restringir por perfil/escopo.

## 6. Testes mínimos

- diário/semanal/mensal;
- troca de período;
- base vazia;
- meta e percentuais;
- dias úteis quando aplicável;
- mobile/desktop.

## 7. Pendências

- mapear fontes e fórmulas;
- confirmar actions e autenticação;
- definir frequência de atualização/cache;
- documentar diferença entre resumo operacional e Dashboard/Inteligência.