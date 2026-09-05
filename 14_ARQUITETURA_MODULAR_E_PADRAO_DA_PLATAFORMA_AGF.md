# 14 - Arquitetura Modular e Padrão da Plataforma AGF

**Data:** 05/09/2026  
**Repositório principal:** `chelzinha/minhaagenciaonline`  
**Branch de produção:** `main`  
**Plataforma:** `www.minhaagenciaonline.com.br`  
**Hospedagem atual do site:** Cloudflare  
**Fonte oficial do código:** Git/GitHub  
**Ambiente de edição técnica:** VS Code + terminal, quando a atualização não puder ser feita diretamente pelo ChatGPT  
**Backends principais:** Google Apps Script  
**Status:** complemento arquitetural ao documento `13 - Plano Mestre de Correções da Auditoria da Plataforma AGF`  
**Objetivo:** impedir que a Plataforma Digital AGF se torne um conjunto fragmentado de aplicativos isolados, definindo uma arquitetura modular, integrada, padronizada, leve e governável.

---

# 1. Finalidade deste documento

Este documento complementa o Plano Mestre de Correções da Auditoria da Plataforma AGF.

O documento 13 define como corrigir, auditar, documentar, testar e registrar mudanças na plataforma. Este documento 14 define **como a plataforma deve ser pensada daqui para frente**.

A ideia central é:

```text
A Plataforma Digital AGF não deve ser um conjunto de páginas soltas.
Ela deve ser uma plataforma modular, integrada, com identidade visual única,
autenticação centralizada, permissões por módulo e componentes reaproveitáveis.
```

Este documento deve ser usado sempre que houver:

- criação de novo módulo;
- criação de nova tela interna;
- integração com API externa;
- mudança de autenticação;
- mudança de layout;
- mudança de navegação;
- migração de módulo antigo para o padrão atual;
- revisão de frontend;
- revisão de performance;
- organização de permissões;
- definição de pacote comercial ou operacional para cliente.

---

# 2. Problema que este documento resolve

A plataforma já possui vários produtos úteis, mas existe risco de fragmentação.

Riscos identificados:

- cada módulo nascer com layout próprio;
- cada tela ter um cabeçalho diferente;
- cada app usar um botão de sair diferente;
- algumas páginas exibirem avatar do usuário e outras não;
- a home usar ícone diferente dos módulos;
- módulos não saberem que outros módulos existem;
- permissões ficarem espalhadas ou inconsistentes;
- novos produtos serem criados sem entrar no mapa geral da plataforma;
- integrações externas ficarem acopladas a um único cliente;
- funcionalidades quase prontas não chegarem a uma versão final reutilizável;
- retrabalho por falta de padrão visual, técnico e documental;
- crescimento da plataforma como um “Frankenstein”: muito desenvolvimento, pouca coesão.

A correção não é reescrever tudo.

A correção é criar um **padrão mestre** e migrar cada módulo aos poucos, preservando o que já funciona.

---

# 3. Princípio principal

Todo módulo deve responder a três perguntas antes de existir:

```text
1. Qual problema real ele resolve?
2. Com quais módulos ele se comunica?
3. Qual padrão da plataforma ele reutiliza?
```

Se um módulo não se comunica com nada, não usa o padrão visual e não está no controle de permissões, ele ainda não está plenamente integrado à Plataforma AGF.

---

# 4. Definição de módulo

Um módulo é uma unidade funcional da plataforma com objetivo claro, rota própria, permissão própria e contrato de dados conhecido.

Um módulo pode ser:

- uma área interna da agência;
- uma ferramenta operacional;
- uma integração externa;
- um conector com plataforma de e-commerce;
- um conector fiscal;
- um painel;
- uma experiência pública de cliente;
- um componente técnico compartilhado.

Exemplos:

| Tipo | Exemplos |
|---|---|
| Interno operacional | Caixa, CRM, SLA, Reverso Admin, Expedição |
| Comercial/gestão | Dashboard, Inteligência, Carteira, Comercial |
| Cliente externo | Minhas Postagens, Logística Reversa, Cartões digitais |
| Canal de venda | Nuvemshop, Bagy, Loja Integrada, Tray |
| Fiscal | Bling, Tiny, Nuvemshop NF-e, DC-e, upload manual de DANFE |
| Postagem | Correios CWS, SuperFrete, Balcão, postagem manual |
| Retorno | Nuvemshop Tracking, Bagy Tracking, WhatsApp, e-mail |
| Compartilhado | Autenticação, Barra AGF, Design System, API client, logs, permissões |

