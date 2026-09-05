# Changelog - Caixa à Vista

## 2026-09-04 - Correção do link público Pix no WhatsApp

### Corrigido

- remoção do ícone de link da mensagem do WhatsApp, evitando caractere inválido em clientes que não renderizam o emoji;
- link público alterado para a rota estática segura `/pix/?txid=...`, sem depender de rewrite de rota dinâmica no Cloudflare Pages;
- compatibilidade mantida com o TXID já gravado na cobrança e com a página pública existente;
- cache do Caixa Balcão renovado para distribuir a correção.

## 2026-09-04 - Data e hora no histórico de movimentações

### Adicionado

- data e horário em cada movimentação exibida na aba `Mov.`;
- formato `DD/MM/AAAA · HH:mm`, usando o fuso `America/Fortaleza`;
- horário também nas sangrias exibidas no histórico;
- alteração somente de apresentação no frontend, sem modificar os registros persistidos na planilha.

## 2026-09-04 - Correção de chave Pix com zero à esquerda e mensagem do WhatsApp

### Corrigido

- preservação de zeros à esquerda em chaves Pix documentais vindas da planilha;
- recuperação segura de CPF/CNPJ quando o Google Sheets converte a chave em número e remove zeros iniciais;
- validação de dígitos verificadores antes de qualquer recuperação automática;
- formatação da mensagem do WhatsApp com uma linha em branco entre `Pix Copia e Cola:` e o código;
- cache do Caixa Balcão atualizado para incluir a camada de validação Pix.

### Segurança e compatibilidade

- nenhuma chave Pix foi fixada no código;
- a correção permanece compatível com chaves não documentais, como e-mail, telefone e EVP;
- chaves numéricas só recebem zeros à esquerda quando o CPF/CNPJ reconstruído passa na validação oficial dos dígitos verificadores.

## 2026-08-30 - Integração Santander preparada no Cloudflare

### Adicionado

- provedor Pix automático com fallback local;
- Cloudflare Pages Function para `/api/santander/pix/*`;
- Worker dedicado `agf-santander-pix`;
- suporte a OAuth configurável;
- binding mTLS para certificado cliente;
- KV para token e estado das cobranças;
- criação de cobrança dinâmica com `txid`;
- consulta automática de status;
- webhook idempotente;
- sincronização Worker → Apps Script por HMAC;
- armazenamento de `txid`, `e2eid`, provedor e horário do recebimento;
- bloqueio do fechamento enquanto houver Pix não confirmado;
- modo `disabled`, `mock`, `sandbox` e `production`;
- `_routes.json` para limitar invocações de Pages Functions às rotas bancárias;
- documentação de implantação no Cloudflare.

### Segurança

- nenhuma credencial Santander no frontend ou no Git;
- Client ID, Client Secret e segredos previstos como Cloudflare secrets;
- certificado mTLS previsto como binding do Worker;
- confirmação interna assinada e expirada em cinco minutos;
- conferência do valor recebido antes da confirmação do lançamento.

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
