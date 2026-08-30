# Changelog - Caixa à Vista

## 2026-08-30 - V1 de homologação

### Adicionado

- rota independente `/caixa-avista/`;
- interface mobile-first no estilo maquineta;
- um lançamento por atendimento;
- pagamentos Dinheiro, Pix, Débito e Crédito;
- pesquisa de clientes por conteúdo, palavras em qualquer ordem e texto normalizado;
- cadastro instantâneo pelo ícone `+`;
- teclado numérico próprio com deslocamento automático de centavos;
- quantidade de objetos por atendimento;
- geração de QR Code Pix e Pix Copia e Cola com valor;
- compartilhamento por mecanismo nativo e fallback para WhatsApp;
- status Pix confirmado ou pendente;
- movimentos do dia;
- lançamento em lote;
- despesas;
- resumo fixo de receitas, despesas e saldo;
- fechamento operacional e conferência financeira separados;
- backend Apps Script novo, com planilha própria;
- exportação Conta Azul somente por snapshot de fechamento;
- controle contra duplicação de exportação;
- autenticação JWT AGF e LockService.

### Preservado

- caixa legado em `/caixa/` sem alterações;
- formato de 32 colunas da importação Conta Azul;
- categorias e contas financeiras configuráveis.
