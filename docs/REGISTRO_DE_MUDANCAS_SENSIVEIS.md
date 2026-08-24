# REGISTRO_DE_MUDANCAS_SENSIVEIS

Documento tecnico em preparacao.

## 2026-08-23 - Central AGF v0.9.2 - resolucao de contrato 999 por Cartao de Postagem

### Atencao sensivel
A mudanca altera a interpretacao tecnica de dados contratuais usados como evidencia de identidade cadastral. `NUMERO_CONTRATO=9999999999` deixa de ser tratado como simples sentinela descartavel e passa a ser preservado como valor de origem que pode ser resolvido por `CARTAO_POSTAGEM` quando houver associacao historica univoca.

Dados envolvidos:
- numero de contrato recebido da fonte;
- Cartao de Postagem;
- Razao Social;
- intermediador do contrato;
- nome de remetente;
- historico de postagens e faturamento agregado usado na auditoria.

O que mudou:
- `9999999999` continua visivel como contrato de origem;
- a auditoria constroi em memoria o indice `CARTAO_POSTAGEM -> contratos reais observados`;
- somente cartao associado a exatamente um contrato real pode resolver automaticamente `9999999999`;
- cartao associado a mais de um contrato fica ambiguo e nao recebe escolha automatica;
- cartao sem referencia ou linha sem cartao permanece sem resolucao automatica;
- contrato de origem diferente de `9999999999` nunca e sobrescrito por essa regra;
- `24_AUDITORIA_QUALIDADE_MASTER` separa contratos de origem, cartoes observados, contratos resolvidos e status da resolucao;
- `25_RESUMO_QUALIDADE_MASTER` reconcilia todas as ocorrencias `9999999999`;
- depois da resolucao, somente contratos classificados em `02_CONTRATOS` como `INTERMEDIADOR=PORTAL POSTAL` podem atuar como autoridade de Razao Social.

Risco principal:
- atribuir um contrato incorreto a uma linha historica quando um Cartao de Postagem tiver sido usado por mais de um contrato;
- transformar um dado de origem incorreto em cadastro oficial sem manter rastreabilidade;
- usar contrato de intermediador compartilhado como se fosse identidade do cliente.

Mitigacao aplicada:
- resolucao apenas quando o cartao possui exatamente um contrato real conhecido;
- qualquer ambiguidade permanece sem correcao automatica;
- valor de origem `9999999999` e preservado e exibido separadamente;
- fatos mensais continuam somente leitura;
- a soma das categorias de resolucao do `9999999999` deve fechar exatamente com o total observado ou a auditoria aborta;
- nenhum `CLIENTE_ID`, Centro/Local final ou contrato e persistido nos fatos nesta versao;
- nenhum dado real de cliente, Cartao de Postagem, contrato, ID privado ou credencial e copiado para esta documentacao.

Arquivos/estruturas envolvidos:
- `apps-script/central-agf/13_AUDITORIA_QUALIDADE_MASTER.gs`;
- `apps-script/central-agf/00_CFG.gs`;
- `apps-script/central-agf/README.md`;
- `apps-script/central-agf/TESTES.md`;
- `docs/CENTRAL_AGF_DADOS.md`;
- `PROCESSAMENTO_POSTAGENS_CORREIOS!03_REGRAS_MERGE` com `MERGE_016`.

Como testar:
- sincronizar a v0.9.2 via clasp;
- executar `centralAgfAuditarQualidadePropostaMaster()`;
- conferir em `25_RESUMO_QUALIDADE_MASTER` que `LINHAS_999_TOTAL` seja igual a soma de `RESOLVIDAS_POR_CARTAO_UNIVOCO`, `CARTAO_AMBIGUO`, `CARTAO_SEM_REFERENCIA` e `SEM_CARTAO`;
- conferir que `24_AUDITORIA_QUALIDADE_MASTER` preserve o contrato de origem e mostre separadamente o contrato resolvido;
- confirmar que `01_CLIENTES_MASTER` e os fatos mensais permanecam inalterados.

Como reverter:
- reverter os commits da v0.9.2 na branch `feat/central-agf-motor-v1`;
- reenviar a versao anterior via clasp se necessario;
- as abas 24 e 25 podem ser reconstruidas pela versao anterior, pois sao visoes derivadas e nao fonte de verdade;
- `MERGE_016` deve ser mantida como registro da regra de negocio mesmo que a implementacao seja temporariamente revertida.

## 2026-08-23 - Central AGF v0.8.0 - proposta idempotente de Cliente ID

### Atencao sensivel
A mudanca gera identificadores tecnicos propostos a partir de identidades cadastrais consolidadas. Apesar de ainda nao haver escrita no Cadastro Mestre, o desenho do `CLIENTE_ID` passa a fazer parte da camada de identidade permanente futura.

