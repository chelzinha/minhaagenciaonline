# Planilha APP Total CF + Metro

## Objetivo

Este documento registra o mapa tecnico da planilha **APP Total CF + Metro** como fonte viva de regras operacionais do CRM, agenda, visitas, materiais e manuais.

A planilha deve ser tratada como base de configuracao e operacao. O codigo deve ler, validar, cachear e expor essas regras ao frontend, evitando substituir regras parametrizadas por valores fixos sem registro tecnico.

## Principio central

```text
Planilha APP Total CF + Metro = fonte viva das regras
Apps Script = leitor, validador, executor e cache
Frontend = interface de consulta e operacao
Documentacao = mapa para evitar regressao
```

## Regra de seguranca tecnica

Antes de alterar CRM, agenda, visitas, materiais ou manuais, verificar:

1. Quais abas sao lidas.
2. Quais colunas sao obrigatorias.
3. Quais endpoints dependem dessas abas.
4. Quais telas dependem dessas respostas.
5. Se a regra esta na planilha ou no codigo.
6. Se a mudanca exige cache, invalidacao ou migracao.
7. Se existem dados pessoais, comerciais ou credenciais envolvidas.

## Distincao correta entre MIDIAS_CRM e Manuais

A distincao correta definida pela Rachel e:

```text
MIDIAS_CRM = conteudos estrategicos usados para alimentar as acoes do CRM.
Manuais = biblioteca mais ampla de consulta, que pode incluir conteudos de MIDIAS_CRM e outros materiais operacionais.
```

Portanto, `Manuais` nao substitui `MIDIAS_CRM`.

Tambem nao e correto tratar `Manuais` como apenas uma versao visual de `MIDIAS_CRM`.

O desenho correto e:

1. `MIDIAS_CRM` continua sendo fonte de recomendacao de conteudos para acoes comerciais.
2. `Manuais` pode exibir materiais proprios e tambem materiais que tenham origem ou equivalencia em `MIDIAS_CRM`.
3. A tela `/intra/manuais/` deve ser uma biblioteca navegavel e organizada por categorias.
4. O CRM pode continuar usando `MIDIAS_CRM` para recomendacao contextual.
5. Quando fizer sentido, uma linha de `Manuais` pode apontar para um item de `MIDIAS_CRM` por codigo ou referencia.

## Achado inicial - 2026-06-18

A tela `/intra/manuais/` precisa ser organizada a partir da aba `Manuais` da planilha APP Total CF + Metro, mas isso nao elimina o papel da aba `MIDIAS_CRM`.

Situacao atual identificada no codigo:

1. Frontend atual chama `action=get_midias_catalog`.
2. Backend atual responde com dados de `MIDIAS_CRM`.
3. Isso pode ter funcionado como atalho inicial, mas nao representa todo o escopo da biblioteca `Manuais`.
4. A aba `Manuais` deve organizar a biblioteca por `CATEGORIA`, `ORDEM_C`, `ICONE_CATEGORIA`, `TITULO`, `DESCRICAO`, `FORMATO` e `LINK`.
5. A aba `Manuais` pode incluir conteudos equivalentes ou vinculados a `MIDIAS_CRM`.

Impacto:

1. Se `/intra/manuais/` ler apenas `MIDIAS_CRM`, materiais gerais podem ficar fora da tela.
2. Se `/intra/manuais/` ignorar `MIDIAS_CRM`, conteudos comerciais importantes podem ficar duplicados ou desconectados das acoes.
3. O modelo precisa permitir relacionamento entre biblioteca ampla e midias estrategicas do CRM.

Decisao tecnica recomendada:

1. Preservar `MIDIAS_CRM` como fonte estrategica das acoes do CRM.
2. Usar `Manuais` como fonte da tela `/intra/manuais/`.
3. Adicionar, se necessario, uma coluna de vinculo em `Manuais`, como `MIDIA_CRM_ID`, `ORIGEM_CONTEUDO` ou `ACAO_CRM`.
4. Criar endpoint especifico `get_manuais_catalog` para a tela de manuais.
5. O endpoint pode retornar dados da aba `Manuais` e, quando houver vinculo, enriquecer com informacoes de `MIDIAS_CRM` sem duplicar regra.
6. Nao fundir as duas abas sem decisao documentada.

## Abas mapeadas inicialmente pelo codigo

