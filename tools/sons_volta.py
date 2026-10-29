# Sons da volta à base (recall) e do teleporte até o companheiro: nossos, gerados aqui
# (Python puro, sem dependência) em public/sons/, misturando o timbre do AstroN original
# (o zumbido elétrico `extra2`, a carga `u_up`, o teletransporte `up2` e o estalo `volt`,
# lidos de public/sons/) com camadas sintetizadas. Pedido do Mateus (29/out/2026): o som
# tem que acompanhar a progressão da animação do recall, e o da chegada (recall e
# teleporte) tem que representar a chegada.
#
# Por isso os sons são escritos em cima da linha do tempo de public/js/volta-regras.js:
#
# - volta_canal (RECALL_S = 6 s, mais 0,4 s segurando o pico para a rede atrasar o
#   'chegou' sem buraco): o zumbido grave sobe uma oitava com o progresso e abre (mais
#   harmônicos), pulsa cada vez mais rápido (o círculo de runas girando), o zumbido do
#   original sobe junto, e na carga final (CARGA_FINAL, a partir de 5,1 s) entra o
#   riser: ruído num filtro que sobe e o tom que dispara. Começa com a carga do original.
#   Sem as faíscas (grãos agudos) por baixo: o tilintado contínuo não combinava com a
#   carga (pedido do Mateus, 29/out/2026).
#   O jogo toca a partir do ponto do progresso (quem aparece no meio da carga ouve dali).
# - volta_cancela (0,5 s): a carga desligando, o tom caindo como fita parando.
# - volta_partida (0,9 s): a descarga onde a nave estava: estalo, o golpe grave caindo, o
#   sopro subindo ao céu (ruído num filtro que sobe), o teletransporte do original mais
#   agudo e as faíscas indo embora.
# - volta_chegada (1,4 s): o raio descendo (sopro e assobio caindo até o impacto em
#   0,125 s, quando o feixe toca a nave), o impacto (golpe grave, estalo e o estalo
#   elétrico do original) e a nave se materializando: um arpejo de três notas subindo
#   (mi, si, mi) com as faíscas e uma cauda de espaço (reverberação).
#
# Saída: WAV PCM mono, 44 100 Hz, 16 bits, com pico em PICO_DBFS.
#
# Uso: python3 -I tools/sons_volta.py [pasta dos sons]   (padrão: public/sons ao lado)

import math, os, random, struct, sys, wave

TAXA = 44100
RECALL_S = 6.0
CARGA_FINAL = 0.85
SEGURA_S = 0.4
PICO_DBFS = {'volta_canal': -3.0, 'volta_cancela': -4.0, 'volta_partida': -1.0, 'volta_chegada': -1.0}

PASTA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'sons')


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def k01(t, a, b):
    return clamp((t - a) / (b - a))


def ler(nome):
    """Amostras de -1 a 1 e a taxa de um WAV do original (mono ou estéreo, 8 ou 16 bits)."""
    with wave.open(os.path.join(PASTA, nome + '.wav')) as w:
        n, ch, sw, taxa = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        bruto = w.readframes(n)
    if sw == 2:
        a = struct.unpack('<%dh' % (n * ch), bruto)
        a = [x / 32768 for x in a]
    else:
        a = [(b - 128) / 128 for b in bruto]
    return [sum(a[i * ch:(i + 1) * ch]) / ch for i in range(n)], taxa


