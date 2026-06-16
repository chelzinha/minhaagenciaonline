# Mapa de dados e planilhas

Este documento registra a relacao entre modulos, Apps Script, planilhas, abas, dados sensiveis e pontos de performance da Plataforma Digital AGF.

Objetivo: manter rastreabilidade tecnica sem expor dados reais, tokens, senhas, chaves ou informacoes pessoais de clientes.

## 1. Regra principal

Nao registrar neste documento dados reais de clientes, URLs privadas completas, tokens, senhas, chaves, secrets ou credenciais.

Registrar apenas:

- nome tecnico do modulo
- finalidade da planilha
- abas usadas
- tipo de dado envolvido
- se existe dado sensivel
- gargalo conhecido
- status de confirmacao

## 2. Modulos mapeados

| Modulo | Apps Script | Planilha principal | Abas principais | Dados sensiveis | Status |
|---|---|---|---|---|---|
| autenticacao | apps-script/autenticacao | confirmar | confirmar | sim | pendente |
| base-metro | apps-script/base-metro | confirmar | confirmar | sim | pendente |
| logistica | apps-script/logistica | confirmar | confirmar | sim | pendente |
| atende | apps-script/atende | confirmar | confirmar | possivel | pendente |
| base-cliente-etiquetas | apps-script/base-cliente-etiquetas | confirmar | confirmar | sim | pendente |
| caixa | apps-script/caixa | confirmar | confirmar | possivel | pendente |
| cep | apps-script/cep | confirmar | confirmar | possivel | pendente |
| etiquetas | apps-script/etiquetas | confirmar | confirmar | sim | pendente |
| nf | apps-script/nf | confirmar | confirmar | sim | pendente |
| nuvemshop | apps-script/nuvemshop | confirmar | confirmar | sim | pendente |
| sla | apps-script/sla | confirmar | confirmar | possivel | pendente |

## 3. Tipos de dados por modulo

| Modulo | Tipos de dados provaveis | Atencao sensivel | Observacao |
|---|---|---|---|
| autenticacao | usuarios, permissoes, login, perfis | sim | Confirmar armazenamento e exibicao minima |
| base-metro | clientes, contatos, status, historico operacional | sim | Confirmar abas e volume de linhas |
| logistica | devolucoes, coletas, expedicao, rastreio, unidades | sim | Confirmar dados carregados no front |
| atende | atendimentos, mensagens ou solicitacoes | possivel | Confirmar uso atual |
| base-cliente-etiquetas | clientes, remetentes, destinatarios, etiquetas | sim | Confirmar duplicidade com etiquetas |
| caixa | dados operacionais ou financeiros | possivel | Confirmar escopo real |
| cep | consultas de endereco, normalizacao, cache | possivel | Evitar armazenar endereco desnecessario |
| etiquetas | destinatarios, remetentes, etiquetas, rastreio, preco, prazo | sim | Envolve CWS/Correios e possiveis dados pessoais |
| nf | dados fiscais, DANFE, CNPJ, IE, PDFs | sim | PDFs e dados fiscais exigem cuidado |
| nuvemshop | pedidos, clientes, webhooks, rastreio | sim | Envolve tokens, OAuth e dados de lojistas/clientes |
| sla | prazos, regras e acompanhamento | possivel | Confirmar dados usados |

## 4. Riscos conhecidos

- Leitura de planilhas grandes no carregamento inicial.
- Retorno de dados demais para o frontend.
- Processamento pesado em Apps Script a cada abertura de tela.
- Duplicacao de dados pessoais em varias abas.
- Logs com dados sensiveis.
- URLs, IDs ou credenciais registrados em locais inadequados.

## 5. Checklist de confirmacao por planilha

Para cada planilha usada, confirmar:

1. Nome tecnico da planilha.
2. Modulo relacionado.
3. Apps Script que acessa.
4. Abas usadas.
5. Colunas principais.
6. Se contem CPF, CNPJ, telefone, email ou endereco.
7. Se contem tokens, chaves ou credenciais.
8. Se contem dados financeiros ou fiscais.
9. Quantidade aproximada de linhas.
10. Se existe aba-resumo, aba-cache ou indice.
11. Se o frontend carrega tudo ou apenas dados filtrados.
12. Como testar sem expor dados reais.

## 6. Performance

Quando uma planilha crescer, priorizar:

- leitura em lote com getValues
- escrita em lote com setValues
- CacheService
- abas-resumo
- abas-cache
- indices por chave
- paginacao
- busca sob demanda
- separacao entre dados ativos e historico
- JSON enxuto para o frontend

## 7. Atencao sensivel

Este documento deve seguir as regras de dados e seguranca do projeto.

Nao documentar valor real de:

- token
- senha
- chave de API
- secret
- credencial
- cookie
- codigo de acesso

## 8. Pendencias

- Confirmar planilhas usadas por autenticacao.
- Confirmar planilhas usadas por base-metro.
- Confirmar planilhas usadas por logistica.
- Confirmar planilhas usadas por etiquetas.
- Confirmar planilhas usadas por nuvemshop.
- Confirmar planilhas usadas por nf.
- Confirmar planilhas usadas por cep, caixa, atende e sla.

## 9. Status

Documento inicial criado para orientar o mapeamento seguro de dados, planilhas e performance.
