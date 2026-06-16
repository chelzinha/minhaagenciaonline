# Mapa de chamadas do frontend

Este documento lista arquivos do frontend que provavelmente fazem chamadas para Apps Script, Web Apps ou APIs externas.

Atencao: este arquivo nao deve registrar tokens, URLs privadas completas, secrets ou dados reais.

## Objetivo

Mapear quais telas do frontend dependem de chamadas externas para posterior ligacao com Apps Script, planilhas e integracoes.

## Resultado da varredura


### Padrao pesquisado: fetch(


### Padrao pesquisado: script.google.com

- frontend\agf\sw.js:9
- frontend\atende\index.html:15
- frontend\atende\index.html:8
- frontend\atende\sw.js:6
- frontend\balcao\sw.js:6
- frontend\caixa\index.html:899
- frontend\caixa\sw.js:6
- frontend\cep\sw.js:6
- frontend\crm\config.js:2
- frontend\crm\sw.js:5
- frontend\intra\sw.js:82
- frontend\js\config.js:10
- frontend\js\config.js:14
- frontend\rastreio\config.js:2
- frontend\sla\index.html:15
- frontend\sla\index.html:8
- frontend\sla\sw.js:6
- frontend\superfrete\sw.js:6
- frontend\superfrete-admin\index.html:43
- frontend\superfrete-admin\sw.js:6

### Padrao pesquisado: macros/s

- frontend\atende\index.html:15
- frontend\caixa\index.html:899
- frontend\crm\config.js:2
- frontend\js\config.js:10
- frontend\js\config.js:14
- frontend\rastreio\config.js:2
- frontend\sla\index.html:15
- frontend\superfrete-admin\index.html:43

### Padrao pesquisado: google.script.run


### Padrao pesquisado: api

- frontend\agf\index.html:10
- frontend\agf\index.html:12
- frontend\app\index.html:1207
- frontend\app\index.html:18
- frontend\app\index.html:20
- frontend\app\index.html:497
- frontend\app\index.html:67
- frontend\app\index.html:74
- frontend\app\index.html:81
- frontend\app\index.html:858
- frontend\app\service-worker.js:12
- frontend\balcao\index.html:11
- frontend\balcao\index.html:13
- frontend\balcao\index.html:327
- frontend\caixa\index.html:10
- frontend\caixa\index.html:1169
- frontend\caixa\index.html:12
- frontend\caixa\index.html:13
- frontend\caixa\index.html:1325
- frontend\caixa\index.html:1369
- frontend\caixa\index.html:1393
- frontend\caixa\index.html:1594
- frontend\caixa\index.html:961
- frontend\caixa\index.html:964
- frontend\caixa\index.html:984
- frontend\cep\index.html:21
- frontend\cep\index.html:23
- frontend\crm\app.js:123
- frontend\crm\app.js:128
- frontend\crm\app.js:132
- frontend\crm\app.js:134
- frontend\crm\app.js:135
- frontend\crm\app.js:138
- frontend\crm\app.js:139
- frontend\crm\app.js:140
- frontend\crm\app.js:155
- frontend\crm\app.js:167
- frontend\crm\app.js:171
- frontend\crm\app.js:67
- frontend\crm\app.js:68
- frontend\crm\app.js:70
- frontend\crm\app.js:71
- frontend\crm\app.js:72
- frontend\crm\app.js:73
- frontend\crm\app.js:90
- frontend\crm\config.js:2
- frontend\crm\index.html:11
- frontend\crm\index.html:9
- frontend\danfe-simplificado\index.html:7
- frontend\danfe-simplificado\index.html:9
- frontend\intra\index.html:10
- frontend\intra\index.html:12
- frontend\intra\index.html:13
- frontend\intra\offline.html:10
- frontend\intra\sw.js:106
- frontend\intra\sw.js:107
- frontend\intra\sw.js:7
- frontend\intra\sw.js:80
- frontend\intra\sw.js:81
- frontend\intra\sw.js:84
- frontend\js\api.js:18
- frontend\js\api.js:2
- frontend\js\api.js:54
- frontend\js\app.js:102
- frontend\js\app.js:140
- frontend\js\app.js:148
- frontend\js\app.js:150
- frontend\js\app.js:154
- frontend\js\app.js:159
- frontend\js\app.js:160
- frontend\js\app.js:53
- frontend\js\app.js:75
- frontend\js\app.js:98
- frontend\nuvem\index.html:10
- frontend\nuvem\index.html:12
- frontend\nuvem\index.html:424
- frontend\rastreio\index.html:1
- frontend\reverso\index.html:13
- frontend\reverso\index.html:15
- frontend\reverso-admin\index.html:11
- frontend\reverso-admin\index.html:9
- frontend\reverso-coleta\index.html:11
- frontend\reverso-coleta\index.html:9
- frontend\reverso-expedicao\index.html:11
- frontend\reverso-expedicao\index.html:9
- frontend\superfrete\index.html:10
- frontend\superfrete\index.html:12
- frontend\superfrete\index.html:257
- frontend\superfrete\index.html:49
- frontend\superfrete\index.html:56
- frontend\superfrete\index.html:63
- frontend\superfrete-admin\danfe-auditoria.html:7
- frontend\superfrete-admin\danfe-auditoria.html:9
- frontend\superfrete-admin\index.html:11
- frontend\superfrete-admin\index.html:346
- frontend\superfrete-admin\index.html:352
- frontend\superfrete-admin\index.html:567
- frontend\superfrete-admin\index.html:9

