# Portal interno AGF José Bonifácio — entrega técnica

## 1. Objetivo desta entrega

Esta entrega organiza os aplicativos da AGF José Bonifácio dentro do domínio `www.minhaagenciaonline.com.br`, preservando os módulos existentes e adicionando uma camada isolada de portal, autenticação e padronização visual.

A estratégia foi deliberadamente conservadora: os fluxos funcionais já validados não foram reescritos. A nova camada envolve os módulos existentes e introduz mudanças pequenas, rastreáveis e reversíveis.

## 2. Arquitetura entregue

### Front-end Netlify

O ZIP `webagf_AGF_PORTAL_ATUALIZADO.zip` contém o site completo para publicação no Netlify, incluindo:

- nova rota `/agf/` com login e painel de atalhos internos;
- nova rota `/agf/usuarios/` para administração de usuários;
- nova rota `/agf/icones/` para biblioteca dinâmica de ícones e cores;
- nova rota `/sla/` com wrapper em iframe para o Web App existente;
- nova rota `/caixa/` com acesso direto ao Caixa, preservando `/intra/caixa/`;
- nova rota `/nuvemshop/` como alias compatível da rota existente `/nuvem/`;
- atalho discreto para `/agf/` no topo da página pública principal;
- terceiro card público `/cep/` na página principal;
- assets compartilhados de autenticação e identidade visual em `/shared/`;
- ícones PWA com fundo branco e variações por módulo em `/assets/pwa/`;
- manifests e service workers corrigidos por escopo;
- headers de cache para reduzir carregamentos desnecessários sem cachear a configuração crítica de autenticação.

### Backend novo Apps Script

O ZIP `AGF_AUTH_APPS_SCRIPT.zip` é um projeto Apps Script independente. Ele não altera os Web Apps atuais.

Responsabilidades:

- login e senha;
- perfis `admin` e `user`;
- sessões persistentes registradas em planilha;
- revogação de sessões;
- bloqueio básico após tentativas excessivas de login;
- hash iterativo de senha com `salt` individual e `pepper` privado em Script Properties;
- cache de sessões, usuários e configuração visual;
- biblioteca de ícones e cores compartilhada;
- logs de eventos;
- manutenção manual para limpeza de sessões encerradas ou expiradas.

## 3. Matriz de acesso

| Rota | Página pública | Usuário comum | Admin | Observação |
|---|---:|---:|---:|---|
| `/` | Sim | Sim | Sim | Landing principal |
| `/app/` | Sim | Sim | Sim | Também aparece no portal interno |
| `/cep/` | Sim | Sim | Sim | Também aparece no portal interno |
| `/nuvem/` | Sim | Sim | Sim | Rota existente preservada |
| `/nuvemshop/` | Sim | Sim | Sim | Alias para `/nuvem/` |
| `/balcao/` | Não | Sim | Sim | Protegido por guarda de rota |
| `/atende/` | Não | Sim | Sim | Wrapper iframe; iframe só recebe `src` após validação |
| `/sla/` | Não | Sim | Sim | Novo wrapper iframe; iframe só recebe `src` após validação |
| `/caixa/` | Não | Sim | Sim | Acesso direto independente de `/intra/caixa/` |
| `/superfrete-admin/` | Não | Sim | Sim | Senha administrativa antiga deixou de ficar pré-preenchida no HTML |
| `/intra/**` | Não | Não | Sim | Painel interno completo |
| `/agf/usuarios/` | Não | Não | Sim | Administração de acessos |
| `/agf/icones/` | Não | Não | Sim | Ícones e cores globais |

A rota existente `/superfrete/` foi preservada sem alteração de finalidade. A rota `/danfe-simplificado/` continua como tela auxiliar de prévia.

## 4. Sessão persistente

A sessão foi configurada com validade técnica de 3650 dias e permanece ativa no navegador até ocorrer uma destas situações:

- logout explícito;
- revogação pelo administrador;
- desativação do usuário;
- alteração da senha;
- alteração do perfil;
- vencimento da validade técnica de segurança.

Isso evita logins frequentes no balcão sem criar uma sessão matematicamente infinita.

## 5. Segurança: o que está resolvido e qual é o limite da implantação simples

A versão principal funciona com publicação estática por ZIP no Netlify. Cada rota interna executa uma guarda JavaScript antes de exibir conteúdo. Os wrappers `/atende/` e `/sla/` só carregam o iframe remoto depois que a sessão foi validada.

Há um limite técnico importante: uma página estática existe no CDN antes da execução do JavaScript no navegador. Portanto, a guarda de front-end impede o uso operacional normal, mas não deve ser tratada como a única barreira para dados sensíveis.

O pacote `OPTIONAL_NETLIFY_EDGE.zip` inclui uma segunda camada: uma Netlify Edge Function que valida o cookie antes de entregar o HTML das rotas internas. Ela deve ser ativada quando o site estiver sendo publicado por Git ou Netlify CLI.

