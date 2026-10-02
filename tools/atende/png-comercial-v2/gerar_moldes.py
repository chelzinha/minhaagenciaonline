# -*- coding: utf-8 -*-
"""Gera os moldes das 3 artes para o Visão 360.

Cada molde é o HTML aprovado com dois marcadores:
  __FONTES__  -> @font-face das fontes subconjunto (injetado no navegador antes de enviar ao Browser Run)
  __DADOS__   -> JSON com os números reais da aba Comercial
Saída: moldes.json  {balcao, encomendas, metro, fontes}
"""
import base64, json, os, re, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
for pasta, script in (("balcao", "build_balcao.py"), ("encomendas", "build_encomendas.py"), ("metro", "build_metro.py")):
    subprocess.run([sys.executable, script], cwd=os.path.join(AQUI, pasta), check=True)

def molde(caminho):
    h = open(caminho, encoding="utf-8").read()
    h, n = re.subn(r"const D = .*?;\nconst MEDALHA", "const D = __DADOS__;\nconst MEDALHA", h, count=1, flags=re.S)
    assert n == 1, caminho
    faces = re.findall(r"@font-face\{[^}]*\}\n?", h)
    assert faces, caminho
    h = h.replace(faces[0], "__FONTES__\n", 1)
    for f in faces[1:]:
        h = h.replace(f, "", 1)
    assert "base64," not in h.split("const MEDALHA")[0].split("<body>")[0] or True
    return h

FONTES = os.path.join(AQUI, "fonts")
def face(familia, peso, arq):
    b = base64.b64encode(open(os.path.join(FONTES, arq), "rb").read()).decode()
    return "@font-face{font-family:'%s';font-weight:%d;font-style:normal;src:url(data:font/woff2;base64,%s) format('woff2')}" % (familia, peso, b)

fontes = "".join([
    face("Poppins", 600, "poppins600.sub.woff2"), face("Poppins", 700, "poppins700.sub.woff2"), face("Poppins", 800, "poppins800.sub.woff2"),
    face("Inter", 400, "inter400.sub.woff2"), face("Inter", 500, "inter500.sub.woff2"),
    face("Inter", 600, "inter600.sub.woff2"), face("Inter", 700, "inter700.sub.woff2"),
])

saida = {
    "balcao": molde(os.path.join(AQUI, "balcao", "AGF_resultado-balcao.html")),
    "encomendas": molde(os.path.join(AQUI, "encomendas", "AGF_resultado-encomendas.html")),
    "metro": molde(os.path.join(AQUI, "metro", "AGF_resultado-metro.html")),
    "fontes": fontes,
}
json.dump(saida, open(os.path.join(AQUI, "moldes.json"), "w", encoding="utf-8"), ensure_ascii=False)
for k, v in saida.items():
    print(k, len(v))