---

# 5. Camadas oficiais da plataforma

A Plataforma AGF deve ser organizada em camadas.

```text
Cloudflare / Frontend
        ↓
Barra AGF / Shell visual / Rotas
        ↓
Autenticação AGF / Permissões por módulo
        ↓
Módulos de negócio
        ↓
Backends Google Apps Script
        ↓
Planilhas / Drive / APIs externas
        ↓
Logs / Auditoria / Documentação / Git
```

Nenhuma camada deve assumir responsabilidade que pertence a outra.

---

# 6. Infraestrutura oficial

## 6.1. Hospedagem

A hospedagem atual do site e dos frontends da Plataforma AGF deve ser tratada como:

```text
Cloudflare
```

Sempre que algum documento mencionar Netlify como hospedagem atual, deve ser revisado conforme o estado real do projeto.

Netlify pode existir como histórico, preview, legado ou ambiente anterior, mas a documentação atual deve deixar claro o que está realmente em produção.

## 6.2. Código fonte

A fonte oficial do código é:

```text
Git/GitHub
```

Nenhuma versão publicada deve existir apenas em:

- conversa de ChatGPT;
- ZIP local;
- Apps Script editado manualmente;
- pasta de Drive;
- arquivo solto no computador;
- memória humana;
- print de conversa;
- código colado em WhatsApp.

Quando uma alteração for aplicada diretamente no Apps Script ou em Cloudflare por urgência, ela deve ser trazida de volta para o GitHub depois.

## 6.3. Fluxo de atualização

Fluxo preferencial:

```text
GitHub
↓
alteração controlada
↓
commit claro
↓
deploy Cloudflare ou Apps Script
↓
teste pós-deploy
↓
CHANGELOG/documentação
```

Quando o ChatGPT conseguir executar a alteração via GitHub, a atualização deve ser feita por commit no repositório.

Quando o ChatGPT não conseguir subir sozinho, Rachel atualiza via:

```text
VS Code
+
terminal
+
Git
```

Mesmo nesse caso, a regra continua sendo:

```text
Toda mudança relevante precisa terminar em commit.
```

## 6.4. Backend

O backend principal da plataforma é composto por projetos Google Apps Script.

Apps Script deve ser tratado como produção:

- URLs `/exec` precisam ser documentadas;
- URLs `/dev` devem ser separadas de produção;
- PropertiesService deve guardar configurações e segredos quando aplicável;
- triggers devem ser inventariados;
- planilhas usadas como banco devem ter schema documentado;
- mudanças em actions/endpoints exigem teste de regressão.

---

# 7. Tipos oficiais de módulos

## 7.1. Módulos internos autenticados

São módulos usados pela equipe da agência.

Exemplos:

- `/intra`;
- `/crm`;
- `/caixa`;
- `/sla`;
- `/atende`;
- `/reverso-admin`;
- `/reverso-expedicao`;
- `/reverso-coleta`.

Regras obrigatórias:

- usar autenticação AGF;
- declarar `window.AGF_ACCESS` ou mecanismo equivalente;
- respeitar perfil de usuário;
- usar padrão visual compartilhado;
- exibir topbar/cabeçalho padronizado quando estiver dentro da experiência interna;
- oferecer botão de sair padronizado;
- exibir avatar ou identificação do usuário quando o contexto exigir;
- não depender apenas de botão escondido no frontend para segurança.

## 7.2. Módulos externos para clientes

São módulos usados por clientes, lojistas ou usuários externos.

Exemplos:

- Minhas Postagens;
- Logística Reversa;
- Conector Nuvemshop;
- futuro Conector Bagy;
- futuro Conector Bling;
- páginas de instrução para clientes.

Regras obrigatórias:

- linguagem clara e orientada;
- layout compatível com a identidade AGF;
- validações antes de enviar dados para o backend;
- mensagens de erro amigáveis;
- logs sem exposição de dados sensíveis;
- separação clara entre dados do cliente e dados da agência;
- documentação do fluxo de suporte.

## 7.3. Módulos públicos institucionais

