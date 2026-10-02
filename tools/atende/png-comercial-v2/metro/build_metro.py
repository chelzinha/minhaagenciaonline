# -*- coding: utf-8 -*-
"""Arte 1080x1080: Metrô - resultado do mês. Mesmo modelo do Balcão AGF, sem o bloco de percentuais por colaborador."""
import json, os, re, sys, base64
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, ".."))
from agf_ico import ico, MEDALHA_PAR
FONTES = os.path.join(AQUI, "..", "fonts")
fonte = lambda n: base64.b64encode(open(os.path.join(FONTES, n), "rb").read()).decode()

h = open(os.path.join(AQUI, "..", "balcao", "modelo_balcao.html"), encoding="utf-8").read()
# remove o bloco de percentuais e o JS dele
h = re.sub(r'\s*<section class="rank">.*?</section>', '', h, flags=re.S)
h = h[:h.index("  const total = d.ranking")] + h[h.index("})(D);"):]
# título de uma palavra recebe a faixa amarela inteira (mesmo padrão de Encomendas)
h = h.replace("p2.length ? `${p1}<span class=\"marca\">${p2.join(' ')}</span>` : p1",
              "p2.length ? `${p1}<span class=\"marca\">${p2.join(' ')}</span>` : `<span class=\"marca-total\">${p1}</span>`")
# sem o ranking, os blocos ganham escala para ocupar a peça sem card esticado
EXTRA = """<style id="metro-extra">
.peca{justify-content:space-between;gap:18px;padding:40px 48px 40px}
.hero h1 .marca-total{display:inline-block;background:var(--amarelo);color:var(--tinta);padding:0 18px 6px;border-radius:6px}
.hero{padding:32px 40px 30px}
.h-corpo{margin-top:22px}
.h-corpo .valor{font-size:88px}
.anel,.anel svg{width:180px !important;height:180px !important}
.anel .meio b{font-size:32px !important}
.ritmo{margin-top:26px}
.ritmo .trilho{height:20px}
.nivel{padding:22px 24px 20px}
.nivel .num{font-size:38px;margin-top:14px}
.nivel .barra-n{height:14px;margin-top:14px}
.nivel .info{font-size:18px;gap:5px;margin-top:12px}
.cartao{padding:26px 24px}
.cartao .cab{margin-bottom:14px !important}
.linhas div{padding:12px 0;font-size:21px}
.linhas b{font-size:26px}
.md-linha{padding:12px 0}
.md-linha b{font-size:34px}
.duas{grid-template-columns:minmax(0,1.08fr) minmax(0,1fr)}
.md-linha span{font-size:18.5px}
.md-linha span small{font-size:16px}
.md-selo{font-size:16px;margin-top:12px}
</style></head>"""
h = h.replace("</style></head>", "</style>\n" + EXTRA.replace("</style></head>", "</style></head>"), 1) if False else h.replace("</head>", EXTRA[:-len("</head>")] + "</head>", 1)

DADOS = json.load(open(os.path.join(AQUI, "dados_metro.json"), encoding="utf-8"))
for k, v in {
    "__P600__": fonte("poppins600.ttf"), "__P700__": fonte("poppins700.ttf"), "__P800__": fonte("poppins800.ttf"),
    "__I_RELATORIO__": ico("relatorio", 30), "__I_PASSO__": ico("passo-a-passo", 30),
    "__MEDALHAS__": json.dumps({n: ico("medalha", 32, p, a) for n, (p, a) in MEDALHA_PAR.items()}),
    "__DADOS__": json.dumps(DADOS, ensure_ascii=False),
}.items():
    h = h.replace(k, v)
h = h.replace("<title>AGF - resultado do mês, Balcão AGF</title>", "<title>AGF - resultado do mês, Metrô</title>")
open(os.path.join(AQUI, "AGF_resultado-metro.html"), "w", encoding="utf-8").write(h)
print("ok", "__" in re.sub(r"__I_|__P|__D|__M", "", "") )