| Aba | Uso principal | Status do mapeamento | Risco se alterar |
| --- | --- | --- | --- |
| `BASE_TOTAL` | Base operacional de postagens/clientes para consolidacao | Identificada em `OP_CFG` | Alto: afeta indicadores, curva, recorrencia e clientes master |
| `CLIENTES_MASTER` | Visao consolidada para CRM, agenda e diagnostico | Identificada em `OP_CFG` e `CRM3_CFG` | Critico: afeta CRM inteiro |
| `CLIENTES_ALIAS` | Normalizacao/alias de clientes | Identificada em `OP_CFG` | Medio/alto: pode afetar consolidacao de cliente |
| `AGENDA_BLOCOS` | Blocos de agenda e janelas de atendimento | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Alto: afeta agendamento e visitas |
| `AGENDA_EXECUCAO` | Agenda comercial e atividades executadas | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Critico: afeta visitas, tarefas e historico operacional |
| `CRM_INTERACOES` | Historico/interacoes comerciais | Identificada em `OP_CFG` e `CRM3_CFG` | Alto: afeta rastreabilidade do CRM |
| `MIDIAS_CRM` | Conteudos estrategicos/recomendados pelas acoes do CRM | Identificada em `OP_CFG` e `CRM3_CFG` | Alto: afeta recomendacao de material no CRM |
| `Manuais` | Biblioteca ampla da tela `/intra/manuais/`, podendo incluir conteudos de `MIDIAS_CRM` e outros materiais | Informada pela Rachel; precisa ser mapeada no codigo | Alto: afeta consulta e organizacao de materiais |
| `PROSPECTS` | Cadastro e funil de prospects | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Alto: afeta funil de prospects |
| `CRM_VISITA_CHECKLIST` | Checklists de visita/atividade | Identificada em `OP_CFG` e `CRM2_CFG` | Alto: afeta roteiro de visita e evidencia operacional |
| `CLIENTES_CADASTRO` | Cadastro canonico/manual de clientes | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Critico: contem dados cadastrais |
| `CLIENTES_ACESSOS_APP` | Acessos vinculados a clientes/app | Identificada em `OP_CFG` e `CRM2_CFG` | Critico: dados sensiveis de acesso |
| `CLIENTES_CREDENCIAIS_CWS` | Credenciais/contratos/cartao vinculados ao cliente | Identificada em `OP_CFG` e `CRM2_CFG` | Critico: credenciais e dados Correios/CWS |
| `CRM_TRATATIVAS` | Tratativas comerciais abertas/fechadas | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Critico: afeta jornada comercial |
| `CRM_FUNIS` | Parametrizacao de funis | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Alto: afeta kanban e jornadas |
| `CRM_FUNIL_ETAPAS` | Etapas dos funis | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Alto: afeta movimentacao de cards |
| `CRM_TIPOS_ATIVIDADE` | Tipos de atividade/visita | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Alto: afeta agenda e conclusao de atividades |
| `CRM_RESULTADOS_ATIVIDADE` | Resultados permitidos por atividade | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Alto: afeta fluxo pos-atividade |
| `CRM_EVENTOS` | Auditoria/eventos do CRM | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Alto: afeta rastreabilidade |
| `CRM_RESPONSAVEIS` | Usuarios/responsaveis do CRM | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Alto: afeta permissao operacional e carteira |
| `CRM_TRANSICOES` | Transicoes da jornada comercial | Identificada em `CRM3_CFG` | Alto: afeta automacao de proximas etapas |
| `CRM_SEGMENTOS` | Segmentos parametrizados | Identificada em `CRM3_CFG` | Medio/alto: afeta filtros e cadastro |
| `CRM_LOCAIS` | Locais parametrizados | Identificada em `CRM3_CFG` | Medio/alto: afeta filtros, agenda e segmentacao |

## Colunas esperadas da aba Manuais

Colunas identificadas pela imagem enviada pela Rachel:

