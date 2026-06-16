REVERSO BACKEND v1.3.0 — LOTES DISPONÍVEIS E USABILIDADE DA PLANILHA

ALTERAÇÕES PRINCIPAIS
- getLotePrintData agora retorna somente etiquetas disponíveis.
- novo endpoint getEtiquetaPrintData para visualização/impressão individual em qualquer status.
- nova rotina applyEditableCellsHighlight para destacar em amarelo claro campos editáveis manualmente.
- setupReversaSupportData aplica automaticamente o destaque amarelo.
- menu Reversa ganhou item Destacar células editáveis.

SUBIDA VIA CLASP
1. Descompacte o pacote.
2. Entre na pasta reversa_backend_clasp.
3. Rode clasp push.
4. Faça nova implantação do Web App.
5. Execute setupReversaSupportData uma vez para reaplicar validações e destacar campos editáveis.

TESTE RÁPIDO
- Abra Admin Reverso > Etiquetas.
- Gere lote com 3 etiquetas.
- Confirme que PDF/Imprimir mostra somente disponíveis.
- Faça um drop-off e confira que o lote deixa de imprimir a etiqueta usada.
- Na tabela Etiquetas recentes, confira que a etiqueta usada continua disponível para impressão individual.