São páginas públicas, como cartões digitais, páginas comerciais, materiais de apoio e landing pages.

Regras obrigatórias:

- identidade visual AGF;
- performance alta;
- responsividade real;
- SEO/social preview coerente quando aplicável;
- sem dependência de autenticação, salvo se a página for restrita;
- sem dados sensíveis no HTML.

## 7.4. Módulos técnicos compartilhados

São componentes usados por vários módulos.

Exemplos:

- autenticação AGF;
- route guard;
- design system;
- barra AGF;
- cliente de API;
- helpers de data;
- helpers de validação;
- tratamento de erros;
- logger;
- cache;
- componentes de UI.

Regra principal:

```text
Se algo aparece em 2 ou mais módulos, deve ser candidato a componente compartilhado.
```

---

# 8. Plataforma como composição de módulos

A visão de produto da Plataforma AGF deve ser modular.

Em vez de criar um aplicativo fechado para cada cliente, a AGF deve combinar módulos conforme o perfil operacional.

## 8.1. Modelo conceitual

```text
Cliente
↓
Perfil operacional
↓
Canal de venda
+
ERP/fiscal
+
Postagem
+
Retorno de rastreio
+
Atendimento/coleta
```

## 8.2. Exemplos

| Cliente | Canal de venda | Fiscal | Postagem | Retorno |
|---|---|---|---|---|
| Arpoador | Nuvemshop | Bling | Correios CWS | Nuvemshop |
| Cliente B | Nuvemshop | Nuvemshop NF-e | Correios CWS | Nuvemshop |
| Cliente C | Bagy | Bling | Correios CWS | Bagy |
| Cliente D | Loja Integrada | Tiny | Correios CWS | Loja Integrada |
| Cliente E | Manual | DC-e | Balcão AGF | WhatsApp |
| Cliente F | Marketplace | DANFE manual | SuperFrete | Manual |

## 8.3. Produto comercial resultante

A AGF pode vender a plataforma como:

```text
Módulos que conectam loja, nota fiscal, etiqueta, postagem, coleta e rastreio
conforme a rotina de cada cliente.
```

Isso evita criar produtos isolados.

A cada novo cliente, a pergunta deixa de ser:

```text
Que app novo preciso criar?
```

E passa a ser:

```text
Quais módulos existentes resolvem esse perfil?
Qual módulo novo realmente falta?
```

---

# 9. Famílias oficiais de módulos de integração

## 9.1. Canal de venda

Responsável por importar pedidos e, quando possível, devolver rastreio.

Exemplos:

- Nuvemshop;
- Bagy;
- Tray;
- Loja Integrada;
- Shopify;
- WooCommerce;
- pedido manual.

Contrato mínimo de saída:

```json
{
  "source": "NUVEMSHOP",
  "storeId": "...",
  "orderId": "...",
  "orderNumber": "...",
  "status": "...",
  "paymentStatus": "...",
  "customer": {},
  "recipient": {},
  "items": [],
  "shipping": {},
  "raw": {}
}
```

## 9.2. Fiscal

Responsável por encontrar ou gerar documento fiscal/documento complementar.

Exemplos:

- Bling;
- Tiny;
- Nuvemshop NF-e;
- DC-e;
- upload manual de DANFE;
- declaração de conteúdo.

Contrato mínimo de saída:

```json
{
  "found": true,
  "source": "BLING",
  "docType": "NFE",
  "status": "AUTORIZADA",
  "invoiceId": "...",
  "invoiceNumber": "...",
  "accessKey": "...",
  "danfeUrl": "...",
  "xmlUrl": "...",
  "raw": {}
}
```

## 9.3. Postagem

Responsável por gerar a etiqueta ou registrar a forma de postagem.

Exemplos:

- Correios CWS;
- Correios Pré-Postagem;
- SuperFrete;
- Balcão;
- etiqueta manual enviada pelo cliente.

Contrato mínimo de saída:

```json
{
  "provider": "CORREIOS_CWS",
  "service": "SEDEX",
  "contract": "...",
  "card": "...",
  "trackingCode": "...",
  "prePostingId": "...",
  "labelUrl": "...",
  "declarationUrl": "...",
  "status": "GERADA"
}
```

## 9.4. Retorno

Responsável por devolver rastreio e status para o canal correto.

