# Mapa dos arquivos do backend (base-metro)

Os nomes com `FASE2`, `FASE3`, `V5` são cicatrizes da ordem em que o sistema
foi construído, não camadas de funcionalidade. Este mapa diz o que cada
arquivo faz hoje, para você não precisar decifrar o nome.

| Arquivo | O que faz de verdade |
|---|---|
| `00_CLIENTES_MASTER_FINAL` | Monta a aba CLIENTES_MASTER a partir da BASE_TOTAL. É o processamento pesado (17 mil linhas). Aqui mora o `triggerRefreshMaster`. |
| `05_CRM_CANONICO_FASE2` | Leitura genérica de abas para objetos. É a camada mais baixa: quase tudo passa por aqui. |
| `06_CRM_JORNADA_FASE3` | O coração do CRM: funil, kanban, mover card, agenda, indicadores, configuração. |
| `10_OPERACAO_EXECUCAO_API` | O porteiro. Recebe toda chamada do front (`?action=`) e decide quem responde. Também lê clientes e prospects. |
| `11_CRM_IMPORTACAO_LOTE_MENU` | Menu da planilha. Transforma linhas digitadas à mão em cadastros completos (gera ID e cria a tratativa). É o tal do `SUBIR_FRONT`. |
| `15_LIFECYCLE_ENGINE` | Automação de status: quando uma visita é cancelada ou reagendada, é ele que grava em STATUS_PROSPECT. |
| `16_CRM_PERF_V5` | Camada de performance: cache, boot rápido, aquecimento. Não tem regra de negócio. |
| `17_CRM_LISTAS_E_LIMPEZA` | Dicionário oficial de valores, dropdowns da planilha, gatilho de sincronia e limpeza dos dados. |
| `000_AGF_AUTH_GATE` | Login e permissão. Barra quem não tem sessão. |
| `DASHBOARD_GERENCIAL` | Ponto de entrada global (`doGet`/`doPost`) e o painel gerencial. |

## Sobre renomear os arquivos

Renomear é seguro do ponto de vista técnico (no Apps Script as funções são
globais, o nome do arquivo não afeta a execução), mas gera um diff enorme no
git e dificulta comparar versões durante um período em que o sistema está
sendo estabilizado. Recomendação: deixar para quando o CRM estiver calmo, e
usar este mapa enquanto isso.

Se e quando for feito, a sugestão de nomes é:
`00_MASTER_BUILD`, `05_LEITURA_PLANILHA`, `06_CRM_NUCLEO`,
`10_API_ROTEADOR`, `11_IMPORTACAO_PLANILHA`, `15_AUTOMACAO_STATUS`,
`16_CACHE_E_PERFORMANCE`, `17_LISTAS_E_DADOS`.
