# Documentação dos módulos da Plataforma AGF

**Data da baseline:** 05/09/2026  
**Repositório:** `chelzinha/minhaagenciaonline`  
**Branch de origem:** `main`  
**Hospedagem atual do frontend principal:** Cloudflare  
**Backends principais:** Google Apps Script

## Finalidade

Este diretório consolida a documentação técnica por módulo de `www.minhaagenciaonline.com.br`, seguindo os documentos 13, 14 e 15 da Plataforma AGF.

Regra de verdade documental:

- `CONFIRMADO`: existe evidência no código ou documentação viva do repositório.
- `NÃO CONFIRMADO`: há indício, mas falta validar produção, ambiente ou vínculo.
- `NÃO IDENTIFICADO`: a informação não foi encontrada na revisão atual.
- `ATENÇÃO SENSÍVEL`: envolve dados pessoais, fiscais, credenciais, autenticação ou integrações críticas.

## Módulos documentados nesta baseline

| Module ID | Nome | Tipo | Rota principal | Backend principal | Situação documental |
|---|---|---|---|---|---|
| plataforma-raiz | Site público AGF | público | `/` | não obrigatório | baseline criada |
| app | Minhas Postagens | cliente externo | `/app` | `apps-script/etiquetas` + NF externo | baseline criada |
| nuvem | Minhas Postagens Nuvemshop | cliente externo / integração | `/nuvem` | `apps-script/nuvemshop` | baseline criada |
| superfrete | Minhas Postagens - Portal do Cliente | cliente externo | `/superfrete` | NÃO CONFIRMADO | baseline criada |
| superfrete-admin | SuperFrete Admin | interno | `/superfrete-admin` | múltiplos | baseline criada |
| balcao | Balcão / Etiquetas | interno | `/balcao` | etiquetas + CEP + caixa provável | baseline criada |
| crm | CRM AGF | interno | `/crm` | `apps-script/base-metro` | baseline criada |
| atende | Atende | interno | `/atende` | `apps-script/atende` | baseline criada |
| sla | SLA | interno | `/sla` | `apps-script/sla` | baseline criada |
| caixa | Caixa | interno | `/caixa` | `apps-script/caixa` | baseline criada |
| intra | Portal interno | interno | `/intra` | autenticação + módulos internos | baseline criada |
| inteligencia | Inteligência | interno | `/intra/inteligencia` | múltiplas fontes | baseline criada |
| reverso | Logística Reversa | externo + interno | `/reverso*` | `apps-script/logistica` | baseline criada |
| agf | Acesso AGF | interno / papel em transição | `/agf` | autenticação + atende provável | baseline criada |
| autenticacao | Autenticação AGF | técnico compartilhado | compartilhado | `apps-script/autenticacao` | baseline criada |
| etiquetas | Serviço de etiquetas | técnico compartilhado | via frontends | `apps-script/etiquetas` | baseline criada |
| nf | NF-e / DANFE PDF | técnico / fiscal | integração com `/app` | `apps-script/nf` | baseline criada |
| cep | Consulta de CEP | público + serviço | `/cep` | `apps-script/cep` | baseline criada |
| dce | Emissor DC-e | fiscal externo | `/dce` | projeto isolado | baseline criada |

## Submódulos documentados individualmente

### Reverso

- `docs/modulos/reverso/USUARIO.md`
- `docs/modulos/reverso/ADMIN.md`
- `docs/modulos/reverso/COLETA.md`
- `docs/modulos/reverso/EXPEDICAO.md`

### Inteligência

- `docs/modulos/inteligencia/CARTEIRA.md`
- `docs/modulos/inteligencia/GERENCIAL.md`
- `docs/modulos/inteligencia/COMERCIAL.md`
- `docs/modulos/inteligencia/FINANCEIRO.md`
- `docs/modulos/inteligencia/ATENDIMENTO.md`
- `docs/modulos/inteligencia/OPERACIONAL.md`

## Backends de apoio ainda tratados dentro de módulos consumidores

- `apps-script/base-metro`: documentado principalmente em CRM/Inteligência.
- `apps-script/base-cliente-etiquetas`: documentado como serviço de apoio a etiquetas; merece README próprio após mapeamento de consumidores.
- `apps-script/logistica`: documentado na família Reverso.
- `apps-script/caixa`: documentado no módulo Caixa; vínculo com Balcão ainda precisa ser confirmado.

## Pendências globais

1. Confirmar quais rotas estão efetivamente publicadas em produção hoje.
2. Confirmar URLs `/exec` de produção e `/dev` de homologação sem registrar segredos.
3. Mapear planilhas e abas por módulo.
4. Mapear owners técnicos e operacionais.
5. Classificar todos os módulos em M0-M5 após auditoria visual/técnica.
6. Confirmar vínculos frontend -> action -> Apps Script -> planilha.
7. Documentar `base-cliente-etiquetas` como serviço independente se permanecer compartilhado.
8. Atualizar cada README após validação do estado real de produção.

## Regra de manutenção

Toda alteração funcional relevante deve atualizar o README do módulo correspondente e o `CHANGELOG.md` global. Mudanças em dados, segurança, performance ou arquitetura devem atualizar também os documentos temáticos previstos no Plano Mestre.