Exemplos:

- retorno para Nuvemshop;
- retorno para Bagy;
- retorno para Tray;
- retorno para Bling;
- envio por WhatsApp;
- envio por e-mail;
- atualização manual assistida.

Contrato mínimo de saída:

```json
{
  "target": "NUVEMSHOP",
  "orderId": "...",
  "trackingCode": "...",
  "trackingUrl": "...",
  "syncStatus": "OK",
  "syncedAt": "..."
}
```

---

# 10. Registro obrigatório de módulos

Todo módulo deve existir em um registro central.

Documento sugerido:

```text
docs/MAPA_MODULOS.md
```

ou:

```text
APP_REGISTRY.md
```

Campos mínimos:

| Campo | Descrição |
|---|---|
| `module_id` | Chave única do módulo |
| `nome` | Nome visível |
| `tipo` | interno, externo, público, técnico, integração |
| `rota` | URL ou rota principal |
| `frontend_path` | pasta no repositório |
| `backend_path` | pasta Apps Script ou backend relacionado |
| `auth_required` | SIM/NÃO |
| `roles` | perfis permitidos |
| `apps` | chaves usadas na autenticação |
| `planilhas` | bases usadas |
| `apis_externas` | integrações externas |
| `status` | produção, homologação, desenvolvimento, legado, desativado |
| `owner_tecnico` | responsável técnico |
| `owner_operacional` | responsável operacional |
| `dados_sensiveis` | SIM/NÃO |
| `documentacao` | docs relacionados |
| `ultimo_deploy` | data ou referência |
| `observacoes` | riscos, dependências, pendências |

Status permitidos:

```text
PRODUÇÃO
HOMOLOGAÇÃO
EM DESENVOLVIMENTO
LEGADO
DESATIVADO
```

---

# 11. Permissões e liberação por perfil

A Plataforma AGF deve continuar evoluindo com liberação por perfil e por módulo.

## 11.1. Princípio

Não basta o usuário estar logado.

Ele precisa ter acesso ao módulo solicitado.

```text
Usuário autenticado
+
perfil autorizado
+
módulo liberado
=
acesso permitido
```

## 11.2. Camadas de permissão

| Camada | Exemplo |
|---|---|
| Perfil global | admin, manager, user |
| Módulo | crm, caixa, intra, reverso-admin |
| Unidade | AGF, Metrô, Centro, rota, cliente externo |
| Escopo operacional | leitura, escrita, exclusão, exportação |
| Dados | só próprios, unidade, todos |

## 11.3. Regra de segurança

O frontend pode esconder botões, mas o backend deve validar permissão.

Proibido depender apenas de:

- botão escondido;
- rota não divulgada;
- URL difícil;
- campo HTML desabilitado;
- validação apenas no navegador.

Toda action sensível precisa validar no Apps Script:

- sessão;
- usuário;
- perfil;
- módulo;
- autorização para a ação;
- ownership do dado quando aplicável.

---

# 12. Barra AGF e shell visual

A Barra AGF deve ser tratada como a experiência padrão para os módulos internos.

Todo módulo interno deve preferencialmente usar o mesmo shell:

```text
Topo padrão
+
identificação da plataforma
+
avatar/usuário
+
botão de sair
+
atalhos ou navegação coerente
+
área de conteúdo
```

## 12.1. Itens obrigatórios do cabeçalho interno

- nome ou marca AGF;
- nome do módulo;
- indicação de ambiente quando não for produção;
- avatar ou iniciais do usuário;
- menu do usuário quando aplicável;
- botão de sair padronizado;
- link de volta para `/intra` ou home interna;
- feedback de carregamento/autenticação.

## 12.2. Itens que não devem variar sem motivo

- posição do botão sair;
- aparência do avatar;
- ícone da home;
- estilo dos cards;
- estilo dos botões primários;
- padrão de tabela;
- mensagens de erro;
- loading;
- espaçamento geral;
- tipografia;
- tokens de cor.

## 12.3. Regra para novos módulos

Novo módulo interno não deve nascer com layout isolado.

Antes de criar CSS próprio, verificar se já existe:

- `frontend/shared/ui/agf-ui.css`;
- `frontend/intra/styles/app-shell.css`;
- componentes usados em `/intra`;
- componentes usados em módulos já padronizados.

