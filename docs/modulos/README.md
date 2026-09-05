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

## Índice principal

### Público e clientes

- `plataforma-raiz/README.md` - site público `/`.
- `app/README.md` - Minhas Postagens `/app`.
- `nuvem/README.md` - Minhas Postagens Nuvemshop `/nuvem`.
- `superfrete/README.md` - portal do cliente `/superfrete`.
- `cep/README.md` - consulta de CEP `/cep` e serviço compartilhado.
- `dce/README.md` - emissor DC-e integrado por `/dce`.
- `cartoes-digitais/README.md` - cartões públicos por slug.
- `reverso/USUARIO.md` - experiência externa `/reverso`.

### Interno operacional e gerencial

- `intra/README.md` - hub `/intra`.
- `dashboard/README.md` - `/intra/dashboard`.
- `inteligencia/README.md` - família `/intra/inteligencia`.
- `crm/README.md` - `/crm`.
- `resumos/README.md` - `/intra/resumo`.
- `logistica-interna/README.md` - `/intra/logistica`.
- `caixa/README.md` - Caixa oficial em `/caixa`; a antiga rota `/intra/caixa` foi removida definitivamente.
- `manuais/README.md` - `/intra/manuais`.
- `atende/README.md` - `/atende`.
- `sla/README.md` - SLA.
- `balcao/README.md` - `/balcao`.
- `superfrete-admin/README.md` - `/superfrete-admin`.
- `agf/README.md` - `/agf`.

### Logística Reversa

- `reverso/README.md` - arquitetura da família.
- `reverso/USUARIO.md` - `/reverso`.
- `reverso/ADMIN.md` - `/reverso-admin`.
- `reverso/COLETA.md` - `/reverso-coleta`.
- `reverso/EXPEDICAO.md` - `/reverso-expedicao`.

### Inteligência

- `inteligencia/CARTEIRA.md`.
- `inteligencia/GERENCIAL.md`.
- `inteligencia/COMERCIAL.md`.
- `inteligencia/FINANCEIRO.md`.
- `inteligencia/ATENDIMENTO.md`.
- `inteligencia/OPERACIONAL.md`.

### Serviços técnicos compartilhados

- `autenticacao/README.md` - autenticação e autorização compartilhadas.
- `etiquetas/README.md` - backend de etiquetas/postagem.
- `nf/README.md` - extrator NF-e/DANFE.
- `base-metro/README.md` - base/regras do CRM e áreas relacionadas.
- `base-cliente-etiquetas/README.md` - serviço de apoio clientes/etiquetas.
- `logistica/README.md` - backend da família Reverso.

## Rotas de compatibilidade, não módulos independentes

- `/intra/agenda` redireciona para `/crm/?view=agenda`.
- `/intra/crm` redireciona para `/crm/?view=clientes`.

`/intra/caixa` não é rota de compatibilidade: foi eliminada e não deve ser recriada nem redirecionada.

## Pendências globais

1. Confirmar produção/homologação de cada rota.
2. Mapear URL `/exec` e `/dev` dos Apps Scripts sem expor segredos.
3. Mapear planilhas, abas, cabeçalhos e chaves.
4. Mapear owners técnicos e operacionais.
5. Classificar todos os módulos em M0-M5.
6. Confirmar frontend -> action -> Apps Script -> planilha.
7. Definir rota canônica do SLA quando houver duplicidade.
8. Resolver papel de `/agf` em relação ao `/intra`.
9. Inventariar slugs dos Cartões Digitais.
10. Atualizar cada README quando o estado de produção for validado.

## Regra de manutenção

Toda alteração funcional relevante deve atualizar o README do módulo correspondente e o `CHANGELOG.md` global. Mudanças em dados, segurança, performance ou arquitetura devem atualizar também os documentos temáticos previstos no Plano Mestre.