| Coluna | Uso esperado | Obrigatoria? |
| --- | --- | --- |
| `ID` | Identificador unico do material na biblioteca de manuais | Sim |
| `CATEGORIA` | Grupo visual da tela | Sim |
| `ORDEM_C` | Ordem da categoria | Sim |
| `ICONE_CATEGORIA` | Icone Material Symbols da categoria | Sim |
| `TITULO` | Nome exibido no card | Sim |
| `DESCRICAO` | Texto explicativo do material | Sim |
| `FORMATO` | Tipo do material: PDF, PLANILHA, IMAGEM, CHECKLIST, TEXTO etc. | Sim |
| `LINK` | URL do material | Sim, quando houver material externo |
| `ORDEM_ITEM` | Ordem do card dentro da categoria | Recomendado |
| `ATIVO` | Permite ocultar material sem apagar linha | Recomendado |

Observacao: se a coluna de ordem final ja existir com outro nome, preservar o nome real da planilha e mapear no Apps Script com fallback.

## Colunas opcionais para relacionar Manuais com MIDIAS_CRM e filtros

Para Rachel conseguir alimentar conteudos e liga-los a uma acao ou filtro de cliente, a aba `Manuais` pode receber colunas adicionais, sem remover as atuais.

Colunas recomendadas:

| Coluna | Finalidade |
| --- | --- |
| `ORIGEM_CONTEUDO` | MANUAL, MIDIAS_CRM, DRIVE, WHATSAPP, CHECKLIST, APP etc. |
| `MIDIA_CRM_ID` | Codigo do item correspondente em `MIDIAS_CRM`, quando houver |
| `ACAO_CRM` | Acao comercial relacionada: CONVERTER, RESGATAR, FIDELIZAR, MANTER, CANCELAR ou APOIO |
| `SUB_ACAO` | Subacao ou situacao especifica do cliente |
| `PUBLICO` | CLIENTE_ATIVO, PROSPECT, AMBOS, INTERNO, EQUIPE |
| `FILTRO_CLIENTE` | Codigo curto do filtro aplicavel, ex: SEM_CONTRATO, QUEDA_REAL, NOVO_CLIENTE |
| `CURVA` | TOP, A, B, C ou vazio para todos |
| `STATUS_ATIVIDADE` | ATIVO, INATIVO_30D, INATIVO_60D, SEM_POSTAGEM etc. |
| `PERFIL_COMERCIAL` | Perfil comercial usado no CRM |
| `BUCKET_NEGOCIO` | Bucket de negocio usado no CRM |
| `RECORRENCIA_NIVEL` | Nivel de recorrencia usado no CRM |
| `TENDENCIA` | CRESCENDO, ESTAVEL, CAINDO etc. |
| `NIVEL_ALERTA` | Alerta usado no CRM |
| `PORTE_OPERACIONAL` | Porte operacional do cliente |
| `TEM_CONTRATO` | SIM, NAO ou vazio para ambos |
| `CANAL_SUGERIDO` | WhatsApp, visita, ligacao, e-mail etc. |
| `TEXTO_USO` | Como ou quando usar o material |
| `OBS_INTERNA` | Observacao operacional para equipe |

Regra:

1. As colunas novas devem ser opcionais.
2. Uma linha sem filtro deve aparecer como material geral da categoria.
3. Uma linha com `MIDIA_CRM_ID` deve poder ser conectada ao catalogo estrategico do CRM.
4. Uma linha com `ACAO_CRM` deve poder aparecer em filtros especificos da tela.
5. Uma linha com `FILTRO_CLIENTE` deve poder ser recomendada no diagnostico ou no CRM.
6. O frontend nao deve calcular regras pesadas; o Apps Script deve entregar JSON pronto.

## Exemplos iniciais de vinculo