### Padrao pesquisado: endpoint


### Padrao pesquisado: webapp

- frontend\js\api.js:45
- frontend\js\api.js:46
- frontend\js\api.js:77
- frontend\js\config.js:10
- frontend\js\config.js:14
- frontend\rastreio\app.js:1
- frontend\rastreio\config.js:2
- frontend\superfrete\etiqueta-overlay.html:154
- frontend\superfrete\etiqueta-overlay.html:155
- frontend\superfrete\etiqueta-overlay.html:163
- frontend\superfrete-admin\etiqueta-overlay.html:154
- frontend\superfrete-admin\etiqueta-overlay.html:155
- frontend\superfrete-admin\etiqueta-overlay.html:163
- frontend\superfrete-admin\index.html:41
- frontend\superfrete-admin\index.html:43

### Padrao pesquisado: URL

- frontend\agf\agf.js:20
- frontend\agf\agf.js:21
- frontend\agf\agf.js:25
- frontend\agf\agf.js:29
- frontend\agf\agf.js:77
- frontend\agf\agf.js:87
- frontend\agf\agf.js:96
- frontend\agf\sw.js:10
- frontend\agf\sw.js:12
- frontend\agf\sw.js:13
- frontend\agf\sw.js:3
- frontend\agf\sw.js:8
- frontend\agf\sw.js:9
- frontend\app\service-worker.js:2
- frontend\app\service-worker.js:35
- frontend\app\service-worker.js:36
- frontend\app\service-worker.js:69
- frontend\atende\sw.js:4
- frontend\atende\sw.js:6
- frontend\balcao\sw.js:4
- frontend\balcao\sw.js:6
- frontend\caixa\index.html:899
- frontend\caixa\index.html:963
- frontend\caixa\index.html:968
- frontend\caixa\index.html:969
- frontend\caixa\sw.js:4
- frontend\caixa\sw.js:6
- frontend\cep\cep-page.js:274
- frontend\cep\cep-page.js:275
- frontend\cep\index.html:13
- frontend\cep\sw.js:4
- frontend\cep\sw.js:6
- frontend\crm\app.js:178
- frontend\crm\app.js:179
- frontend\crm\app.js:180
- frontend\crm\app.js:181
- frontend\crm\app.js:187
- frontend\crm\app.js:188
- frontend\crm\app.js:190
- frontend\crm\app.js:67
- frontend\crm\app.js:68
- frontend\crm\app.js:75
- frontend\crm\config.js:2
- frontend\crm\sw.js:5
- frontend\intra\sw.js:104
- frontend\intra\sw.js:107
- frontend\intra\sw.js:133
- frontend\intra\sw.js:21
- frontend\intra\sw.js:38
- frontend\intra\sw.js:48
- frontend\intra\sw.js:49
- frontend\intra\sw.js:50
- frontend\intra\sw.js:81
- frontend\intra\sw.js:82
- frontend\intra\sw.js:83
- frontend\intra\sw.js:84
- frontend\intra\sw.js:88
- frontend\intra\sw.js:89
- frontend\intra\sw.js:90
- frontend\js\api.js:45
- frontend\js\api.js:46
- frontend\js\api.js:77
- frontend\js\app.js:17
- frontend\js\app.js:18
- frontend\js\config.js:10
- frontend\js\config.js:14
- frontend\js\config.js:21
- frontend\js\config.js:6
- frontend\js\ui.js:223
- frontend\js\ui.js:224
- frontend\js\ui.js:229
- frontend\js\ui.js:231
- frontend\js\ui.js:232
- frontend\js\ui.js:234
- frontend\js\ui.js:242
- frontend\js\ui.js:249
- frontend\js\ui.js:250
- frontend\js\ui.js:251
- frontend\nuvemshop\index.html:1
- frontend\rastreio\app.js:1
- frontend\rastreio\config.js:2
- frontend\sla\sw.js:4
- frontend\sla\sw.js:6
- frontend\superfrete\etiqueta-overlay.html:151
- frontend\superfrete\etiqueta-overlay.html:154
- frontend\superfrete\etiqueta-overlay.html:155
- frontend\superfrete\etiqueta-overlay.html:163
- frontend\superfrete\etiqueta-overlay.html:164
- frontend\superfrete\etiqueta-overlay.html:167
- frontend\superfrete\etiqueta-overlay.html:200
- frontend\superfrete\etiqueta-overlay.html:203
- frontend\superfrete\etiqueta-overlay.html:208
- frontend\superfrete\etiqueta-overlay.html:248
- frontend\superfrete\etiqueta-overlay.html:250
- frontend\superfrete\etiqueta-overlay.html:251
- frontend\superfrete\sw.js:4
- frontend\superfrete\sw.js:6
- frontend\superfrete-admin\etiqueta-overlay.html:151
- frontend\superfrete-admin\etiqueta-overlay.html:154
- frontend\superfrete-admin\etiqueta-overlay.html:155
- frontend\superfrete-admin\etiqueta-overlay.html:163
- frontend\superfrete-admin\etiqueta-overlay.html:164
- frontend\superfrete-admin\etiqueta-overlay.html:167
- frontend\superfrete-admin\etiqueta-overlay.html:200
- frontend\superfrete-admin\etiqueta-overlay.html:203
- frontend\superfrete-admin\etiqueta-overlay.html:208
- frontend\superfrete-admin\etiqueta-overlay.html:248
- frontend\superfrete-admin\etiqueta-overlay.html:250
- frontend\superfrete-admin\etiqueta-overlay.html:251
- frontend\superfrete-admin\index.html:204
- frontend\superfrete-admin\index.html:41
- frontend\superfrete-admin\index.html:43
- frontend\superfrete-admin\index.html:44
- frontend\superfrete-admin\index.html:46
- frontend\superfrete-admin\sw.js:4
- frontend\superfrete-admin\sw.js:6

### Padrao pesquisado: BASE_URL


## Proximos passos

- Conferir cada arquivo listado.
- Relacionar cada chamada ao modulo Apps Script correspondente.
- Atualizar docs/MAPA_MODULOS.md.
- Nao registrar URL privada completa nem segredo.
