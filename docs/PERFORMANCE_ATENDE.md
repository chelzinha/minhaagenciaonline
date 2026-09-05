# Performance do Atende

## 2026-06-19

Plano de otimização do painel Atende:

1. Evitar carregar a aba Postagens inteira na abertura.
2. Ler primeiro a coluna Data.
3. Buscar apenas os blocos de linhas do período solicitado.
4. Manter todas as colunas atuais do painel.
5. Retornar métricas em payload.meta para medir tempo, total da planilha e total retornado.

A alteração não registra payloads reais nem segredos.
