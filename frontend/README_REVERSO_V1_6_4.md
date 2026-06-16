# Reverso v1.6.4 — ajuste logo unidade e leitor QR mobile

## Alterações

- Removeu caixa interna, fundo e sombra da logo da unidade nas telas públicas.
- Reduziu o tamanho da logo exibida no login e na home da unidade.
- Aplicou ajuste visual para logos com fundo branco ficarem menos evidentes no cartão de login.
- Reforçou o leitor mobile de QR Code da etiqueta:
  - área visual de leitura maior;
  - linha de leitura percorrendo toda a área marcada;
  - câmera traseira com resolução maior;
  - leitura nativa por BarcodeDetector quando disponível;
  - fallback por jsQR via CDN quando o navegador não lê bem pelo BarcodeDetector;
  - mensagens de orientação mais claras.

## Observação

O QR Code testado no PDF das etiquetas é válido e decodifica como URL do app com slug da unidade e etiqueta. A correção foca no leitor mobile e no layout da logo.