CSS específico só deve existir para diferenças reais do módulo.

---

# 13. Design system e estilo compartilhado

A plataforma deve ter um pacote visual compartilhado.

## 13.1. Objetivo

Garantir que todos os módulos pareçam partes da mesma plataforma.

## 13.2. Componentes mínimos padronizados

- botão primário;
- botão secundário;
- botão perigoso;
- botão de ícone;
- avatar;
- card;
- painel;
- tabela;
- chip/badge;
- toast;
- modal;
- loading;
- empty state;
- mensagem de erro;
- input;
- select;
- filtros;
- tabs;
- topbar;
- breadcrumb/voltar;
- layout mobile.

## 13.3. Tokens obrigatórios

- cores institucionais;
- cores de status;
- espaçamentos;
- raio de borda;
- sombra;
- fonte;
- tamanhos de título;
- tamanhos de texto;
- largura máxima de conteúdo;
- breakpoints mobile.

## 13.4. Regra anti-desalinhamento visual

Se dois módulos têm a mesma função visual, devem usar o mesmo componente.

Exemplos:

- o botão “Sair” deve ter o mesmo comportamento e aparência;
- o avatar deve seguir o mesmo padrão;
- cards de resumo devem usar a mesma linguagem;
- tabelas devem ter hierarquia semelhante;
- erros devem aparecer com o mesmo tom e componente.

---

# 14. Performance como regra da plataforma

Todo módulo deve prezar por carregamento rápido.

A plataforma não deve ficar bonita e pesada.

## 14.1. Regras mínimas

- evitar carregar bases inteiras sem necessidade;
- usar paginação, filtros ou carregamento sob demanda;
- usar cache quando fizer sentido;
- evitar múltiplas chamadas repetidas ao Apps Script;
- reduzir scripts inline enormes;
- reduzir CSS duplicado;
- evitar imagens pesadas;
- usar loading claro;
- não bloquear a tela sem feedback;
- testar em celular e rede instável.

## 14.2. Apps Script

Nos backends Apps Script:

- evitar `getValue`/`setValue` dentro de loops;
- preferir `getValues`/`setValues`;
- usar `LockService` em escrita concorrente;
- usar `CacheService` quando a informação for segura e pouco mutável;
- evitar `SpreadsheetApp.openById` repetido na mesma execução;
- retornar apenas os dados necessários para a tela.

## 14.3. Cloudflare

Na hospedagem Cloudflare:

- controlar cache com cuidado;
- versionar assets quando necessário;
- testar atualização em aba anônima;
- garantir que service workers não mantenham versão antiga sem controle;
- documentar o processo de deploy.

---

# 15. Comunicação entre módulos

Módulos não devem acessar diretamente estruturas internas uns dos outros sem contrato.

## 15.1. Regra

A comunicação deve acontecer por contratos claros:

```text
input esperado
+
output retornado
+
erros possíveis
+
permissões necessárias
+
logs gerados
```

## 15.2. Exemplo

O módulo Nuvemshop não deve “saber tudo” sobre Bling, Tiny ou DC-e.

Ele deve apenas dizer:

```text
Tenho este pedido e preciso do documento fiscal correspondente.
```

O módulo fiscal responde:

```text
Encontrei NF-e no Bling.
Aqui está chave, status e DANFE.
```

Assim, o mesmo fiscal Bling pode servir para:

- Nuvemshop + Bling;
- Bagy + Bling;
- Loja Integrada + Bling;
- pedido manual + Bling.

---

# 16. Perfis operacionais de clientes

A plataforma deve permitir montar pacotes conforme a operação do cliente.

## 16.1. Exemplo de cadastro de perfil

```json
{
  "cliente_id": "CLI_000175",
  "nome": "Arpoador",
  "canal_venda": "NUVEMSHOP",
  "fiscal": "BLING",
  "postagem": "CORREIOS_CWS",
  "retorno_rastreio": "NUVEMSHOP",
  "coleta": "AGF",
  "status": "ATIVO"
}
```

## 16.2. Benefício

Com esse modelo, a AGF não vende apenas um app.

Ela vende uma solução configurável:

```text
Entendemos sua rotina e ativamos os módulos certos para loja, nota, etiqueta e rastreio trabalharem juntos.
```

---

