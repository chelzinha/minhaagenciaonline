# -*- coding: utf-8 -*-
"""Monta apps-script/atende/DashboardCommercialPngV2.html a partir de moldes.json + v2_logica.js."""
import json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(AQUI, "..", "..", ".."))
m = json.load(open(os.path.join(AQUI, "moldes.json"), encoding="utf-8"))
j = json.dumps(m, ensure_ascii=True).replace("</", "<\\/")
js = open(os.path.join(AQUI, "v2_logica.js"), encoding="utf-8").read().replace("__MOLDES__", j)
assert "</script" not in js.lower()
destino = os.path.join(REPO, "apps-script", "atende", "DashboardCommercialPngV2.html")
open(destino, "w", encoding="utf-8").write('<script id="atende-commercial-png-v2">\n' + js + "</script>\n")
print("gerado", destino, len(js))
