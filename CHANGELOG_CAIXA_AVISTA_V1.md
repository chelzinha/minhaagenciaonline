# Changelog - Caixa à Vista

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