Dados envolvidos:
- nome canonico derivado;
- Centro principal proposto;
- tipo de identidade de origem;
- evidencias de aliases e locais observados;
- ocorrencias e faturamento agregado para reconciliacao;
- `LOTE_ITEM_ID` e `CLIENTE_ID_PROPOSTO`.

O que mudou:
- foi criada `centralAgfGerarPropostaClienteId()`;
- o ID proposto usa formato `CLI_` + 20 caracteres hexadecimais;
- o valor e deterministico por SHA-256 de namespace tecnico fixo + `LOTE_ITEM_ID`;
- o ID nao codifica nome, Centro, CPF/CNPJ, contrato ou significado comercial visivel;
- `21_PROPOSTA_CLIENTES_MASTER` recebe a proposta rebuildable;
- `22_CONFLITOS_PROPOSTA_ID` isola colisao de ID, duplicidade de chave ou conflito com Master existente;
- `23_RESUMO_PROPOSTA_ID` reconcilia a quantidade da proposta;
- `LOCAL_ID_PRINCIPAL`, `CNPJ_CPF` e `NOME_FANTASIA` nao sao preenchidos sem fonte homologada;
- `RAZAO_SOCIAL_OFICIAL` so e preenchida automaticamente para `AGF_RAZAO_SOCIAL`.

Risco principal:
- criar um identificador novo para uma entidade que ja exista no Master;
- gerar dois IDs para a mesma identidade;
- colidir IDs entre identidades diferentes;
- transformar Local historico/provisorio em vinculo permanente sem homologacao.

Mitigacao aplicada:
- a funcao so executa com zero conflitos residuais em `20_RESUMO_LOTE_SEGURO`;
- valida duplicidade de `LOTE_ITEM_ID`, `CLIENTE_ID_PROPOSTO` e Centro + nome;
- compara a proposta com `01_CLIENTES_MASTER` por ID, origem de identidade e Centro + nome;
- `LOCAL_ID_PRINCIPAL` permanece sempre vazio nesta etapa;
- nenhuma linha e escrita em `01_CLIENTES_MASTER`;
- nenhuma linha e escrita em `04_CLIENTES_CENTRO_LOCAL`;
- nenhum fato mensal e alterado;
- nenhuma credencial nova e criada e nenhum segredo e registrado.

Regra futura de imutabilidade:
- depois de um `CLIENTE_ID` ser persistido no Cadastro Mestre, mudancas posteriores de nome, alias, Razao Social, Centro/Local observado ou limpeza textual nao podem recalcular nem substituir esse ID automaticamente.

Arquivos envolvidos:
- `apps-script/central-agf/00_CFG.gs`;
- `apps-script/central-agf/06_MENU.gs`;
- `apps-script/central-agf/12_PROPOSTA_CLIENTE_ID.gs`;
- `apps-script/central-agf/README.md`;
- `apps-script/central-agf/TESTES.md`;
- `docs/CENTRAL_AGF_DADOS.md`;
- `docs/APPS_SCRIPT.md`;
- `docs/PLANILHAS_E_DADOS.md`;
- `docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md`;
- `CHANGELOG.md`.

Como testar:
- sincronizar a v0.8.0 via clasp;
- confirmar que `20_RESUMO_LOTE_SEGURO` continua com zero conflitos;
- executar `centralAgfGerarPropostaClienteId()`;
- confirmar que `23_RESUMO_PROPOSTA_ID` explica integralmente as identidades do lote seguro;
- confirmar que IDs permanecem iguais em uma segunda execucao com a mesma entrada;
- confirmar que `01_CLIENTES_MASTER`, `04_CLIENTES_CENTRO_LOCAL` e fatos mensais permanecem inalterados.

Como reverter:
- reverter os commits da v0.8.0 na branch `feat/central-agf-motor-v1`;
- reenviar a versao anterior via clasp se a v0.8.0 ja tiver sido sincronizada;
- as abas 21, 22 e 23 podem ser removidas apos confirmar que nenhuma rotina posterior depende delas, pois sao visoes derivadas e nao fonte de verdade.

## 2026-08-23 - Central AGF v0.7.1 - consolidacao AGF Balcao + contrato

### Atencao sensivel
A mudanca alterou a regra de consolidacao de identidade dentro do `CTR_AGF`.

Regra confirmada:
- quando o mesmo nome canonico exato aparece como `AGF_BALCAO_REMETENTE` e `AGF_RAZAO_SOCIAL` no mesmo Centro, trata-se da mesma identidade vista por dois canais/evidencias;
- `AGF_RAZAO_SOCIAL` prevalece como identidade cadastral oficial;
- a evidencia de Balcao permanece preservada como alias/origem;
- a regra nao atravessa Centros e nao promove fuzzy/score.

