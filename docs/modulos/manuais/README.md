# Manuais

**Module ID:** `manuais`  
**Tipo:** interno / base de apoio  
**Rota:** `/intra/manuais`  
**Frontend:** `frontend/intra/manuais`  
**Fonte de dados conhecida:** aba `Manuais` na base operacional documentada  
**Dados sensíveis:** normalmente baixo; confirmar conteúdo publicado

## 1. Finalidade

Disponibilizar base de apoio, materiais, orientações e manuais para a equipe dentro do Portal Interno.

## 2. Regra conceitual importante

A documentação vigente diferencia:

- `MIDIAS_CRM`: biblioteca estratégica de conteúdos usados pelas ações do CRM;
- `Manuais`: biblioteca mais ampla da tela `/intra/manuais/`, podendo conter conteúdos próprios e itens relacionados ao CRM.

Essas estruturas não devem ser fundidas automaticamente.

## 3. Dados

A tela deve ser alimentada pela aba `Manuais`. Existem propostas documentais de campos de vínculo/filtro, mas qualquer nova coluna deve ser tratada como mudança de dados e validada antes de implementação.

## 4. UX/UI

- busca e filtros simples;
- cards/linhas de leitura rápida;
- abrir material sem perder contexto;
- estado vazio claro;
- shell AGF compartilhado.

## 5. Performance

Carregar metadados leves primeiro. Arquivos, imagens ou PDFs pesados devem abrir sob demanda.

## 6. Segurança

Não publicar documentos internos sensíveis para usuários sem permissão. Links do Drive devem respeitar controle de acesso.

## 7. Testes mínimos

- permissão;
- listagem;
- busca/filtros;
- abertura de material;
- link indisponível;
- base vazia;
- mobile/desktop.

## 8. Pendências

- mapear schema final da aba `Manuais`;
- confirmar backend/action de leitura;
- documentar tipos de conteúdo e permissões;
- decidir vínculo formal com `MIDIAS_CRM` sem duplicar fontes.