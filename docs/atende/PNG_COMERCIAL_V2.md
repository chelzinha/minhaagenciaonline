# Visão 360 - artes PNG da aba Comercial (V2)

Data: 02/10/2026

## Resumo
- Aba Comercial: botão "Salvar PNG" gera as artes 1080x1080 de Balcão AGF, Encomendas e Metrô, no padrão do Método de Artes AGF.
- Aba Gestão: recebe o gerador anterior (cartões 600x600), sem alteração de conteúdo.

## Arquivos
| Arquivo | Papel |
|---|---|
| `apps-script/atende/DashboardCommercialPngV2.html` | Gerador novo (gerado, não editar à mão) |
| `apps-script/atende/DashboardCommercialPngV1.html` | Gerador anterior, agora montado na aba Gestão |
| `apps-script/atende/32_ATENDE_DASHBOARD.gs` | Carrega o V2 junto dos demais addons |
| `apps-script/atende/41_ATENDE_PNG.gs` | Repassa `width`/`height` (600 ou 1080) ao Worker |
| `cloudflare/atende-api/src/png-browser-wrapper.js` | Browser Run aceita 600 ou 1080. Padrão 600 |
| `tools/atende/png-comercial-v2/` | Fonte das artes (modelos, ícones, fontes, geradores) |

## Fluxo
1. Botão na aba Comercial lê os dados da própria tela (`ATENDE_getDashboardDataV4`).
2. Monta o HTML a partir do molde aprovado do centro escolhido.
3. `google.script.run.ATENDE_renderCommercialPngV1({html, filename, width:1080, height:1080})`.
4. Apps Script chama o Worker `/render-commercial-png` com o token das Script Properties.
5. Browser Run devolve o PNG, que é baixado no navegador.

## Fonte dos números
| Dado | Origem |
|---|---|
| Realizado | `metas.realizado.balcao`, `.encomendas`, `.metro` |
| Metas Bronze, Prata, Ouro | `metas.config.<centro>Bronze`, `Prata`, `Ouro` |
| Dias úteis do mês e realizados | `metas.config.diasUteisMes`, `diasUteisRealizados` |
| Percentuais do Balcão | `rankingBalcao.linhas` (nome, realizado) |
| Mês e data | `metas.competencia` e o campo `dataFim` do painel |

## Regras de cálculo
- % da Bronze = realizado / meta Bronze.
- Mês decorrido = dias úteis realizados / dias úteis do mês.
- Próxima meta = primeira meta configurada ainda não batida. Projeção, média necessária e destaque usam essa meta.
- Projeção (Balcão e Metrô) = realizado / dias úteis realizados x dias úteis do mês.
- Média necessária = (próxima meta - realizado) / dias úteis restantes.
- Meta com valor zero não aparece. Sem meta Bronze o PNG não é gerado e aparece aviso.

## Rollback
1. `git revert <commit>` no `main`.
2. `npx wrangler deploy` em `cloudflare/atende-api` (o Worker antigo ignora `width`/`height` e volta a 600).
3. `clasp push` e `clasp deploy -i <deploymentId do Visão 360>` em `apps-script/atende`.
