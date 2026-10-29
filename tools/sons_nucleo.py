# Som do reflexo de dano do Núcleo de He-3: nosso, gerado aqui (Python puro, sem
# dependência) em public/sons/, com o mesmo sintetizador dos sons da volta à base
# (tools/sons_volta.py) e o timbre do AstroN original misturado (o estalo elétrico
# `volt` e o zumbido `extra2`, lidos de public/sons/). Pedido do Mateus (29/out/2026):
# som maduro, nada infantil, de acordo com a animação do reflexo; sem nota musical.
#
# Escrito em cima da linha do tempo de public/js/nucleo-regras.js (quadroReflexo):
#
# - 0 s, a cúpula solta o raio: o tranco grave do escudo (golpe caindo de 74 para 36 Hz)
#   com o estalo seco do disparo, e as chapas do escudo vibrando por baixo (parciais sem
#   relação harmônica, abafadas e curtas: lê como metal sob carga, não como sino);
# - de 0,03 a 0,12 s, o raio cruza o poço: um chiado curto que cai de tom (vai embora);
# - 0,12 s (REFLEXO_CHEGA_S), o raio chega na nave: o estalo elétrico do original mais
#   grave, um estalo de ruído e um baque médio;
# - depois, a cauda curta de espaço (o poço) e o zumbido do original morrendo.
#
# Toca a cada devolução (uma vez por segundo numa briga no Núcleo), então é curto (0,9 s)
# e sem nada agudo que canse.
#
# Saída: WAV PCM mono, 44 100 Hz, 16 bits, com pico em -1 dBFS (o jogo nivela pela
# categoria 'impacto', public/js/nivel-sons.js).
#
# Uso: python3 -I tools/sons_nucleo.py [pasta dos sons]   (padrão: public/sons ao lado)

import importlib.util, math, os, sys

sys.dont_write_bytecode = True  # importar o sons_volta.py não deixa __pycache__ em tools/
_spec = importlib.util.spec_from_file_location('sons_volta', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sons_volta.py'))
sv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sv)

TAXA = sv.TAXA
CHEGA = 0.12  # s: o raio chega na nave (REFLEXO_CHEGA_S de nucleo-regras.js)
DURACAO = 0.9
sv.PICO_DBFS['nucleo_reflexo'] = -1.0


def chapas(dst, inicio, volume):
    """As chapas do escudo vibrando: parciais inarmônicas, cada uma abafando no seu tempo."""
    for f, a, tau in ((143, 1.0, 0.16), (231, 0.7, 0.12), (377, 0.45, 0.09), (522, 0.3, 0.07), (797, 0.18, 0.05)):
        fase = 0.0
        det = 1.0 + 0.004 * math.sin(f)
        for i in range(int(inicio * TAXA), min(len(dst), int((inicio + 6 * tau) * TAXA))):
            t = i / TAXA - inicio
            fase += 2 * math.pi * f * det * (1 - 0.06 * min(1, t / 0.2)) / TAXA
            dst[i] += volume * a * min(1, t / 0.002) * math.exp(-t / tau) * math.sin(fase)


def reflexo(volt, extra2):
    s = [0.0] * int(DURACAO * TAXA)
    # O tranco da cúpula: golpe grave caindo, com um pouco do segundo harmônico.
    sv.varredura(s, 0, 0.55, lambda t: 36 + 38 * math.exp(-t / 0.06), 1.0, lambda t: min(1, t / 0.003) * math.exp(-t / 0.15), (1.0, 0.28))
    # O estalo seco do disparo.
    sv.ruido_filtrado(s, 0, 0.014, 23, 'passa_alta', lambda t: 1800, 0.7, 0.55, lambda t: (1 - t / 0.014) ** 2)
    # As chapas do escudo sob o tranco.
    chapas(s, 0.004, 0.16)
    # O raio cruzando o poço: chiado curto caindo de tom.
    sv.ruido_filtrado(s, 0.03, CHEGA + 0.005, 29, 'passa_faixa', lambda t: 3600 * 2 ** (-1.6 * sv.k01(t, 0.03, CHEGA)), 3.0, 0.32,
                      lambda t: math.sin(math.pi * sv.k01(t, 0.03, CHEGA + 0.005)) ** 1.5)
    # A chegada: o estalo elétrico do original mais grave, um estalo de ruído e o baque.
    sv.tocar_amostra(s, volt[0], volt[1], CHEGA, 0.5, tom=lambda t: 0.82, env=lambda t: (1 - sv.k01(t, CHEGA + 0.06, CHEGA + 0.2)) ** 2)
    sv.ruido_filtrado(s, CHEGA, CHEGA + 0.03, 31, 'passa_alta', lambda t: 1400, 0.7, 0.5, lambda t: (1 - (t - CHEGA) / 0.03) ** 2)
    sv.varredura(s, CHEGA, DURACAO, lambda t: 62 + 70 * math.exp(-(t - CHEGA) / 0.04), 0.5,
                 lambda t: min(1, (t - CHEGA) / 0.003) * math.exp(-(t - CHEGA) / 0.09), (1.0, 0.4, 0.12))
    # O zumbido do original por baixo, abafado, morrendo.
    zumbido = [0.0] * len(s)
    sv.tocar_amostra(zumbido, extra2[0], extra2[1], 0, 0.35, tom=lambda t: 0.7, env=lambda t: math.exp(-t / 0.18))
    filtro = sv.Biquad('passa_baixa', 0.8)
    filtro.ajustar(1100)
    for i in range(len(s)):
        s[i] += filtro(zumbido[i])
    return sv.suavizar_pontas(sv.reverberar(sv.suavizar_pontas(s), 0.2, 0.8), 0.001, 0.12)


def main():
    volt, extra2 = (sv.ler(n) for n in ('volt', 'extra2'))
    sv.gravar('nucleo_reflexo', reflexo(volt, extra2))


main()