# 17. Regra para criação de novo módulo

Antes de criar um módulo novo, preencher:

```md
## Proposta de módulo

Nome:
Module ID:
Tipo:
Problema resolvido:
Usuário principal:
Rota prevista:
Frontend:
Backend:
Planilhas:
APIs externas:
Dados sensíveis:
Perfis permitidos:
Módulos relacionados:
Contrato de entrada:
Contrato de saída:
Layout base:
Componentes compartilhados usados:
Critério de sucesso:
Plano de teste:
Rollback:
```

Se esse formulário não puder ser preenchido, o módulo ainda não está pronto para desenvolvimento.

---

# 18. Regra para corrigir módulo existente

Antes de corrigir um módulo existente:

1. identificar se ele já está em produção;
2. identificar se usa autenticação AGF;
3. identificar se está no controle de permissões;
4. identificar se usa shell visual compartilhado;
5. identificar se usa CSS próprio desnecessário;
6. identificar se conversa com outros módulos;
7. identificar se está documentado;
8. identificar se o GitHub corresponde ao que está publicado;
9. corrigir com menor mudança segura;
10. registrar no CHANGELOG.

---

# 19. Padrão mínimo para uma página interna

Toda página interna deve ter:

```html
<link rel="stylesheet" href="/shared/ui/agf-ui.css">
<script src="/shared/auth/agf-auth-config.js"></script>
<script src="/shared/auth/agf-auth-client.js"></script>
<script>
  window.AGF_ACCESS = {
    roles: ['admin', 'manager', 'user'],
    app: 'module-id'
  };
</script>
<script src="/shared/auth/agf-route-guard.js"></script>
```

A lista de roles e o `app` devem ser ajustados conforme o módulo.

Quando o módulo estiver dentro de `/intra`, deve preferir também o padrão do shell interno.

---

# 20. Regra para módulos em `/intra`

A rota `/intra` deve ser tratada como área interna principal da plataforma.

Ela deve funcionar como:

- home operacional;
- central de acesso aos módulos;
- hub de navegação;
- referência visual;
- experiência padrão da equipe.

Módulos dentro de `/intra` devem:

- aparecer ou desaparecer conforme permissão;
- usar cards padronizados;
- respeitar a mesma identidade visual;
- manter cabeçalho/topbar coerente;
- ter rota documentada;
- ter status conhecido: produção, homologação, desenvolvimento, legado ou desativado.

---

# 21. Regra para módulos fora de `/intra`

Nem todo módulo precisa estar fisicamente dentro de `/intra`.

Alguns módulos podem ter rota própria por necessidade técnica ou de experiência:

- `/crm`;
- `/caixa`;
- `/balcao`;
- `/reverso-admin`;
- `/reverso-coleta`;
- `/nuvemshop`;
- páginas públicas.

Mas, se forem módulos internos, ainda devem respeitar:

- autenticação AGF;
- permissão por módulo;
- padrão visual compartilhado;
- botão sair padronizado;
- retorno para área principal;
- documentação no mapa de módulos.

---

# 22. Regra para documentação

Todo módulo deve ter documentação proporcional ao seu impacto.

## 22.1. Módulo pequeno

- entrada no CHANGELOG;
- registro no mapa de módulos, se for novo.

## 22.2. Módulo médio

- README próprio ou seção no README da área;
- CHANGELOG;
- documentação de dados, se usar planilha;
- documentação de permissões.

## 22.3. Módulo estrutural

- README;
- CHANGELOG;
- fluxo ponta a ponta;
- contrato de API;
- modelo de dados;
- permissões;
- deploy;
- rollback;
- registro de decisão técnica.

## 22.4. Módulo sensível

Além dos itens acima:

- registro de mudança sensível;
- documentação de credenciais sem segredos;
- validação LGPD;
- plano de auditoria de logs;
- teste de autorização no backend.

---

# 23. Regra de compatibilidade

Ao padronizar módulos antigos, não quebrar o que já funciona.

Preferência:

```text
1. criar camada compartilhada;
2. adaptar uma tela piloto;
3. testar;
4. migrar aos poucos;
5. remover duplicações somente depois de confirmar estabilidade.
```

Evitar:

