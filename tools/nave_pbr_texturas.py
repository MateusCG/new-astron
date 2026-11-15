"""Texturas PBR de uma nave do original, no MESMO layout de UV da textura dela.

De cada textura de cor do original (256 × 256 ou 128 × 128, dentro do glb) saem quatro
imagens no layout de UV do original. A cor e o relevo têm 4× o lado do original (1024
ou 512); a rugosidade e o emissivo, a metade disso (pesam na placa de vídeo e não
precisam do detalhe fino):

  <saida>_cor.webp       cor ampliada 4× (Lanczos + filtro de choque: a borda entre as
                         chapas volta a ser um degrau em vez de um borrão) com um grão fino
  <saida>_mr.webp        vermelho = oclusão das frestas, verde = rugosidade, azul = metal
                         (o occlusionRoughnessMetallic do glTF), por região da textura:
                         tinta, chapa nua, vidro da cabine, luzes e reentrâncias
  <saida>_normal.webp    relevo tirado das linhas da textura (frestas e grades afundam)
                         mais o micro-relevo da chapa; verde = +v da imagem (para baixo),
                         a base tangente que o three.js monta sem tangentes no glb
  <saida>_emissivo.webp  só o que acende: o vidro azul da cabine e as luzes verdes

Só Pillow, numpy e scipy, com semente fixa. A cor ampliada pode vir pronta de um
upscaler de IA (`--cor`, o PNG de tools/nave_pbr_cor_ia.py: bordas retas e limpas, é
o que as naves do protótipo usam); sem ela, vale a ampliação daqui, sem IA.

Uso: python3 -I tools/nave_pbr_texturas.py <nave.glb> <saida sem extensão> [--imagem k]
         [--semente n] [--tinta rugosidade,metal] [--cor ampliada.png] [--previa pasta]

`--imagem` é o índice da imagem no glb (0 se não vier).

`--tinta` troca a rugosidade e o metal da pintura do casco (o padrão é tinta sobre
chapa; a Ulysses, dourada, pede um casco mais metálico). `--semente` é a do grão (o
número da unidade no original).
"""
import io
import json
import struct
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as nd

TAMANHO = 1024
SEMENTE = 16  # padrão: a Cyclone Wing é a unidade 16 do original

# Rugosidade e metal por região (o que a máscara de cor separa).
REGIOES = {
    #            rugosidade, metal
    'tinta':    (0.48, 0.30),
    'chapa':    (0.36, 0.62),
    'vidro':    (0.10, 0.10),
    'luz':      (0.25, 0.00),
    'fundo':    (0.66, 0.25),
}


def textura_do_glb(caminho, imagem=0):
    """A imagem de cor `imagem` do glb, em float 0..1 (RGB)."""
    dados = open(caminho, 'rb').read()
    tam = struct.unpack_from('<I', dados, 12)[0]
    gltf = json.loads(dados[20:20 + tam])
    inicio = 20 + tam + 8
    vista = gltf['bufferViews'][gltf['images'][imagem]['bufferView']]
    png = dados[inicio + vista.get('byteOffset', 0):][:vista['byteLength']]
    return np.asarray(Image.open(io.BytesIO(png)).convert('RGB'), dtype=np.float32) / 255


