# Cadastro de Clientes: base de identidade

## Escopo e estado

Módulo independente em `frontend/cadastros/` e `cloudflare/cadastros-api/`, com D1 `agf-cadastros`. O D1 foi criado e o esquema inicial aplicado em 2026-09-24. O Worker e o frontend desta branch ainda precisam ser publicados; a integração de leitura pelo CRM existente será uma etapa separada. Nada é gravado no D1 do Atende, no RAW, no Apps Script do CRM ou no `agf-core`.

Esta base cuida de **identidade**, não de ficha comercial: `customers` traz um nome padronizado estável; aliases, vínculos conferidos de contrato/cartão e referências às postagens canônicas permitem identificar e revisar esse cliente. Endereço, contato, documento e estágios do CRM ficam fora dela.

## Fonte e regra de resolução

Cada `source_postings` corresponde a um `r.id` da view `atende_postagens_canonicas`. `cliente_portal` vem de `atende_cliente_portal`, o remetente e os dados de contrato da postagem canônica. A cópia mantém os textos recebidos para auditoria, mas o `customers.canonical_name` é editável. A origem do Atende permanece a verdade operacional.

| `CLIENTE PORTAL` | Chave comercial | Comportamento |
| --- | --- | --- |
| `BALCÃO` | `NOME REMETENTE` | Procurar alias `SENDER`; desconhecido fica pendente. |
| `GAS SHOPPING METRO` | `NOME REMETENTE` | Mesma regra, compartilhando o dicionário de remetentes. |
| `GAS SHOPPING CENTRO FASHION` | `NOME REMETENTE` | Mesma regra. |
| Qualquer outro, inclusive `CENTRO FASHION EMPREENDIMENTOS LTDA` | `CLIENTE PORTAL` | Criar cliente e alias `PORTAL` na primeira leitura; uma correção manual pode reunir dois nomes de portal no mesmo `customers.id`. |
| Portal ausente ou remetente ausente num portal compartilhado | Nenhuma | Fila de revisão e eventual associação por postagem. |

`key()` em `src/identity.js` só aplica `trim`, maiúsculas, remoção de acentos e compactação de espaços. Não elimina pontuação, sufixos societários ou palavras. A limpeza semântica é um alias `kind + normalized_name → customer_id`, criado pela tela e registrado no `audit_log`. Um alias `SENDER` só vale para os três portais compartilhados; um `PORTAL` só vale para os demais. Colisão/transferência de alias exige leitura da associação anterior e confirmação explícita. Nenhum contrato ou cartão produz associação automática, pois esses identificadores podem ocorrer em mais de um cliente.

`local_code` é uma propriedade de **cada postagem**. Na consulta ao Atende, aplica a expressão da tabela principal: trava de portal se não há exceção, depois override da postagem, local padrão do atendente, local padrão do remetente e vazio. O cadastro pode portanto aparecer em vários locais; não há `LOCAL` único em `customers`.

## Dados e sincronização

| Tabela | Papel |
| --- | --- |
| `customers` | Identidade comercial, nome e situação. |
| `customer_aliases` | Grafias da origem e vínculo confirmado ou criado automaticamente para portal direto. |
| `source_postings` | Projeção mínima por `source_id`, LOCAL, contrato/cartão observado e resultado da resolução. |
| `customer_contracts` | Relações contrato/cartão registradas manualmente, somente informativas. |
| `audit_log` | Autor, ação, entidade e valores anterior/novo. |
| `sync_state` | Cursor, passagens completas e exclusão mútua do sincronizador. |

O cron de dez em dez minutos lê vinte páginas de até 200 operações; o botão lê uma página. Repetições são idempotentes. Cada passagem completa atualiza registros existentes, detecta mudança de portal/remetente/LOCAL na origem, preserva override manual se a chave de origem não mudou e remove projeções que deixaram de ser canônicas. Se o portal/remetente mudar, o override anterior deixa de valer e a identidade é resolvida novamente. A primeira varredura integral demanda vários ciclos; o painel mostra a contagem de passagens e o cursor. O cursor da origem é `r.id`, não SRO nem contrato.

## Contrato de API

Todas as rotas de dados exigem Bearer validado pela autenticação AGF. Rotas administrativas requerem `role=admin` (`/api/status`, `/api/sync`, `/api/customers`, `/api/aliases`, `/api/contracts`, `/api/review`, `/api/postings/:id/resolve`). A tela usa acesso `intra` de administrador. A leitura `GET /api/v1/postings?after=<source_id>&limit=200` é permitida também a usuários com acesso ao aplicativo `crm` e retorna `source_id`, `customer_id`, `canonical_name`, `local_code`, `resolution` e `nextAfter`. Registros `PENDING` conservam `customer_id=null`. Paginação por cursor permite a outro módulo consumir a mesma identidade sem acessar o banco do Atende diretamente.

O CRM ainda lê seu backend atual. Antes de migrar, deve associar sua postagem ao `source_id` canônico do Atende, consumir a base acima, agrupar por `customer_id + local_code` e tratar pendências sem inventar cliente. Dados comerciais permanecem no CRM. A futura junção com `agf-core` será definida depois, mantendo a nomenclatura `customers`.

## Publicação e verificação

1. Confirmar `database_id` do `agf-cadastros` e binding `ATENDE_DB` em `wrangler.jsonc`. O esquema remoto inicial já foi aplicado via D1 API. Registrar a migration no histórico do Wrangler ao habilitar esse fluxo; ela é idempotente.
2. Instalar dependências em `cloudflare/cadastros-api/`, executar `npm test`, `npx wrangler d1 migrations apply agf-cadastros --local` e publicar o Worker com a conta correta. Revisar as permissões do token de deploy para **ambos** os D1.
3. Conferir `GET /health`, autorização administrativa e uma página de `/api/sync`; comparar uma amostra de `CLIENTE PORTAL`, remetente e `LOCAL` com a tabela do Atende. Depois completar a primeira passagem, conferir totais, pendências e origem canônica.
4. Publicar `frontend/` pela Cloudflare Pages segundo `docs/DEPLOY.md`, testar `/cadastros/` com administrador e negar acesso a usuário comum. O link no `/intra/` entra com este frontend.

O nome da conta Workers foi conferido como `chelzinha`. Não há dados reais de clientes codificados na migration nem seeds de aliases. O D1 criado contém somente a estrutura e o cursor inicial até a publicação/sincronização.
