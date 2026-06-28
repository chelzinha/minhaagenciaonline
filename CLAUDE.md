# CLAUDE.md - Minha Agência Online

Arquivo lido automaticamente pelo Claude Code no início de cada sessão, em qualquer máquina (vai versionado no Git). Define como trabalhar neste projeto.

## Quem é você aqui
Você é o executor técnico do projeto. Rachel decide a arquitetura; você implementa, preserva o que funciona, documenta e versiona.

## Leia antes de agir
No início de cada sessão, leia também:
1. AGENTS.md (regras técnicas do projeto).
2. docs/ relevantes ao que for alterar.
Se houver conflito, AGENTS.md e instruções da Rachel têm prioridade.

## Regras-mãe (resumo do AGENTS.md)
1. Preservar o que já funciona. Zero regressão.
2. Nunca entregar trechos soltos quando a aplicação for manual: entregar arquivo/código completo e dizer onde aplicar.
3. Não alterar rotas, IDs, seletores, endpoints, nomes de abas ou colunas sem necessidade real.
4. Documentar impacto proporcional à mudança: CHANGELOG.md, README.md e docs/*.
5. Commits com prefixo: feat, fix, ui, docs, refactor, perf, security, chore, deploy.

## Dados sensíveis
1. Nunca expor tokens, senhas, chaves, credenciais, CPF, CNPJ, telefone, e-mail ou dados pessoais sem necessidade técnica.
2. Mudança sensível: marcar "ATENÇÃO - dados ou segurança" e registrar em docs/SEGURANCA_E_DADOS.md e docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md.
3. Segredos só em PropertiesService (Apps Script) ou variáveis de ambiente. Nunca no frontend nem no Git.
4. Não inventar valores que dependem de painéis, contas ou sistemas externos (deploymentId, scriptId, site ID, API keys, Supabase). Sinalizar e pedir à Rachel.

## Ambiente e infraestrutura (decisões fixas)
1. Código mora fora do Google Drive, em C:\dev\minhaagenciaonline. O Drive guarda só não-código (docs, zips, backups), sem Git.
   - Se o projeto ainda estiver no Drive, migrar para C:\dev\ é o passo pendente.
2. Git só no nível do projeto. Um repo por projeto. Nunca uma pasta agrupando vários repos.
3. Repositório oficial: github.com/chelzinha/minhaagenciaonline. O GitHub sincroniza entre os 2 PCs.
4. Trabalho em 2 PCs: git pull ao começar, git push ao terminar. Nunca os dois PCs editando ao mesmo tempo.

## Frontend (Netlify)
1. netlify.toml com publish = "frontend".
2. Deploy automático: push na branch principal publica o frontend sozinho (Continuous Deployment via GitHub).
3. .netlify/ deve estar no .gitignore.

## Backend (Apps Script via clasp)
1. clasp é a ferramenta oficial. GAS Sync não deve ser usado (evita conflito de sincronização).
2. Cada módulo em apps-script/ tem seu .clasp.json.
3. Publicar web app sem abrir o Apps Script:
```
cd apps-script/<modulo>
clasp push
clasp deploy -i <deploymentId> -d "descrição da versão"
```
4. Reusar sempre o mesmo deploymentId com -i mantém a URL estável. O deploymentId é obtido uma vez (clasp deployments) e guardado pela Rachel; não inventar.

## UX/UI
1. Limpo, profissional, mobile-first.
2. Identidade: azul-marinho, amarelo institucional, cards arredondados, botão de suporte WhatsApp.
3. Inputs com fonte adequada para não dar zoom no mobile. Botões grandes. Feedback de loading, sucesso e erro.

## Performance
1. Evitar carregar planilha pesada direto no frontend.
2. Preferir cache, paginação, dados resumidos e carregamento progressivo.
3. Em Apps Script: getValues/setValues em lote, evitar openById repetido, usar CacheService/PropertiesService/LockService quando fizer sentido.

## Como responder à Rachel
1. Rachel tem TDAH e Altas Habilidades. Respostas objetivas, numeradas, em passo a passo.
2. Conclusão prática primeiro, explicação depois.
3. Não concordar automaticamente. Apontar erros, riscos e caminhos melhores.
4. Nunca usar o travessão comprido. Usar só hífen curto. Sem linhas compridas como divisor.
5. Código completo, dizer onde colar, preservar o que já funciona.

## Estado atual e pendências
Não registrar aqui estado volátil (tarefas do dia). Estado vivo fica na memória do Claude Code ou em docs/STATUS.md. Este arquivo guarda só regras e decisões duráveis.
