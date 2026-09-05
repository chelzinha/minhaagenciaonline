# Consulta de CEP

**Module ID:** `cep`  
**Tipo:** público + serviço compartilhado  
**Rota pública:** `/cep`  
**Backend:** `apps-script/cep`  
**Consumidores adicionais:** fluxos de etiquetas/balcão  
**Dados sensíveis:** baixo isoladamente; endereço completo pode ser sensível em contexto de cliente

## 1. Finalidade

Permitir consulta e normalização de CEP/endereço para uso público e apoio aos módulos de postagem.

## 2. Fluxo

```text
Usuário ou módulo
↓
CEP
↓
serviço de consulta
↓
logradouro/bairro/cidade/UF
↓
preenchimento ou exibição
```

## 3. Regras

- validar formato antes da consulta;
- tratar CEP inexistente e indisponibilidade externa;
- não sobrescrever número/complemento informado pelo usuário;
- normalizar resposta sem acoplar consumidores ao formato bruto de fornecedor externo.

## 4. Performance

Consultas repetidas e públicas são candidatas a cache com TTL adequado. Não abrir planilha pesada para uma consulta simples se não for necessário.

## 5. Segurança

Não registrar endereço completo de cliente em log apenas para diagnosticar CEP. Logs devem usar etapa técnica/status.

## 6. Testes mínimos

- CEP válido;
- CEP inexistente;
- CEP com máscara;
- timeout/erro externo;
- uso no `/cep` público;
- uso em emissão de etiqueta;
- mobile.

## 7. Pendências

- identificar fornecedor/API de CEP vigente;
- documentar cache e TTL;
- confirmar se o backend é exclusivo da rota pública ou compartilhado integralmente.