def gravar(nome, s):
    pico = max(1e-9, max(abs(x) for x in s))
    alvo = 10 ** (PICO_DBFS[nome] / 20)
    g = alvo / pico
    dados = struct.pack('<%dh' % len(s), *(int(round(clamp(x * g, -1, 1) * 32767)) for x in s))
    with wave.open(os.path.join(PASTA, nome + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes(dados)
    rms = math.sqrt(sum((x * g) ** 2 for x in s) / len(s))
    print(f'{nome}: {len(s) / TAXA:.2f} s, rms {20 * math.log10(rms):.1f} dBFS')


def tocar_amostra(dst, src, taxa_src, inicio, volume, tom=lambda t: 1.0, laco=None, fim=None, env=lambda t: 1.0, cruza=0.15):
    """Soma `src` em `dst` a partir de `inicio` (s), com o tom (velocidade) variando no
    tempo, laço opcional (de, até em s da fonte) até `fim` (s), e o envelope `env`. No
    laço, os últimos `cruza` s antes do fim se misturam com o trecho antes do começo (a
    emenda não estala)."""
    pos = 0.0
    passo_base = taxa_src / TAXA
    i0 = int(inicio * TAXA)
    i1 = len(dst) if fim is None else min(len(dst), int(fim * TAXA))
    n_src = len(src)
    ler = lambda p: src[int(p)] * (1 - (p - int(p))) + src[min(n_src - 1, int(p) + 1)] * (p - int(p))
    if laco:
        la, lb = laco[0] * taxa_src, laco[1] * taxa_src
        xf = cruza * taxa_src
    for i in range(i0, i1):
        t = i / TAXA
        if laco and pos >= lb:
            pos = la + (pos - lb)
        if int(pos) + 1 >= n_src:
            break
        v = ler(pos)
        if laco and pos > lb - xf:
            w = (pos - (lb - xf)) / xf
            v = v * (1 - w) + ler(pos - (lb - la)) * w
        dst[i] += volume * env(t) * v
        pos += passo_base * tom(t)


class Biquad:
    """Filtro de 2 polos (RBJ) com o corte mudando ao longo do tempo."""

    def __init__(self, tipo, q=0.7):
        self.tipo, self.q = tipo, q
        self.x1 = self.x2 = self.y1 = self.y2 = 0.0
        self.c = (1, 0, 0, 0, 0)

    def ajustar(self, fc):
        fc = clamp(fc, 20, TAXA * 0.45)
        w = 2 * math.pi * fc / TAXA
        cw, sw = math.cos(w), math.sin(w)
        al = sw / (2 * self.q)
        if self.tipo == 'passa_baixa':
            b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
        elif self.tipo == 'passa_alta':
            b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
        else:  # passa-faixa (ganho de pico 1)
            b0, b1, b2 = al, 0, -al
        a0, a1, a2 = 1 + al, -2 * cw, 1 - al
        self.c = (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)

    def __call__(self, x):
        b0, b1, b2, a1, a2 = self.c
        y = b0 * x + b1 * self.x1 + b2 * self.x2 - a1 * self.y1 - a2 * self.y2
        self.x2, self.x1, self.y2, self.y1 = self.x1, x, self.y1, y
        return y


def ruido_filtrado(dst, inicio, fim, semente, tipo, corte, q, volume, env):
    """Ruído branco num filtro com o corte `corte(t)` (Hz), somado em `dst`."""
    rng = random.Random(semente)
    f = Biquad(tipo, q)
    for i in range(int(inicio * TAXA), min(len(dst), int(fim * TAXA))):
        t = i / TAXA
        if i % 32 == 0:
            f.ajustar(corte(t))
        dst[i] += volume * env(t) * f(rng.uniform(-1, 1))


def varredura(dst, inicio, fim, freq, volume, env, harmonicos=(1.0,)):
    """Oscilador com a frequência `freq(t)` (Hz) e harmônicos de amplitude dada."""
    fase = 0.0
    for i in range(int(inicio * TAXA), min(len(dst), int(fim * TAXA))):
        t = i / TAXA
        fase += 2 * math.pi * freq(t) / TAXA
        v = sum(a * math.sin((n + 1) * fase) for n, a in enumerate(harmonicos))
        dst[i] += volume * env(t) * v


def faiscas(dst, inicio, fim, semente, densidade, volume, agudo=1.0):
    """Grãos curtos e agudos (as partículas): `densidade(t)` por segundo."""
    rng = random.Random(semente)
    t = inicio
    while t < fim:
        d = max(0.5, densidade(t))
        t += rng.expovariate(d)
        if t >= fim:
            break
        f = rng.uniform(2200, 6000) * agudo
        dur = rng.uniform(0.04, 0.11)
        a = volume * rng.uniform(0.5, 1.0)
        i0 = int(t * TAXA)
        for i in range(i0, min(len(dst), i0 + int(dur * TAXA))):
            u = (i - i0) / TAXA
            dst[i] += a * math.sin(2 * math.pi * f * u) * min(1, u / 0.003) * math.exp(-u / (dur * 0.35))


def reverberar(s, molhado=0.25, tamanho=1.0):
    """Reverberação de Schroeder (4 pentes em paralelo e 2 passa-tudo): a cauda de espaço."""
    pentes = [int(x * tamanho * TAXA / 44100) for x in (1557, 1617, 1491, 1422)]
    ganho = 0.8
    saida = [0.0] * len(s)
    for d in pentes:
        buf = [0.0] * d
        j = 0
        filtro = 0.0
        for i, x in enumerate(s):
            y = buf[j]
            filtro = y * 0.6 + filtro * 0.4  # amortece os agudos da cauda
            buf[j] = x + filtro * ganho
            j = (j + 1) % d
            saida[i] += y / len(pentes)
    for d in (225, 556):
        buf = [0.0] * d
        j = 0
        for i, x in enumerate(saida):
            b = buf[j]
            y = -0.5 * x + b
            buf[j] = x + 0.5 * y
            j = (j + 1) % d
            saida[i] = y
    return [x * (1 - molhado) + y * molhado for x, y in zip(s, saida)]


def suavizar_pontas(s, entra=0.005, sai=0.03):
    n1, n2 = int(entra * TAXA), int(sai * TAXA)
    for i in range(min(n1, len(s))):
        s[i] *= i / n1
    for i in range(min(n2, len(s))):
        s[len(s) - 1 - i] *= i / n2
    return s


def canal(extra2, u_up):
    dur = RECALL_S + SEGURA_S
    s = [0.0] * int(dur * TAXA)
    kk = lambda t: clamp(t / RECALL_S)
    final = lambda t: k01(kk(t), CARGA_FINAL, 1)
    # O zumbido grave: sobe uma oitava com a carga e mais meia na carga final, abrindo
    # harmônicos; pulsa cada vez mais rápido (o círculo girando).
    fase = [0.0, 0.0]
    fase_pulso = 0.0
    for i in range(len(s)):
        t = i / TAXA
        k, fi = kk(t), final(t)
        f = 98 * 2 ** (k ** 1.4 + 0.6 * fi)
        brilho = 0.3 + 0.45 * k + 0.2 * fi
        fase_pulso += 2 * math.pi * (1.5 + 7 * k ** 1.3 + 9 * fi) / TAXA
        prof = 0.15 + 0.3 * k
        am = 1 - prof * (0.5 + 0.5 * math.cos(fase_pulso))
        v = 0.0
        for c, det in enumerate((1.0, 1.007)):
            fase[c] += 2 * math.pi * f * det / TAXA
            v += sum((brilho ** n) / (n + 1) * math.sin((n + 1) * fase[c]) for n in range(7))
        s[i] += 0.16 * (0.35 + 0.45 * k + 0.25 * fi) * am * v
    # O zumbido elétrico do original em laço, subindo junto, num filtro que abre.
    zumbido = [0.0] * len(s)
    tocar_amostra(zumbido, extra2[0], extra2[1], 0, 0.5, tom=lambda t: 0.75 + 0.55 * kk(t) + 0.4 * final(t), laco=(0.3, 1.4),
                  env=lambda t: 0.4 + 0.5 * kk(t))
    filtro = Biquad('passa_baixa', 0.9)
    for i in range(len(s)):
        if i % 32 == 0:
            filtro.ajustar(900 * 2 ** (2.6 * kk(i / TAXA)))
        s[i] += filtro(zumbido[i])
    # A carga do original abrindo (fica forte mesmo com o crescendo baixo no começo).
    tocar_amostra(s, u_up[0], u_up[1], 0, 1.4)
    # A carga final: o riser (ruído num filtro que sobe) e um sopro grave crescendo.
    ruido_filtrado(s, 4.9, dur, 11, 'passa_faixa', lambda t: 500 * 2 ** (3.8 * k01(t, 4.9, RECALL_S)), 3.5, 0.9,
                   lambda t: k01(t, 4.9, RECALL_S) ** 2)
    # O crescendo: a carga toda vai de baixo até o pico, que segura no fim.
    for i in range(len(s)):
        t = i / TAXA
        s[i] *= min(1, t / 0.12) * (0.32 + 0.68 * kk(t) ** 1.4)
    return suavizar_pontas(s)


def cancela(extra2):
    dur = 0.5
    s = [0.0] * int(dur * TAXA)
    fase = 0.0
    for i in range(len(s)):
        t = i / TAXA
        k = t / dur
        f = 220 * 2 ** (-2.3 * k ** 0.7)  # a fita parando
        fase += 2 * math.pi * f / TAXA
        brilho = 0.6 * (1 - k) + 0.1
        v = sum((brilho ** n) / (n + 1) * math.sin((n + 1) * fase) for n in range(6))
        s[i] += 0.5 * v * (1 - k) ** 1.5
    tocar_amostra(s, extra2[0], extra2[1], 0, 0.6, tom=lambda t: 1.3 * 2 ** (-2.2 * t / dur), laco=(0.3, 1.4), env=lambda t: (1 - t / dur) ** 2)
    ruido_filtrado(s, 0, 0.25, 3, 'passa_alta', lambda t: 3000, 0.7, 0.25, lambda t: (1 - t / 0.25) ** 3)
    return suavizar_pontas(s, 0.004)


def partida(up2):
    dur = 0.9
    s = [0.0] * int(dur * TAXA)
    # O estalo da descarga.
    ruido_filtrado(s, 0, 0.012, 5, 'passa_alta', lambda t: 1500, 0.7, 0.9, lambda t: 1 - t / 0.012)
    # O golpe grave caindo.
    varredura(s, 0, 0.6, lambda t: 38 + 102 * math.exp(-t / 0.08), 0.95, lambda t: min(1, t / 0.004) * math.exp(-t / 0.17), (1.0, 0.3))
    # O sopro subindo ao céu com o feixe.
    ruido_filtrado(s, 0, 0.65, 9, 'passa_faixa', lambda t: 400 * 2 ** (4.3 * k01(t, 0, 0.42) ** 0.8), 2.2, 1.1,
                   lambda t: min(1, t / 0.03) * (1 - k01(t, 0.12, 0.6)) ** 2)
    # O teletransporte do original, mais agudo e rápido.
    tocar_amostra(s, up2[0], up2[1], 0, 0.45, tom=lambda t: 1.25, env=lambda t: 1 - k01(t, 0.4, 0.66))
    # As faíscas indo embora.
    faiscas(s, 0.02, 0.75, 13, lambda t: 90 * (1 - t / 0.75) ** 2, 0.08, 1.15)
    return suavizar_pontas(reverberar(suavizar_pontas(s), 0.22, 0.9), 0.001, 0.08)


def chegada(volt):
    dur = 1.4
    s = [0.0] * int(dur * TAXA)
    impacto = 0.125
    # O raio descendo: sopro e assobio caindo, crescendo até o impacto.
    ruido_filtrado(s, 0, impacto + 0.01, 17, 'passa_faixa', lambda t: 7500 * 2 ** (-3.8 * k01(t, 0, impacto)), 2.5, 0.9,
                   lambda t: 0.15 + 0.85 * k01(t, 0, impacto) ** 1.5)
    varredura(s, 0, impacto + 0.008, lambda t: 2600 * 2 ** (-3.0 * k01(t, 0, impacto)), 0.22, lambda t: min(1, t / 0.02) * (0.3 + 0.7 * k01(t, 0, impacto)),
              (1.0, 0.25))
    # O impacto: golpe grave, estalo e o estalo elétrico do original.
    varredura(s, impacto, dur, lambda t: 34 + 70 * math.exp(-(t - impacto) / 0.07), 1.0,
              lambda t: min(1, (t - impacto) / 0.003) * math.exp(-(t - impacto) / 0.2), (1.0, 0.35, 0.1))
    ruido_filtrado(s, impacto, impacto + 0.05, 19, 'passa_alta', lambda t: 2200, 0.7, 0.8, lambda t: (1 - (t - impacto) / 0.05) ** 2)
    tocar_amostra(s, volt[0], volt[1], impacto, 0.4)
    # A materialização: arpejo subindo (mi, si, mi) com vibrato leve, e as faíscas.
    for n, (f0, t0) in enumerate(((659.3, 0.14), (987.8, 0.2), (1318.5, 0.26))):
        varredura(s, t0, dur, lambda t, f0=f0, t0=t0: f0 * (1 + 0.004 * math.sin(2 * math.pi * 5.5 * (t - t0))), 0.17 - 0.03 * n,
                  lambda t, t0=t0: min(1, (t - t0) / 0.008) * math.exp(-(t - t0) / 0.42), (1.0, 0.18, 0.06))
    faiscas(s, 0.13, 0.95, 23, lambda t: 70 * (1 - k01(t, 0.13, 0.95)) ** 1.5, 0.07, 1.2)
    return suavizar_pontas(reverberar(suavizar_pontas(s), 0.3, 1.1), 0.001, 0.12)


def main():
    extra2, u_up, up2, volt = (ler(n) for n in ('extra2', 'u_up', 'up2', 'volt'))
    gravar('volta_canal', canal(extra2, u_up))
    gravar('volta_cancela', cancela(extra2))
    gravar('volta_partida', partida(up2))
    gravar('volta_chegada', chegada(volt))


main()