Mesmo com a camada Edge, os Web Apps Apps Script antigos continuam possuindo URLs independentes. O endurecimento completo exige que cada backend antigo valide a sessão central antes de devolver dados sensíveis. Essa migração foi deixada como etapa incremental, por módulo e com homologação, para evitar quebrar contratos de API atualmente em produção.

## 6. Padronização visual aplicada

### Topbar recomendada e adotada

Foi adotado um padrão compacto:

- altura-base de `56px`;
- logo ou ícone contextual em tile quadrado com cantos arredondados;
- título principal curto;
- subtítulo menor `AGF José Bonifácio`;
- ações contextuais alinhadas à direita;
- Material Symbols Rounded no lugar de emojis decorativos;
- botões compactos com área clicável suficiente;
- comportamento mobile sem deslocamento lateral da página.

Essa solução ocupa menos altura que os heros anteriores e preserva espaço para tabelas, cards e painéis.

### Biblioteca dinâmica

A rota `/agf/icones/` permite ao admin alterar:

- símbolo Material Symbols;
- cor hexadecimal;
- elementos semânticos globais como entrega, CEP, painel, caixa, atendimento, SLA e Nuvemshop.

A substituição automática foi restrita aos símbolos canônicos e aos elementos marcados explicitamente com `data-agf-icon`. Isso evita que uma mudança global troque acidentalmente ícones funcionais como `print`, `timer`, `payments` ou `sync` em telas operacionais.

Limite esperado: ícones que ficam dentro de iframes hospedados em outro domínio não podem ser estilizados pelo CSS do Netlify por causa do isolamento entre origens.

## 7. PWA e ícones mobile

Foram criadas pastas independentes por módulo em `/assets/pwa/`:

- `root`
- `agf`
- `intra`
- `app`
- `cep`
- `caixa`
- `balcao`
- `atende`
- `sla`
- `superfrete`
- `nuvem`

Cada pasta contém:

- `icon-192.png`
- `icon-512.png`
- `icon-192-maskable.png`
- `icon-512-maskable.png`
- `apple-touch-icon.png`
- `favicon-16.png`
- `favicon-32.png`
- `favicon.ico`

Os ícones principais agora têm fundo branco opaco. Isso elimina o fundo preto que aparecia ao salvar atalhos na tela inicial de alguns celulares.

## 8. Performance: alterações aplicadas

### Front-end

- service worker da landing substituído por versão enxuta;
- service workers separados por escopo de aplicativo;
- arquivos estáticos com cache controlado;
- assets versionados por caminho PWA;
- HTML e arquivo de configuração da autenticação com `no-cache`;
- iframes internos carregados somente após autenticação;
- correção de escopos PWA que antes apontavam indevidamente para a raiz;
- redução de heros e paddings verticais sem alterar grids funcionais.

### Backend novo de autenticação

- leituras de planilha em lote;
- cache da lista de usuários;
- cache de sessão validada;
- cache da configuração visual;
- `LockService` em rotinas concorrentes;
- revogação em lote;
- atualização esparsa de `last_seen_at` no máximo uma vez a cada seis horas por sessão;
- rotina de limpeza de sessões encerradas e expiradas.

## 9. Auditoria dos backends antigos

Os ZIPs Apps Script existentes foram inspecionados, mas não foram alterados nesta entrega. Isso evita introduzir regressões em Web Apps que já estão atendendo operação real.

Principais achados:

- a maioria dos projetos já usa leituras e escritas em lote;
- vários módulos já usam `CacheService` e `LockService` em pontos relevantes;
- o módulo Nuvemshop possui webhooks e rotinas de sincronização com escritas concorrentes, mas não apresentou uso de `LockService`; é o candidato prioritário para uma futura homologação isolada;
- APP BASE METRO possui escritas pontuais que podem ser consolidadas em lote em uma otimização posterior, após benchmark;
- Caixa e Serviços ECT merecem medição de tempo de resposta antes de qualquer refatoração, pois otimizar sem perfil de carga poderia aumentar risco sem ganho comprovado.

O relatório técnico detalhado acompanha este pacote.

## 10. Arquivos entregues

- `webagf_AGF_PORTAL_ATUALIZADO.zip`: site completo atualizado para Netlify.
- `AGF_AUTH_APPS_SCRIPT.zip`: projeto Apps Script novo de autenticação.
- `OPTIONAL_NETLIFY_EDGE.zip`: camada opcional de endurecimento no CDN.
- `PACOTE_COMPLETO_AGF_JOSE_BONIFACIO.zip`: documentação, ZIPs novos, originais preservados e rollback.

Leia primeiro `CHECKLIST_IMPLANTACAO_TESTES_ROLLBACK.md`.
