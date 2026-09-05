# Mapa técnico dos módulos

**Baseline:** 05/09/2026  
**Plataforma:** `www.minhaagenciaonline.com.br`  
**Frontend principal:** Cloudflare  
**Código fonte:** Git/GitHub  
**Backends principais:** Google Apps Script

## 1. Objetivo

Manter um registro central da relação entre rotas, frontends, backends, autenticação, integrações e documentação dos módulos da Plataforma Digital AGF.

A documentação detalhada fica em `docs/modulos/`.

## 2. Módulos públicos e de clientes

| Module ID | Rota | Frontend | Backend | Status de produção | Documentação |
|---|---|---|---|---|---|
| plataforma-raiz | `/` | `frontend/index.html` | não obrigatório | NÃO CONFIRMADO | `docs/modulos/plataforma-raiz/README.md` |
| app | `/app` | `frontend/app` | etiquetas + NF externo | NÃO CONFIRMADO | `docs/modulos/app/README.md` |
| nuvem | `/nuvem` | `frontend/nuvem` | `apps-script/nuvemshop` | NÃO CONFIRMADO | `docs/modulos/nuvem/README.md` |
| superfrete | `/superfrete` | `frontend/superfrete` | NÃO CONFIRMADO | NÃO CONFIRMADO | `docs/modulos/superfrete/README.md` |
| cep | `/cep` | frontend correspondente | `apps-script/cep` | NÃO CONFIRMADO | `docs/modulos/cep/README.md` |
| dce | `/dce` | redirect/projeto isolado | projeto fiscal isolado | NÃO CONFIRMADO | `docs/modulos/dce/README.md` |
| reverso | `/reverso` | `frontend/reverso` | `apps-script/logistica` | NÃO CONFIRMADO | `docs/modulos/reverso/USUARIO.md` |
| cartoes-digitais | slugs públicos, ex. `/rachel` | páginas individuais | endpoint dinâmico planejado/não confirmado | PARCIAL | `docs/modulos/cartoes-digitais/README.md` |

## 3. Portal interno e módulos de negócio

O `frontend/intra/index.html` confirma como cards principais atuais: Dashboard, Inteligência, CRM, Resumos, Logística, Caixa e Manuais.

O card Caixa do `/intra` é apenas um atalho para a rota oficial `/caixa/`. A antiga rota `/intra/caixa/` foi removida definitivamente em 05/09/2026 e não deve ser recriada nem redirecionada.

| Module ID | Rota | Frontend | Backend/fontes | Auth | Documentação |
|---|---|---|---|---|---|
| intra | `/intra` | `frontend/intra` | múltiplos | SIM | `docs/modulos/intra/README.md` |
| dashboard | `/intra/dashboard` | `frontend/intra/dashboard` | NÃO MAPEADOS | CONFIRMAR | `docs/modulos/dashboard/README.md` |
| inteligencia | `/intra/inteligencia` | `frontend/intra/inteligencia` | múltiplas | SIM | `docs/modulos/inteligencia/README.md` |
| crm | `/crm` | `frontend/crm` | `apps-script/base-metro` | CONFIRMAR integralmente | `docs/modulos/crm/README.md` |
| resumos | `/intra/resumo` | `frontend/intra/resumo` | NÃO MAPEADOS | CONFIRMAR | `docs/modulos/resumos/README.md` |
| logistica-interna | `/intra/logistica` | `frontend/intra/logistica` | NÃO MAPEADOS | CONFIRMAR | `docs/modulos/logistica-interna/README.md` |
| caixa | `/caixa` | `frontend/caixa` | `apps-script/caixa` provável | SIM no catálogo central; validar backend integralmente | `docs/modulos/caixa/README.md` |
| manuais | `/intra/manuais` | `frontend/intra/manuais` | fonte `Manuais` documentada | CONFIRMAR | `docs/modulos/manuais/README.md` |
| atende | `/atende` | `frontend/atende` | `apps-script/atende` | SIM | `docs/modulos/atende/README.md` |
| sla | `/sla` e `/intra/sla` | `frontend/sla` + rota interna | `apps-script/sla` | SIM | `docs/modulos/sla/README.md` |
| balcao | `/balcao` | `frontend/balcao` | etiquetas/cep/caixa provável | NÃO CONFIRMADO | `docs/modulos/balcao/README.md` |
| superfrete-admin | `/superfrete-admin` | `frontend/superfrete-admin` | múltiplos | NÃO CONFIRMADO | `docs/modulos/superfrete-admin/README.md` |
| reverso-admin | `/reverso-admin` | `frontend/reverso-admin` | `apps-script/logistica` | SIM | `docs/modulos/reverso/ADMIN.md` |
| reverso-coleta | `/reverso-coleta` | `frontend/reverso-coleta` | `apps-script/logistica` | CONFIRMAR | `docs/modulos/reverso/COLETA.md` |
| reverso-expedicao | `/reverso-expedicao` | `frontend/reverso-expedicao` | `apps-script/logistica` | SIM | `docs/modulos/reverso/EXPEDICAO.md` |
| agf | `/agf` | `frontend/agf` | auth/atende provável | PARCIAL/CONFIRMAR | `docs/modulos/agf/README.md` |

