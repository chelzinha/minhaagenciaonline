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

## Achado inicial - 2026-06-18

A tela `/intra/manuais/` esta usando o fluxo de midias do CRM, mas a regra correta informada pela Rachel e usar a aba `Manuais` da planilha APP Total CF + Metro.

Situacao atual identificada no codigo:

1. Frontend atual chama `action=get_midias_catalog`.
2. Backend atual responde com dados de `MIDIAS_CRM`.
3. A aba correta para a tela de manuais e `Manuais`.
4. A tela deve agrupar por `CATEGORIA`, ordenar por `ORDEM_C` e usar `ICONE_CATEGORIA`.

Impacto:

1. A tela de manuais pode exibir agrupamento errado.
2. A organizacao visual pode nao refletir a planilha viva.
3. Conteudos planejados para acao/filtro de cliente nao ficam rastreaveis.

Decisao tecnica recomendada:

1. Preservar `MIDIAS_CRM` para o CRM se ainda for usada.
2. Criar endpoint especifico `get_manuais_catalog`.
3. Criar leitura especifica `op_readManuais_()`.
4. Nao misturar a regra de manuais com a regra de midias do CRM sem decisao documentada.

## Abas mapeadas inicialmente pelo codigo

| Aba | Uso principal | Status do mapeamento | Risco se alterar |
| --- | --- | --- | --- |
| `BASE_TOTAL` | Base operacional de postagens/clientes para consolidacao | Identificada em `OP_CFG` | Alto: afeta indicadores, curva, recorrencia e clientes master |
| `CLIENTES_MASTER` | Visao consolidada para CRM, agenda e diagnostico | Identificada em `OP_CFG` e `CRM3_CFG` | Critico: afeta CRM inteiro |
| `CLIENTES_ALIAS` | Normalizacao/alias de clientes | Identificada em `OP_CFG` | Medio/alto: pode afetar consolidacao de cliente |
| `AGENDA_BLOCOS` | Blocos de agenda e janelas de atendimento | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Alto: afeta agendamento e visitas |
| `AGENDA_EXECUCAO` | Agenda comercial e atividades executadas | Identificada em `OP_CFG`, `CRM2_CFG` e `CRM3_CFG` | Critico: afeta visitas, tarefas e historico operacional |
| `CRM_INTERACOES` | Historico/interacoes comerciais | Identificada em `OP_CFG` e `CRM3_CFG` | Alto: afeta rastreabilidade do CRM |
| `MIDIAS_CRM` | Materiais recomendados/relacionados ao CRM | Identificada em `OP_CFG` e `CRM3_CFG` | Alto: afeta recomendacao de material no CRM |
| `Manuais` | Tela `/intra/manuais/` e biblioteca operacional | Informada pela Rachel; precisa entrar no codigo | Alto: afeta consulta e organizacao de materiais |
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
| `ID` | Identificador unico do material | Sim |
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

## Proposta para vincular Manuais a acao e filtro de cliente

Para Rachel conseguir alimentar conteudos e liga-los a uma acao ou filtro de cliente, a aba `Manuais` pode receber colunas adicionais, sem remover as atuais.

Colunas recomendadas:

| Coluna | Finalidade |
| --- | --- |
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
3. Uma linha com `ACAO_CRM` deve poder aparecer em filtros especificos da tela.
4. Uma linha com `FILTRO_CLIENTE` deve poder ser recomendada no diagnostico ou no CRM.
5. O frontend nao deve calcular regras pesadas; o Apps Script deve entregar JSON pronto.

## Exemplos iniciais de vinculo

| ID | Categoria | Acao CRM sugerida | Filtro cliente sugerido | Observacao |
| --- | --- | --- | --- | --- |
| `PDF_CONTRATO` | Comercial | CONVERTER | SEM_CONTRATO | Material comercial para apresentar contrato |
| `COMPARATIVO_CONTRATO` | Comercial | CONVERTER | SEM_CONTRATO | Comparativo para conversa de potencial |
| `IMAGEM_COMPARATIVO_WHATS` | Comercial | CONVERTER | SEM_CONTRATO | Visual curto para WhatsApp |
| `APRESENTACAO_RESGATE` | Comercial | RESGATAR | INATIVO_30D ou INATIVO_60D | Material para recuperar cliente inativo |
| `CHECKLIST_VISITA` | CRM Checklists | FIDELIZAR | VISITA_CLIENTE | Roteiro de visita comercial |
| `CHECKLIST_QUEDA_REAL` | CRM Checklists | RESGATAR | QUEDA_REAL | Roteiro para perda de frequencia/mudanca operacional |
| `FOLDER_RELACIONAMENTO` | Relacionamento e fidelizacao | FIDELIZAR | CLIENTE_ATIVO | Reforco de relacionamento |
| `MANUAL_BOAS_VINDAS` | Relacionamento e fidelizacao | FIDELIZAR | NOVO_CLIENTE | Onboarding de cliente |
| `WHATSAPP_CANCELAMENTO_VR` | Mensagens Rapidas WhatsApp | CANCELAR | VR_SEM_POTENCIAL | Mensagem final para fim de foco comercial |
| `MANUAL_SUPERFRETE_10X15` | Aplicativos | APOIO | MARKETPLACE | Manual operacional |

## Regra de tela para `/intra/manuais/`

A tela deve:

1. Chamar `action=get_manuais_catalog`.
2. Receber JSON ja normalizado.
3. Agrupar por categoria.
4. Ordenar categorias por `ordemCategoria`.
5. Ordenar cards por `ordemItem`, depois titulo.
6. Usar `iconeCategoria` como icone do grupo.
7. Permitir busca por titulo, descricao, categoria, formato, ID, acao e filtro.
8. Permitir filtro rapido por categoria, formato e acao CRM.
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
2. Cachear resposta por tempo curto/medio.
3. Invalidar cache quando houver alteracao manual importante.
4. Retornar JSON enxuto.
5. Nao carregar arquivos do Drive, apenas metadados e links.

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
2. Criar endpoint `get_manuais_catalog`.
3. Ajustar `/intra/manuais/` para consumir a aba correta.
4. Adicionar colunas opcionais de vinculo com acao/filtro de cliente.
5. Criar checklist de teste da tela de manuais.
6. Atualizar documentacao apos a implementacao funcional.
