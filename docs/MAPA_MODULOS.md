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

## 3. Módulos internos

| Module ID | Rota | Frontend | Backend | Auth compartilhada | Documentação |
|---|---|---|---|---|---|
| intra | `/intra` | `frontend/intra` | múltiplos | SIM | `docs/modulos/intra/README.md` |
| agf | `/agf` | `frontend/agf` | auth/atende provável | PARCIAL/CONFIRMAR | `docs/modulos/agf/README.md` |
| crm | `/crm` | `frontend/crm` | `apps-script/base-metro` | CONFIRMAR integralmente | `docs/modulos/crm/README.md` |
| atende | `/atende` | `frontend/atende` | `apps-script/atende` | SIM | `docs/modulos/atende/README.md` |
| sla | `/sla` | `frontend/sla` | `apps-script/sla` | SIM | `docs/modulos/sla/README.md` |
| caixa | `/caixa` | `frontend/caixa` | `apps-script/caixa` | NÃO CONFIRMADO | `docs/modulos/caixa/README.md` |
| balcao | `/balcao` | `frontend/balcao` | etiquetas/cep/caixa provável | NÃO CONFIRMADO | `docs/modulos/balcao/README.md` |
| superfrete-admin | `/superfrete-admin` | `frontend/superfrete-admin` | múltiplos | NÃO CONFIRMADO | `docs/modulos/superfrete-admin/README.md` |
| reverso-admin | `/reverso-admin` | `frontend/reverso-admin` | `apps-script/logistica` | SIM | `docs/modulos/reverso/ADMIN.md` |
| reverso-coleta | `/reverso-coleta` | `frontend/reverso-coleta` | `apps-script/logistica` | CONFIRMAR | `docs/modulos/reverso/COLETA.md` |
| reverso-expedicao | `/reverso-expedicao` | `frontend/reverso-expedicao` | `apps-script/logistica` | SIM | `docs/modulos/reverso/EXPEDICAO.md` |

## 4. Família Inteligência

| Module ID | Rota | Frontend | Auth | Fontes | Documentação |
|---|---|---|---|---|---|
| inteligencia | `/intra/inteligencia` | `frontend/intra/inteligencia` | SIM | múltiplas | `docs/modulos/inteligencia/README.md` |
| inteligencia-carteira | `/intra/inteligencia/carteira` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/CARTEIRA.md` |
| inteligencia-gerencial | `/intra/inteligencia/gerencial` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/GERENCIAL.md` |
| inteligencia-comercial | `/intra/inteligencia/comercial` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/COMERCIAL.md` |
| inteligencia-financeiro | `/intra/inteligencia/financeiro` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/FINANCEIRO.md` |
| inteligencia-atendimento | `/intra/inteligencia/atendimento` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/ATENDIMENTO.md` |
| inteligencia-operacional | `/intra/inteligencia/operacional` | pasta correspondente | SIM | NÃO MAPEADAS | `docs/modulos/inteligencia/OPERACIONAL.md` |

## 5. Serviços técnicos compartilhados

| Module ID | Código | Consumidores | Sensível | Documentação |
|---|---|---|---|---|
| autenticacao | `apps-script/autenticacao` + `frontend/shared/auth` | módulos internos | SIM | `docs/modulos/autenticacao/README.md` |
| etiquetas | `apps-script/etiquetas` | `/app`, Balcão, SuperFrete e integrações | SIM | `docs/modulos/etiquetas/README.md` |
| nf | `apps-script/nf` | `/app` | SIM | `docs/modulos/nf/README.md` |
| cep | `apps-script/cep` | `/cep`, etiquetas/balcão | depende do contexto | `docs/modulos/cep/README.md` |
| logistica | `apps-script/logistica` | família Reverso | SIM | documentado em `docs/modulos/reverso/` |
| base-metro | `apps-script/base-metro` | CRM/Inteligência | SIM | documentado inicialmente em CRM; detalhamento pendente |
| base-cliente-etiquetas | `apps-script/base-cliente-etiquetas` | etiquetas/clientes | SIM | detalhamento pendente |
| caixa | `apps-script/caixa` | `/caixa`, vínculo com Balcão a confirmar | SIM | `docs/modulos/caixa/README.md` |

## 6. Integrações externas conhecidas

| Integração | Módulos | Atenção |
|---|---|---|
| Correios/CWS | app, etiquetas, logística, Nuvemshop, Balcão | tokens, contrato/cartão, rastreio, preço/prazo |
| Nuvemshop | nuvem + backend Nuvemshop | OAuth, webhooks, pedidos, clientes |
| NF-e/DANFE | app + nf | dados fiscais e documentos |
| SuperFrete | superfrete / superfrete-admin | dados financeiros, etiquetas e carteira |
| WhatsApp | raiz, histórico/retorno em alguns módulos | dados de contato e links de atendimento |

## 7. Regras de verdade documental

Não registrar neste mapa:

- tokens;
- senhas;
- chaves;
- secrets;
- valores de PropertiesService;
- dados reais de clientes;
- CPF/CNPJ/telefone/e-mail/endereço individual.

Quando o vínculo não estiver provado pelo código ou ambiente, usar `NÃO CONFIRMADO` ou `NÃO MAPEADO`.

## 8. Pendências prioritárias

1. Confirmar produção/homologação por rota.
2. Mapear frontend -> action -> Apps Script -> planilha.
3. Mapear planilhas, abas, chaves e schemas.
4. Confirmar URLs `/exec` e `/dev` sem expor segredos.
5. Classificar cada módulo M0-M5.
6. Resolver papel oficial de `/agf` versus `/intra`.
7. Documentar `base-metro` e `base-cliente-etiquetas` como serviços próprios se permanecerem compartilhados.
8. Confirmar autenticação de Caixa, Balcão, SuperFrete Admin e Reverso Coleta.