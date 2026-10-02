# -*- coding: utf-8 -*-
"""Arte quadrada 1080x1080: Encomendas - resultado do mês. Mesmo sistema visual do Balcão AGF."""
import json, base64, os, re, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, ".."))
from agf_ico import ico, MEDALHA_PAR
FONTES = os.path.join(AQUI, "..", "fonts")
fonte = lambda n: base64.b64encode(open(os.path.join(FONTES, n), "rb").read()).decode()

base = open(os.path.join(AQUI, "..", "balcao", "modelo_balcao.html"), encoding="utf-8").read()
css = re.search(r"<style>(.*?)</style>", base, re.S).group(1)

HTML = open(os.path.join(AQUI, "modelo_encomendas.html"), encoding="utf-8").read().replace("__CSS_BASE__", css)
DADOS = json.load(open(os.path.join(AQUI, "dados_encomendas.json"), encoding="utf-8"))
for k, v in {
    "__P600__": fonte("poppins600.ttf"), "__P700__": fonte("poppins700.ttf"), "__P800__": fonte("poppins800.ttf"),
    "__I_META__": ico("meta", 30), "__I_FALTA__": ico("rota", 30),
    "__I_RELOGIO__": ico("relogio", 30), "__I_PRAZO__": ico("prazo", 30),
    "__I_PASSO__": ico("passo-a-passo", 28), "__I_COLETA__": ico("coleta", 64),
    "__MEDALHAS__": json.dumps({n: ico("medalha", 30, p, a) for n, (p, a) in MEDALHA_PAR.items()}),
    "__DADOS__": json.dumps(DADOS, ensure_ascii=False),
}.items():
    HTML = HTML.replace(k, v)
open(os.path.join(AQUI, "AGF_resultado-encomendas.html"), "w", encoding="utf-8").write(HTML)
print("ok")