## 4. Rotas de compatibilidade / aliases confirmados

| Rota | Comportamento atual |
|---|---|
| `/intra/agenda` | redireciona para `/crm/?view=agenda` |
| `/intra/crm` | redireciona para `/crm/?view=clientes` |

Essas rotas não são tratadas como módulos independentes enquanto permanecerem simples redirecionamentos.

### Rota eliminada

| Rota | Estado |
|---|---|
| `/intra/caixa` | REMOVIDA DEFINITIVAMENTE em 05/09/2026; sem redirect e sem compatibilidade |

## 5. Família Inteligência

| Module ID | Rota | Frontend | Auth | Fontes | Documentação |
|---|---|---|---|---|---|
| inteligencia-carteira | `/intra/inteligencia/carteira` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/CARTEIRA.md` |
| inteligencia-gerencial | `/intra/inteligencia/gerencial` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/GERENCIAL.md` |
| inteligencia-comercial | `/intra/inteligencia/comercial` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/COMERCIAL.md` |
| inteligencia-financeiro | `/intra/inteligencia/financeiro` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/FINANCEIRO.md` |
| inteligencia-atendimento | `/intra/inteligencia/atendimento` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/ATENDIMENTO.md` |
| inteligencia-operacional | `/intra/inteligencia/operacional` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/OPERACIONAL.md` |

## 6. Serviços técnicos compartilhados

| Module ID | Código | Consumidores | Sensível | Documentação |
|---|---|---|---|---|
| autenticacao | `apps-script/autenticacao` + `frontend/shared/auth` | módulos internos | SIM | `docs/modulos/autenticacao/README.md` |
| etiquetas | `apps-script/etiquetas` | `/app`, Balcão, SuperFrete e integrações | SIM | `docs/modulos/etiquetas/README.md` |
| nf | `apps-script/nf` | `/app` | SIM | `docs/modulos/nf/README.md` |
| cep | `apps-script/cep` | `/cep`, etiquetas/balcão | depende do contexto | `docs/modulos/cep/README.md` |
| logistica | `apps-script/logistica` | família Reverso | SIM | `docs/modulos/logistica/README.md` |
| base-metro | `apps-script/base-metro` | CRM e módulos internos relacionados | SIM | `docs/modulos/base-metro/README.md` |
| base-cliente-etiquetas | `apps-script/base-cliente-etiquetas` | consumidores a mapear | SIM | `docs/modulos/base-cliente-etiquetas/README.md` |
| caixa-backend | `apps-script/caixa` | `/caixa`; vínculo com Balcão a confirmar | SIM | `docs/modulos/caixa/README.md` |
| nuvemshop-backend | `apps-script/nuvemshop` | `/nuvem` | SIM | `docs/modulos/nuvem/README.md` |
| atende-backend | `apps-script/atende` | `/atende` | SIM | `docs/modulos/atende/README.md` |
| sla-backend | `apps-script/sla` | `/sla` | SIM | `docs/modulos/sla/README.md` |

## 7. Integrações externas conhecidas

| Integração | Módulos | Atenção |
|---|---|---|
| Correios/CWS | app, etiquetas, logística, Nuvemshop, Balcão | tokens, contrato/cartão, rastreio, preço/prazo |
| Nuvemshop | nuvem + backend Nuvemshop | OAuth, webhooks, pedidos, clientes |
| NF-e/DANFE | app + nf | dados fiscais e documentos |
| SuperFrete | superfrete / superfrete-admin | dados financeiros, etiquetas e carteira |
| WhatsApp | raiz, cartões e retornos em alguns módulos | dados de contato e links de atendimento |

## 8. Regras de verdade documental

Não registrar neste mapa:

- tokens;
- senhas;
- chaves;
- secrets;
- valores de PropertiesService;
- dados reais de clientes;
- CPF/CNPJ/telefone/e-mail/endereço individual.

Quando o vínculo não estiver provado pelo código ou ambiente, usar `NÃO CONFIRMADO` ou `NÃO MAPEADO`.

## 9. Pendências prioritárias

1. Confirmar produção/homologação por rota.
2. Mapear frontend -> action -> Apps Script -> planilha.
3. Mapear planilhas, abas, chaves e schemas.
4. Confirmar URLs `/exec` e `/dev` sem expor segredos.
5. Classificar cada módulo M0-M5.
6. Resolver papel oficial de `/agf` versus `/intra`.
7. Definir rota canônica do SLA quando houver duplicidade.
8. Confirmar autenticação integral de Caixa, Balcão, SuperFrete Admin, Reverso Coleta, Dashboard, Resumos, Logística e Manuais.
9. Inventariar todos os slugs de Cartões Digitais.
10. Atualizar este mapa sempre que um módulo novo entrar ou uma rota for desativada.