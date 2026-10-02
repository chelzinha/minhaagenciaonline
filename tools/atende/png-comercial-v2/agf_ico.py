# -*- coding: utf-8 -*-
"""Arte quadrada 1080x1080: Balcão AGF - resultado do mês. Visual do método de artes AGF."""
import json, base64, os


TINTA = {"marinho": "#00416b", "azul": "#0078D4", "roxo": "#7648b6", "turquesa": "#0D9488",
         "coral": "#EA580C", "ouro": "#f2a900", "verde": "#16A34A"}

# biblioteca AGF v1.1 (icones_build.py), mesmos desenhos e pares
ICONES = {
 "atendente": (("roxo", "turquesa"), """
<path d="M4.4 14.2v-2.4a7.6 7.6 0 0 1 15.2 0v2.4" stroke="{P}"/>
<path d="M4.4 12.8h1.4a1.4 1.4 0 0 1 1.4 1.4v2.6a1.4 1.4 0 0 1-1.4 1.4H4.4a1.4 1.4 0 0 1-1.4-1.4v-2.6a1.4 1.4 0 0 1 1.4-1.4Z" stroke="{A}"/>
<path d="M19.6 12.8H18.2a1.4 1.4 0 0 0-1.4 1.4v2.6a1.4 1.4 0 0 0 1.4 1.4h1.4a1.4 1.4 0 0 0 1.4-1.4v-2.6a1.4 1.4 0 0 0-1.4-1.4Z" stroke="{A}"/>
<path d="M19.6 18.2v.8a2 2 0 0 1-2 2h-2.4" stroke="{P}"/>"""),
 "meta": (("coral", "ouro"), """
<circle cx="12" cy="12" r="9.2" stroke="{P}"/>
<circle cx="12" cy="12" r="5.2" stroke="{P}"/>
<circle cx="12" cy="12" r="1.4" stroke="{A}"/>"""),
 "grafico-linha": (("azul", "coral"), """
<path d="M3.6 3.4v15.4a1.6 1.6 0 0 0 1.6 1.6h15.4" stroke="{P}"/>
<path d="m7 15.4 3.8-4.4 3 2.6 5.2-6" stroke="{A}"/>
<circle cx="10.8" cy="11" r="1.1" stroke="{A}"/>"""),
 "rota": (("marinho", "turquesa"), """
<path d="M4.6 18.4c4.6 0 4.4-5.6 8.8-5.6 2.2 0 3.4 1.2 4.6 2.4" stroke="{P}"/>
<circle cx="4.6" cy="18.4" r="2.3" stroke="{P}"/>
<circle cx="11.6" cy="13.2" r="1.7" stroke="{P}"/>
<path d="M21 8.4c0 3.2-3 5.8-3 5.8s-3-2.6-3-5.8a3 3 0 1 1 6 0Z" stroke="{A}"/>
<circle cx="18" cy="8.4" r="1.1" stroke="{A}"/>"""),
 "relogio": (("coral", "marinho"), """
<circle cx="12" cy="12" r="9.2" stroke="{P}"/>
<path d="M12 6.6V12l3.8 2.2" stroke="{A}"/>"""),
 "prazo": (("roxo", "coral"), """
<path d="M6.6 2.8h10.8M6.6 21.2h10.8" stroke="{P}"/>
<path d="M16.8 2.8v3.8L12 12l4.8 5.4v3.8" stroke="{P}"/>
<path d="M7.2 2.8v3.8L12 12l-4.8 5.4v3.8" stroke="{P}"/>
<path d="M9.6 18.6h4.8" stroke="{A}"/>"""),
 "relatorio": (("marinho", "azul"), """
<path d="M4.6 2.9h11.2l3.6 3.6v12.4a2 2 0 0 1-2 2H4.6a2 2 0 0 1-2-2V4.9a2 2 0 0 1 2-2Z" stroke="{P}"/>
<path d="M15.4 2.9v3.9h3.9" stroke="{P}"/>
<path d="M7 16.6v-3M10.6 16.6v-5.6M14.2 16.6v-2" stroke="{A}"/>"""),
 "passo-a-passo": (("roxo", "coral"), """
<circle cx="4.6" cy="12" r="2.5" stroke="{P}"/>
<circle cx="12" cy="12" r="2.5" stroke="{P}"/>
<circle cx="19.4" cy="12" r="2.5" stroke="{A}"/>
<path d="M7.1 12h2.4M14.5 12h2.4" stroke="{P}"/>
<path d="M4.6 6.4V3.2M12 6.4V3.2M19.4 6.4V3.2" stroke="{A}"/>"""),
 "avaliacao": (("roxo", "coral"), """
<path d="m12 3.4 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9z" stroke="{P}"/>
<path d="M20.4 3v2.4M19.2 4.2h2.4" stroke="{A}"/>"""),
}

def ico(slug, tam, p=None, a=None):
    (np_, na), desenho = ICONES[slug]
    cp, ca = p or TINTA[np_], a or TINTA[na]
    corpo = desenho.strip().replace("{P}", cp).replace("{A}", ca)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{tam}" height="{tam}" viewBox="0 0 24 24" '
            f'fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">{corpo}</svg>')


ICONES["coleta"] = (("turquesa", "coral"), """
<path d="M2.6 6.6a1 1 0 0 1 1-1h9.2a1 1 0 0 1 1 1v9.8H2.6z" stroke="{P}"/>
<path d="M13.8 9.6h3.3a1.4 1.4 0 0 1 1.12.56l2.5 3.34a1.4 1.4 0 0 1 .28.84v2.06h-7.2" stroke="{P}"/>
<circle cx="7" cy="18.4" r="2.2" stroke="{A}"/>
<circle cx="17.6" cy="18.4" r="2.2" stroke="{A}"/>""")
ICONES["encomenda"] = (("marinho", "coral"), """
<path d="M12 2.9 20.4 7.5v9L12 21.1 3.6 16.5v-9z" stroke="{P}"/>
<path d="M3.6 7.5 12 12.1l8.4-4.6M12 12.1v9" stroke="{P}"/>
<path d="m7.8 5.2 8.4 4.6" stroke="{A}"/>""")

# medalha: fita em V (acento) + disco com estrela (principal). Desenho novo, parametros da biblioteca v1.1
ICONES["medalha"] = (("ouro", "marinho"), """
<path d="M6.4 2.6h3.5l2.1 4.3 2.1-4.3h3.5l-3.3 6.1M6.4 2.6l3.3 6.1" stroke="{A}"/>
<circle cx="12" cy="14.9" r="6.3" stroke="{P}"/>
<path d="M12.00 11.80L12.79 13.81L14.95 13.94L13.28 15.32L13.82 17.41L12.00 16.25L10.18 17.41L10.72 15.32L9.05 13.94L11.21 13.81Z" stroke="{P}"/>""")
MEDALHA_PAR = {"Bronze": ("#9A5B2E", "#00416b"), "Prata": ("#5F6B7A", "#00416b"), "Ouro": ("#f2a900", "#00416b")}