- reescrever módulo inteiro por estética;
- trocar action sem necessidade;
- mudar nome de aba;
- mudar schema sem migração;
- mudar rota sem redirecionamento;
- trocar autenticação de vários módulos ao mesmo tempo;
- publicar redesign junto com correção sensível.

---

# 24. Auditoria visual obrigatória

Todo módulo interno deve passar por auditoria visual com estes itens:

- [ ] usa cabeçalho/topbar padrão;
- [ ] exibe avatar ou identificação do usuário quando aplicável;
- [ ] botão sair padronizado;
- [ ] link para home interna ou contexto anterior;
- [ ] cards seguem padrão;
- [ ] tabelas seguem padrão;
- [ ] botões seguem hierarquia visual;
- [ ] mensagens de erro são claras;
- [ ] loading existe;
- [ ] estado vazio existe;
- [ ] layout mobile funciona;
- [ ] não há scroll horizontal indevido;
- [ ] fontes e espaçamentos são coerentes;
- [ ] não há CSS duplicado desnecessário;
- [ ] não há ícones divergentes para a mesma ação.

---

# 25. Auditoria técnica obrigatória

Todo módulo deve passar por auditoria técnica com estes itens:

- [ ] rota registrada;
- [ ] módulo registrado no mapa;
- [ ] autenticação definida;
- [ ] roles definidos;
- [ ] backend valida autorização;
- [ ] actions classificadas;
- [ ] planilhas documentadas;
- [ ] cabeçalhos documentados;
- [ ] PropertiesService documentado sem segredos;
- [ ] logs sem dados sensíveis desnecessários;
- [ ] deploy documentado;
- [ ] rollback possível;
- [ ] CHANGELOG atualizado;
- [ ] GitHub corresponde ao publicado.

---

# 26. Classificação de dívida modular

Usar esta classificação ao auditar módulos existentes:

## M0 - Integrado

Módulo segue padrão visual, autenticação, permissões, documentação e deploy.

## M1 - Funcional, mas desalinhado visualmente

Módulo funciona, mas precisa entrar no shell visual/design system.

## M2 - Funcional, mas isolado tecnicamente

Módulo funciona, mas não conversa bem com autenticação, permissões ou mapa da plataforma.

## M3 - Prova de conceito

Módulo tem valor, mas ainda não virou produto final estável.

## M4 - Legado ou risco

Módulo pode estar em uso, mas tem risco de segurança, dados, deploy ou manutenção.

## M5 - Desativar ou arquivar

Módulo não deve continuar como produto ativo.

---

# 27. Ordem recomendada de saneamento modular

Não tentar corrigir tudo ao mesmo tempo.

Ordem recomendada:

1. registrar todos os módulos existentes;
2. classificar cada módulo de M0 a M5;
3. identificar módulos críticos em produção;
4. padronizar autenticação e route guard;
5. padronizar cabeçalho/topbar/avatar/sair;
6. consolidar design system;
7. revisar performance dos módulos mais usados;
8. documentar fluxos reais;
9. consolidar integrações externas;
10. arquivar módulos obsoletos.

---

# 28. Relação com o documento 13

Este documento não substitui o documento 13.

O documento 13 continua sendo o roteiro de correção, segurança, documentação, changelog, testes, rollback e conclusão.

Este documento 14 acrescenta a regra arquitetural:

```text
Toda correção ou novo desenvolvimento deve fortalecer a plataforma modular,
não aumentar a fragmentação.
```

Sempre que houver conflito aparente:

```text
preservar produção
+
seguir segurança
+
modularizar sem quebrar
+
documentar no GitHub
```

---

# 29. Resultado esperado

A Plataforma Digital AGF deve evoluir para este modelo:

```text
Uma plataforma única
com módulos independentes,
interfaces consistentes,
permissões centralizadas,
integrações reaproveitáveis,
backends documentados,
deploy rastreável,
performance adequada
e identidade AGF reconhecível em todas as telas.
```

O objetivo não é ter muitos aplicativos.

O objetivo é ter uma plataforma que permita criar, combinar e evoluir soluções sem retrabalho.

---

# 30. Frase-guia

```text
Cada novo módulo deve parecer que sempre fez parte da Plataforma AGF.
```

Se a tela, o fluxo, o botão de sair, o avatar, a autenticação, os dados e a documentação parecem de outro sistema, o módulo ainda não está pronto para produção.