Homologacao:
- 2.140 identidades no lote seguro;
- zero conflitos residuais;
- 1.106 `CTR_AGF` e 1.034 `CTR_METRO`;
- R$ 4.887.208,27 preservados integralmente.

## 2026-08-23 - Central AGF v0.7.0 - lote seguro de migracao de clientes

### Atencao sensivel
A mudanca consolida identidades cadastrais derivadas e faturamento agregado para preparar uma futura migracao ao Cadastro Mestre.

Dados envolvidos:
- nome canonico derivado;
- nome de remetente e Razao Social observados;
- Centro sugerido e locais de origem;
- ocorrencias e faturamento agregado;
- evidencias de aliases legados.

O que mudou:
- foi criada a rotina `centralAgfGerarLoteSeguroMigracaoClientes()`;
- somente candidatos `PRONTO_PREVIA` entram na consolidacao;
- a chave provisoria e `CENTRO_SUGERIDO + NOME_CANONICO normalizado`;
- o mesmo canonico em mais de um Centro e isolado em conflito e nao e unificado automaticamente;
- tipo/Centro incompatível, estrategia nao permitida, Centro desconhecido e placeholder tambem ficam fora do lote seguro;
- `LOTE_ITEM_ID` e uma chave tecnica deterministica da visao derivada e nao e `CLIENTE_ID`.

Risco principal:
- consolidar pessoas/empresas diferentes sob a mesma identidade ou dividir a mesma identidade de forma incorreta antes de criar `CLIENTE_ID` definitivo.

Mitigacao aplicada:
- nenhuma escrita em `01_CLIENTES_MASTER`;
- nenhuma escrita em `04_CLIENTES_CENTRO_LOCAL`;
- nenhuma alteracao nos fatos mensais;
- nenhuma deduplicacao automatica de SRO/FATO_ID;
- nenhuma unificacao automatica entre Centros;
- `18_LOTE_SEGURO_CLIENTES`, `19_CONFLITOS_LOTE_SEGURO` e `20_RESUMO_LOTE_SEGURO` sao visoes rebuildable;
- decisoes humanas persistentes nao sao gravadas nessas abas derivadas;
- nenhuma credencial nova e criada e nenhum segredo e registrado.

Arquivos envolvidos:
- `apps-script/central-agf/00_CFG.gs`;
- `apps-script/central-agf/06_MENU.gs`;
- `apps-script/central-agf/11_LOTE_SEGURO_MIGRACAO_CLIENTES.gs`;
- `apps-script/central-agf/README.md`;
- `apps-script/central-agf/TESTES.md`;
- `docs/CENTRAL_AGF_DADOS.md`;
- `docs/APPS_SCRIPT.md`;
- `docs/PLANILHAS_E_DADOS.md`;
- `CHANGELOG.md`.

Como testar:
- sincronizar a v0.7.0 via clasp;
- executar `centralAgfGerarLoteSeguroMigracaoClientes()`;
- confirmar que a soma do faturamento do lote seguro e dos conflitos explica integralmente a entrada `PRONTO_PREVIA`;
- confirmar que o mesmo canonico em mais de um Centro aparece em `19_CONFLITOS_LOTE_SEGURO`;
- confirmar que `01_CLIENTES_MASTER`, `04_CLIENTES_CENTRO_LOCAL` e fatos mensais continuam inalterados.

Como reverter:
- reverter os commits da v0.7.0 na branch `feat/central-agf-motor-v1`;
- reenviar a versao anterior via clasp se a v0.7.0 ja tiver sido sincronizada;
- as abas 18, 19 e 20 podem permanecer como visoes de homologacao sem efeito operacional, ou ser removidas depois de confirmar que nenhuma rotina depende delas.

## 2026-08-23 - Central AGF v0.4.1 - prioridade de Centro na identidade [REGRA SUPERADA PELA v0.4.2]

### Atencao sensivel
A mudanca alterou temporariamente a inferencia usada para agrupar identidades de clientes na visao diagnostica da CENTRAL AGF.

Observacao de rastreabilidade:
- a interpretacao da v0.4.1 abaixo nao e mais a regra atual;
- a v0.4.2 confirmou `RAZAO_SOCIAL=BALCÃO -> AGF` e `RAZAO_SOCIAL=GAS SHOPPING METRO -> METRO`, ambas vencendo `CENTRO_ORIGEM`;
- o registro da v0.4.1 permanece somente para documentar a sequencia de correcoes.

Dados envolvidos:
- nome de remetente;
- Razao Social;
- Centro de origem e Centro final;
- historico de postagens e faturamento agregado no diagnostico.

