# Emissor DC-e

**Module ID:** `dce`  
**Tipo:** fiscal / projeto externo integrado por rota  
**Rota pública:** `/dce` e `/dce/*`  
**Frontend no repositório principal:** redirecionamento  
**Projeto real:** aplicação isolada `agf-dce-facil` segundo documentação vigente  
**Dados sensíveis:** SIM

## 1. Finalidade

Disponibilizar emissão de DC-e/DACE em aplicação fiscal separada do frontend principal, preservando dependências específicas de identidade, functions e configuração fiscal.

## 2. Arquitetura documentada

A documentação atual registra que `/dce` redireciona temporariamente para projeto isolado. O objetivo arquitetural é manter o emissor separado enquanto houver dependências próprias.

```text
minhaagenciaonline.com.br/dce
↓
redirect
↓
projeto fiscal isolado
↓
serviços/credenciais fiscais próprios
```

## 3. Segurança

**Atenção sensível máxima.** Pode envolver dados fiscais, certificados, credenciais, documentos e valores. O site principal não deve transportar token, certificado ou dado fiscal desnecessário durante o redirecionamento.

## 4. Compatibilidade

Não remover o redirecionamento sem confirmar:

- domínio/rota futura;
- autenticação;
- identidade do usuário;
- backend/functions;
- configuração fiscal;
- rollback.

## 5. Testes mínimos

- `/dce` redireciona corretamente;
- subrotas necessárias continuam funcionando;
- nenhum segredo aparece na URL;
- autenticação do projeto isolado funciona;
- emissão com dados fictícios em homologação;
- DACE/resultado gerado conforme regra vigente.

## 6. Pendências

- confirmar hospedagem atual do projeto `agf-dce-facil` após migração geral para Cloudflare;
- confirmar URL final planejada (`dce.minhaagenciaonline.com.br` aparece como possibilidade documental, não como fato);
- consolidar documentação técnica do repositório do emissor, se for separado.