def luminancia(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def borrar(a, sigma):
    """Gaussiana que dá a volta na borda (a textura repete)."""
    eixos = (sigma, sigma) + (0,) * (a.ndim - 2)
    return nd.gaussian_filter(a, eixos, mode='wrap')


def alisar(cor, passos=10, k=0.07):
    """Difusão de Perona e Malik: tira o grão da textura pequena sem borrar a borda das
    chapas (o grão volta depois, fino, no tamanho novo)."""
    a = cor.copy()
    for _ in range(passos):
        soma = np.zeros_like(a)
        for eixo, passo in ((0, 1), (0, -1), (1, 1), (1, -1)):
            d = np.roll(a, passo, eixo) - a
            g = np.exp(-(np.abs(d).max(-1, keepdims=True) / k) ** 2)
            soma += g * d
        a += 0.2 * soma
    return a


def ampliar(cor, fator):
    """Tira o grão, amplia com Lanczos e passa o filtro de choque morfológico: do lado
    claro de cada borda o pixel pega o vizinho mais claro, do lado escuro o mais escuro,
    então a transição borrada da ampliação volta a ser um degrau, sem inventar cor (nada
    sai da faixa dos vizinhos). No fim, um borrão de meio pixel tira o serrilhado."""
    h, w, _ = cor.shape
    base = alisar(cor)
    img = Image.fromarray((np.clip(base, 0, 1) * 255).round().astype(np.uint8)).resize((w * fator, h * fator), Image.LANCZOS)
    # O borrão de meio pixel do original desfaz o serrilhado das diagonais dele.
    liso = np.asarray(img, dtype=np.float32) / 255
    a = borrar(liso, fator * 0.4)
    cruz = nd.generate_binary_structure(2, 1)[..., None]
    for _ in range(fator + 2):
        lap = nd.laplace(borrar(luminancia(a), fator * 0.6), mode='wrap')
        t = (0.5 + 0.5 * np.tanh(lap * 900))[..., None]  # 1 = lado escuro da borda
        claro = nd.grey_dilation(a, footprint=cruz, mode='wrap')
        escuro = nd.grey_erosion(a, footprint=cruz, mode='wrap')
        a = escuro * t + claro * (1 - t)
    # Um terço da ampliação lisa de volta: segura a linha fina, que o choque engrossa.
    return borrar(a, 0.6) * 0.68 + liso * 0.32


def hsv(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    s = np.where(mx > 1e-5, d / np.maximum(mx, 1e-5), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dd = np.maximum(d, 1e-5)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) / 6
    return h, s, mx


def degrau(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mascaras(cor):
    """Peso 0..1 de cada região, somando 1 em cada pixel."""
    h, s, v = hsv(borrar(cor, 1.0))
    vidro = degrau(h, 0.50, 0.55) * (1 - degrau(h, 0.66, 0.70)) * degrau(s, 0.38, 0.55) * degrau(v, 0.30, 0.45)
    luz = degrau(h, 0.24, 0.29) * (1 - degrau(h, 0.42, 0.46)) * degrau(s, 0.50, 0.65) * degrau(v, 0.45, 0.6)
    fundo = (1 - degrau(v, 0.16, 0.30)) * (1 - vidro) * (1 - luz)
    chapa = (1 - degrau(s, 0.10, 0.20)) * degrau(v, 0.42, 0.55) * (1 - vidro) * (1 - luz) * (1 - fundo)
    tinta = np.clip(1 - vidro - luz - fundo - chapa, 0, 1)
    m = {'tinta': tinta, 'chapa': chapa, 'vidro': vidro, 'luz': luz, 'fundo': fundo}
    total = sum(m.values())
    return {k: (x / total).astype(np.float32) for k, x in m.items()}


def ruido(rng, forma, sigma_y, sigma_x):
    """Ruído de média 0 e desvio 1, esticado (riscos de escovado quando sigma_x >> sigma_y)."""
    r = nd.gaussian_filter(rng.standard_normal(forma).astype(np.float32), (sigma_y, sigma_x), mode='wrap')
    return r / r.std()


def salvar(a, caminho, qualidade=90, lado=None):
    img = Image.fromarray((np.clip(a, 0, 1) * 255).round().astype(np.uint8))
    if lado and lado != img.width:
        img = img.resize((lado, lado), Image.LANCZOS)
    img.save(caminho, quality=qualidade, method=6)


def main():
    opcao = lambda nome: next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == nome), None)
    entrada, saida = sys.argv[1], sys.argv[2]
    rng = np.random.default_rng(int(opcao('--semente') or SEMENTE))
    if opcao('--tinta'):
        REGIOES['tinta'] = tuple(float(v) for v in opcao('--tinta').split(','))
    original = textura_do_glb(entrada, int(opcao('--imagem') or 0))
    lado = original.shape[0] * 4  # a conta toda é feita em TAMANHO; os arquivos saem com 4× o original
    fator = TAMANHO // original.shape[0]
    if opcao('--cor'):
        cor = np.asarray(Image.open(opcao('--cor')).convert('RGB').resize((TAMANHO, TAMANHO), Image.LANCZOS), dtype=np.float32) / 255
    else:
        cor = ampliar(original, fator)
    forma = cor.shape[:2]
    m = mascaras(cor)
    lum = luminancia(cor)

    # Relevo: o que é linha escura e fina na textura (fresta, grade, rebaixo) afunda.
    faixa = borrar(lum, 1.2) - borrar(lum, 7)
    altura = np.clip(faixa * 6, -1, 0.6) * (1 - 0.7 * m['luz'])
    micro = ruido(rng, forma, 1.4, 1.4) * 0.006 + ruido(rng, forma, 0.9, 12) * 0.008  # grão + escovado
    altura = altura + micro * (m['tinta'] + m['chapa'] + 0.5 * m['fundo'])
    FORCA = 2.0
    dy = (np.roll(altura, -1, 0) - np.roll(altura, 1, 0)) * FORCA
    dx = (np.roll(altura, -1, 1) - np.roll(altura, 1, 1)) * FORCA
    n = np.dstack([-dx, -dy, np.ones(forma, np.float32)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)

    # Oclusão das frestas (o fundo da linha escura recebe menos luz do ambiente).
    oclusao = np.clip(1 + np.minimum(borrar(faixa, 2), 0) * 9, 0.45, 1)

    rug = sum(m[k] * REGIOES[k][0] for k in REGIOES)
    met = sum(m[k] * REGIOES[k][1] for k in REGIOES)
    manchas = ruido(rng, forma, 26, 26) * 0.05 + ruido(rng, forma, 1.2, 14) * 0.03 + ruido(rng, forma, 1.5, 1.5) * 0.012
    rug = np.clip(rug + manchas * (1 - m['vidro']) + (1 - oclusao) * 0.35, 0.05, 1)

    # Cor: um grão fino por cima da ampliação, para a chapa não ficar de plástico de perto.
    grao = ruido(rng, forma, 0.7, 0.7)[..., None] * 0.012 + ruido(rng, forma, 0.8, 10)[..., None] * 0.01
    cor_final = np.clip(cor + grao * (1 - m['vidro'] - m['luz'])[..., None], 0, 1)

    emissivo = cor * (m['vidro'] * 0.85 + m['luz'] * 1.0)[..., None]

    salvar(cor_final, saida + '_cor.webp', 92, lado)
    salvar(np.dstack([oclusao, rug, met]), saida + '_mr.webp', 90, lado // 2)
    salvar(n * 0.5 + 0.5, saida + '_normal.webp', 94, lado)
    salvar(emissivo, saida + '_emissivo.webp', 88, lado // 2)
    print(f'{saida}: emissivo {float((m["vidro"] + m["luz"]).mean()) * 100:.1f}% da textura')

    previa = opcao('--previa')
    if previa:
        Image.fromarray((original * 255).astype(np.uint8)).resize((TAMANHO, TAMANHO), Image.NEAREST).save(previa + '/antes.png')
        salvar(cor_final, previa + '/cor.png')
        salvar(np.dstack([m['vidro'] + m['chapa'], m['luz'] + m['chapa'], m['fundo'] + m['chapa'] * 0 + m['tinta'] * 0.3]), previa + '/mascaras.png')
        salvar(np.dstack([oclusao, rug, met]), previa + '/mr.png')
        salvar(n * 0.5 + 0.5, previa + '/normal.png')
        salvar(emissivo, previa + '/emissivo.png')


main()