O que mudou na versao intermediaria:
- `CENTRO_ID_FINAL` reconhecido passou a vencer fallbacks automaticos;
- `RAZAO_SOCIAL=GAS SHOPPING METRO` permaneceu regra forte Metro quando nao havia Centro final;
- `CENTRO_ORIGEM` reconhecido foi avaliado antes do fallback generico `RAZAO_SOCIAL=BALCÃO`;
- `BALCÃO` sem Centro reconhecido ficou como fallback AGF.

Risco principal:
- atribuir candidato ao Centro errado e, em etapa futura, consolidar identidade incorreta no Cadastro Mestre.

Mitigacao aplicada:
- a rotina continuou somente leitura sobre `FATOS_POSTAGENS_AAAA_MM`;
- nenhuma linha foi deduplicada ou excluida;
- nenhum `CLIENTE_ID`, `CENTRO_ID_FINAL` ou `LOCAL_ID_FINAL` foi gravado;
- a regra foi corrigida na v0.4.2 antes de qualquer migracao efetiva do Cadastro Mestre.

## 2026-07-07 - Instrumentacao de performance do CRM

### Atencao sensivel
Foram adicionados logs tecnicos opcionais para medir performance do CRM.

### O que e registrado
- Tempo em ms por etapa.
- Nome tecnico da etapa.
- Quantidades agregadas.
- Tamanho aproximado da resposta.
- View/subview.

### O que nao e registrado
- CPF/CNPJ.
- Telefone.
- E-mail.
- Endereco.
- Nome de cliente/prospect.
- Tokens ou credenciais.
- Conteudo completo das respostas.

### Arquivos envolvidos
- `frontend/crm/app.js`
- `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`
- `apps-script/base-metro/10_OPERACAO_EXECUCAO_API.js`
## Registro sensivel - 2026-07-07 - CRM importacao em lote pela planilha

Tipo de mudanca:
- Criacao de rotina Apps Script para transformar cadastros manuais em entidades completas do CRM.

Modulo afetado:
- Planilha APP Total CF + Metro.
- Apps Script `apps-script/base-metro`.
- CRM/funil/jornada comercial.

Dados envolvidos:
- CPF/CNPJ.
- Nome de cliente/prospect.
- Telefone, WhatsApp e e-mail.
- Endereco cadastral.
- Responsavel comercial.
- Status de importacao, funil, etapa e tratativa.

Credenciais envolvidas:
- Nenhuma credencial nova.
- A rotina usa permissoes ja existentes do Apps Script sobre a planilha.

Valor sensivel exposto no documento?
- Nao.

Onde o dado/credencial fica armazenado:
- Dados cadastrais em `PROSPECTS` e `CLIENTES_CADASTRO`.
- Relacao de funil em `CRM_TRATATIVAS`.
- Eventos tecnicos em `CRM_EVENTOS`.

Arquivos alterados:
- `apps-script/base-metro/11_CRM_IMPORTACAO_LOTE_MENU.js`.
- `apps-script/base-metro/90_FILTROS.js`.
- `docs/CRM_IMPORTACAO_LOTE_PLANILHA.md`.
- `docs/PLANILHAS_E_DADOS.md`.
- `docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md`.
- `CHANGELOG.md`.

Commit/branch:
- Branch de trabalho: `feature/crm-importacao-lote-menu`.

Risco principal:
- Criar tratativas indevidas para linhas antigas.
- Expor dados reais em logs/documentacao.
- Cliente novo em `CLIENTES_CADASTRO` nao aparecer completo no card se overlay com `CLIENTES_MASTER` estiver desativado.
- Reprocessar cadastro manual sem necessidade.

Mitigacao aplicada:
- A rotina processa automaticamente apenas linhas novas sem ID ou linhas marcadas com `SUBIR_FRONT = SIM`.
- A rotina reaproveita tratativa aberta/pausada quando ja existir para a mesma entidade/funil.
- Erros sao gravados de forma curta em `ERRO_IMPORTACAO_CRM`, sem payload bruto.
- Documentacao usa apenas nomes de colunas e fluxos, sem dados reais.

Como testar:
- Usar linha ficticia em `PROSPECTS` sem `PROSPECT_ID`.
- Usar linha ficticia em `CLIENTES_CADASTRO` sem `CLIENTE_ID`.
- Confirmar preenchimento de IDs, `TRATATIVA_ATIVA_ID`, status de importacao e criacao de `CRM_TRATATIVAS`.
- Confirmar que linha antiga so e reprocessada se `SUBIR_FRONT = SIM`.
- Confirmar que logs/documentacao nao exibem CPF/CNPJ, telefone, e-mail ou endereco real.