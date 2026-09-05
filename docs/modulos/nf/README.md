# NF-e / DANFE PDF

**Module ID:** `nf`  
**Tipo:** técnico fiscal  
**Backend:** `apps-script/nf`  
**Consumidor principal conhecido:** `/app`  
**Dados sensíveis:** SIM  
**Status de produção:** NÃO CONFIRMADO

## 1. Finalidade

Ler DANFE/NF-e em PDF e devolver JSON estruturado para apoiar o preenchimento/revisão no App Minhas Postagens.

## 2. Arquitetura confirmada

O projeto é isolado do backend principal de etiquetas. O frontend `/app` chama esse Web App externo via `parseNfePdf`.

## 3. Segurança

**Atenção sensível máxima.** PDFs fiscais podem conter CNPJ, CPF, nomes, endereços, chave de acesso, valores e produtos.

Produção deve ser **fail closed**. O Plano Mestre identificou configuração permissiva equivalente a `ALLOW_WITHOUT_AUTH_WHEN_UNCONFIGURED = true` como risco a corrigir/validar.

Autenticação esperada:

- sessão válida do app principal; ou
- secret em Script Properties, se esse modo permanecer suportado.

Nunca hardcode de segredo.

## 4. Tratamento de erros

Não devolver ao navegador:

- stack trace;
- body bruto da API;
- secret/token;
- payload fiscal integral desnecessário;
- URL privada.

## 5. Fluxo

```text
/app recebe PDF
↓
Web App NF valida autenticação
↓
extrai dados
↓
retorna JSON sanitizado
↓
/app mostra dados para revisão
↓
usuário confirma antes da etiqueta
```

## 6. Testes mínimos

- sem autenticação: recusado;
- sessão válida;
- secret válido/inválido se aplicável;
- PDF fictício válido;
- PDF inválido;
- ausência de stack/secret na resposta;
- campos extraídos coerentes;
- nenhum dado real usado em homologação.

## 7. Pendências

- confirmar estado atual de `ALLOW_WITHOUT_AUTH`;
- confirmar configuração de produção sem registrar valores;
- mapear bibliotecas/serviços de extração;
- registrar política de retenção temporária de PDFs, se houver.