| ID | Categoria | Origem | Midia CRM ID | Acao CRM sugerida | Filtro cliente sugerido | Observacao |
| --- | --- | --- | --- | --- | --- | --- |
| `PDF_CONTRATO` | Comercial | MIDIAS_CRM ou MANUAL | A definir | CONVERTER | SEM_CONTRATO | Material comercial para apresentar contrato |
| `COMPARATIVO_CONTRATO` | Comercial | MIDIAS_CRM ou MANUAL | A definir | CONVERTER | SEM_CONTRATO | Comparativo para conversa de potencial |
| `IMAGEM_COMPARATIVO_WHATS` | Comercial | MIDIAS_CRM ou MANUAL | A definir | CONVERTER | SEM_CONTRATO | Visual curto para WhatsApp |
| `APRESENTACAO_RESGATE` | Comercial | MIDIAS_CRM ou MANUAL | A definir | RESGATAR | INATIVO_30D ou INATIVO_60D | Material para recuperar cliente inativo |
| `CHECKLIST_VISITA` | CRM Checklists | MANUAL | vazio | FIDELIZAR | VISITA_CLIENTE | Roteiro de visita comercial |
| `CHECKLIST_QUEDA_REAL` | CRM Checklists | MANUAL | vazio | RESGATAR | QUEDA_REAL | Roteiro para perda de frequencia/mudanca operacional |
| `FOLDER_RELACIONAMENTO` | Relacionamento e fidelizacao | MIDIAS_CRM ou MANUAL | A definir | FIDELIZAR | CLIENTE_ATIVO | Reforco de relacionamento |
| `MANUAL_BOAS_VINDAS` | Relacionamento e fidelizacao | MANUAL | vazio | FIDELIZAR | NOVO_CLIENTE | Onboarding de cliente |
| `WHATSAPP_CANCELAMENTO_VR` | Mensagens Rapidas WhatsApp | MIDIAS_CRM ou MANUAL | A definir | CANCELAR | VR_SEM_POTENCIAL | Mensagem final para fim de foco comercial |
| `MANUAL_SUPERFRETE_10X15` | Aplicativos | MANUAL | vazio | APOIO | MARKETPLACE | Manual operacional |

## Regra de tela para `/intra/manuais/`

A tela deve:

1. Chamar `action=get_manuais_catalog`.
2. Receber JSON ja normalizado.
3. Agrupar por categoria.
4. Ordenar categorias por `ordemCategoria`.
5. Ordenar cards por `ordemItem`, depois titulo.
6. Usar `iconeCategoria` como icone do grupo.
7. Permitir busca por titulo, descricao, categoria, formato, ID, acao, filtro e origem.
8. Permitir filtro rapido por categoria, formato, acao CRM e origem do conteudo.
9. Exibir apenas linhas ativas por padrao.
10. Mostrar estado de erro claro se a API falhar.

## Endpoint recomendado

```text
GET action=get_manuais_catalog
```

Resposta sugerida:

```json
{
  "ok": true,
  "source": "Manuais",
  "items": [
    {
      "id": "PDF_CONTRATO",
      "categoria": "Comercial",
      "ordemCategoria": 10,
      "iconeCategoria": "request_quote",
      "titulo": "Apresentacao dos tipos de contrato dos Correios",
      "descricao": "Apresentacao comercial para mostrar modalidades de contrato ECT",
      "formato": "PDF",
      "link": "...",
      "ordemItem": 10,
      "origemConteudo": "MIDIAS_CRM",
      "midiaCrmId": "...",
      "acaoCrm": "CONVERTER",
      "filtroCliente": "SEM_CONTRATO",
      "ativo": true
    }
  ]
}
```

Nao registrar URLs reais em exemplos publicos. Usar `...` ou links anonimizados.

## Performance

Cuidados:

1. Ler a aba `Manuais` com `getValues()` em lote.
2. Ler `MIDIAS_CRM` separadamente apenas quando houver necessidade de enriquecer ou validar vinculos.
3. Cachear resposta por tempo curto/medio.
4. Invalidar cache quando houver alteracao manual importante.
5. Retornar JSON enxuto.
6. Nao carregar arquivos do Drive, apenas metadados e links.

## Atencao sensivel

A aba pode conter links do Google Drive e materiais internos.

Cuidados:

1. Nao documentar links privados reais em exemplos.
2. Revisar permissao dos arquivos no Drive.
3. Separar material interno de material que pode ser enviado ao cliente.
4. Evitar expor dados pessoais ou materiais com dados reais de clientes.
5. Registrar mudancas de permissao em `docs/SEGURANCA_E_DADOS.md` quando aplicavel.

## Proximos passos

1. Confirmar cabecalhos reais da aba `Manuais`.
2. Confirmar se sera usada coluna `MIDIA_CRM_ID`, `ORIGEM_CONTEUDO` ou ambas.
3. Mapear os codigos atuais de `MIDIAS_CRM`.
4. Criar endpoint `get_manuais_catalog`.
5. Ajustar `/intra/manuais/` para consumir a aba correta.
6. Adicionar colunas opcionais de vinculo com acao/filtro de cliente.
7. Criar checklist de teste da tela de manuais.
8. Atualizar documentacao apos a implementacao funcional.
