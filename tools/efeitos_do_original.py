"""Copia as texturas dos efeitos de tiro do AstroN original para public/texturas/efeitos/.

Uso:
  python3 -I tools/efeitos_do_original.py <old-astron> <saída>

  <old-astron> raiz do old-astron (lê reference/game_data/effects/*.eff, assets_obb/3dx,
               reference/game_data/mpal/*.mpl, reference/textures_png e o
               inititemweapon.cfg decodificado)
  <saída>      public/texturas/efeitos

Só insumo: o efeito no jogo é desenhado em public/js/efeitos.js. Aqui ficam as
texturas e a LISTA.md que diz qual efeito usa qual textura e a cor dominante.

Como o original liga arma → efeito → textura:
- Cada arma (inititemweapon.cfg) tem ids de efeito em cinco colunas: 50 = clarão do
  disparo (na boca da arma), 56 = projétil (o tiro em voo), 88 = impacto, 91 = efeito
  extra no alvo (paralisia, descarga...), 104 = efeito de área (armadilhas).
- O .eff é binário ("1FFE"); dentro dele há nomes: o de uma malha em assets_obb/3dx
  (a forma do efeito, com o material apontando a textura), o de um sistema de
  partículas .MPL (com os nomes das texturas das partículas) ou o de uma textura
  direto. Este script lê esses nomes e segue até os PNG.
- A cor dominante é a média das cores ponderada pelo brilho e pela opacidade, porque
  os efeitos do original são aditivos: o preto do fundo não aparece na tela.
"""
import os
import re
import shutil
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armas_do_original import ler_3dx  # noqa: E402

COLUNAS = {50: 'clarão do disparo', 56: 'projétil', 88: 'impacto', 91: 'efeito no alvo', 104: 'área'}
IGNORAR_NOMES = {'STAND', '1FFE', '1LPM'}
# Marcador invisível (preto) das naves-comando: não é textura de efeito.
IGNORAR_TEXTURAS = {'particle_dummy.png'}


def strings(dados, minimo=3):
    return [m.decode('latin-1') for m in re.findall(rb'[\x21-\x7e]{%d,}' % minimo, dados)]


def texturas_do_3dx(caminho):
    """Texturas dos materiais que algum objeto do .3dx usa de verdade (cenas antigas do
    3ds Max deixaram materiais de cockpit sobrando em alguns efeitos)."""
    try:
        mats, objs, _ = ler_3dx(open(caminho, 'rb').read())
    except (ValueError, EOFError):
        return []
    usados = sorted({o['mat'] for o in objs if o['verts'] and 0 <= o['mat'] < len(mats)})
    nomes = []
    for i in usados:
        m = mats[i]
        nomes += [m['tex']] + [s['tex'] for s in m['subs']]
    return [n for n in nomes if n]


class Resolvedor:
    def __init__(self, raiz):
        self.eff = os.path.join(raiz, 'reference/game_data/effects')
        self.mpl = os.path.join(raiz, 'reference/game_data/mpal')
        self.d3 = os.path.join(raiz, 'assets_obb/3dx')
        self.tex = os.path.join(raiz, 'reference/textures_png')
        self.pngs = {f[:-4].lower(): f for f in os.listdir(self.tex) if f.lower().endswith('.png')}
        self.malhas = {f[:-4].lower(): f for f in os.listdir(self.d3) if f.lower().endswith('.3dx')}
        self.mpls = {f[:-4].lower(): f for f in os.listdir(self.mpl) if f.lower().endswith('.mpl')}

    def textura(self, nome):
        n = nome.lower()
        if n.endswith(('.png', '.bmp', '.tga', '.pn8')):
            n = n[:-4]
        return self.pngs.get(n)

    def do_efeito(self, eid):
        """Lista de arquivos PNG usados pelo efeito `eid` (ordem de aparição, sem repetir)."""
        caminho = os.path.join(self.eff, f'{eid}.eff')
        if not os.path.exists(caminho):
            return []
        achadas = []

        def por(nome):
            if nome and nome.lower() not in IGNORAR_TEXTURAS and nome not in achadas:
                achadas.append(nome)

        for s in strings(open(caminho, 'rb').read()):
            if s in IGNORAR_NOMES or not re.fullmatch(r'[\w.\-]+', s) or s.startswith('?'):
                continue
            base = s.lower()
            if base.endswith('.mpl'):
                base = base[:-4]
                if base in self.mpls:
                    for t in strings(open(os.path.join(self.mpl, self.mpls[base]), 'rb').read()):
                        if t not in IGNORAR_NOMES:
                            por(self.textura(t))
                continue
            if base in self.malhas:
                for t in texturas_do_3dx(os.path.join(self.d3, self.malhas[base])):
                    por(self.textura(t))
            por(self.textura(base))
            # variações numeradas (quadros de animação): <id>_01.png, <id>_02.png...
            for k in sorted(self.pngs):
                if re.fullmatch(re.escape(base) + r'_\d+', k):
                    por(self.pngs[k])
        return achadas


def cor_dominante(caminho):
    im = Image.open(caminho).convert('RGBA')
    im.thumbnail((64, 64))
    soma = [0.0, 0.0, 0.0]
    peso_total = 0.0
    for r, g, b, a in im.getdata():
        peso = (max(r, g, b) / 255.0) ** 2 * (a / 255.0)
        soma[0] += r * peso
        soma[1] += g * peso
        soma[2] += b * peso
        peso_total += peso
    if peso_total == 0:
        return '#000000'
    m = [s / peso_total for s in soma]
    return '#' + ''.join(f'{int(round(c)):02x}' for c in m)


# Armas "(NPC)" dos monstros da jungle que vêm do original (SN-Zero VI e SN-3 do Stage
# M5; ARMAS_NPC_ORIGINAL em shared/armas-original.js): os efeitos delas também entram.
ARMAS_MONSTRO = {'510372', '510373', '511080', '511090'}


def armas_jogaveis(cfg):
    """[(id, nome, {coluna: id_efeito})] das armas de jogador (versão base) e das dos monstros."""
    linhas = []
    for linha in open(cfg, encoding='utf-8', errors='replace'):
        c = [x.strip() for x in linha.rstrip('\r\n').split('\t')]
        if len(c) < 105 or not re.fullmatch(r'\d{6}', c[0]):
            continue
        if c[0] not in ARMAS_MONSTRO and (c[0][3] != '0' or c[0][0] not in '123'):
            continue
        efeitos = {col: c[col] for col in COLUNAS if re.fullmatch(r'[12]\d{6}', c[col])}
        linhas.append((c[0], c[1], efeitos))
    return linhas


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    raiz, saida = sys.argv[1:]
    os.makedirs(saida, exist_ok=True)
    res = Resolvedor(raiz)
    cfg = os.path.join(raiz, 'reference/game_data_decoded/locale/en/cfg/inititemweapon.cfg')
    armas = armas_jogaveis(cfg)

    # efeito → (funções, armas)
    efeitos = {}
    for _, nome, cols in armas:
        for col, eid in cols.items():
            e = efeitos.setdefault(eid, {'funcoes': set(), 'armas': []})
            e['funcoes'].add(COLUNAS[col])
            if nome not in e['armas']:
                e['armas'].append(nome)

    copiadas = {}
    for eid in sorted(efeitos):
        texs = res.do_efeito(eid)
        efeitos[eid]['texturas'] = texs
        for t in texs:
            if t not in copiadas:
                destino = os.path.join(saida, t.lower())
                shutil.copyfile(os.path.join(res.tex, t), destino)
                with Image.open(destino) as im:
                    copiadas[t] = {'cor': cor_dominante(destino), 'px': im.size,
                                   'bytes': os.path.getsize(destino)}

    total = sum(v['bytes'] for v in copiadas.values())
    with open(os.path.join(saida, 'LISTA.md'), 'w') as f:
        f.write(
            '# Texturas dos efeitos de tiro do AstroN original\n\n'
            'Copiadas por `tools/efeitos_do_original.py` (de `old-astron/reference/textures_png`), só '
            f'as usadas pelos efeitos das armas de jogador e dos monstros da jungle (SN-3 e SN-Zero VI): {len(copiadas)} arquivos, {total / 1024:.0f} KB. '
            'São insumo para `public/js/efeitos.js` (frente Armas); nenhuma está ligada no jogo ainda.\n\n'
            'Os efeitos do original são **aditivos** (fundo preto = transparente): use `AdditiveBlending`, '
            'como o guia visual já pede para efeito de luz. A cor dominante é a média ponderada pelo brilho.\n\n'
            'Funções (coluna de `inititemweapon.cfg`): **clarão do disparo** (50, na boca da arma), '
            '**projétil** (56, o tiro em voo), **impacto** (88), **efeito no alvo** (91: paralisia, '
            'descarga, lentidão) e **área** (104: armadilhas). Efeito sem textura usa só malha com cor '
            'de material ou não achou textura no pacote.\n\n'
            '## Por efeito\n\n'
            '| Efeito | Função | Texturas | Cor dominante | Armas (versão base) |\n|---|---|---|---|---|\n')
        for eid in sorted(efeitos):
            e = efeitos[eid]
            mostrar = e['texturas'][:5]
            resto = len(e['texturas']) - len(mostrar)
            texs = ', '.join(f'`{t.lower()}`' for t in mostrar) + (f' (+{resto} quadros)' if resto else '') or '—'
            cores = ', '.join(list(dict.fromkeys(copiadas[t]['cor'] for t in e['texturas']))[:4]) or '—'
            armas_txt = '; '.join(e['armas'][:6]) + (f' (+{len(e["armas"]) - 6})' if len(e['armas']) > 6 else '')
            f.write(f"| `{eid}` | {', '.join(sorted(e['funcoes']))} | {texs} | {cores} | {armas_txt} |\n")
        f.write('\n## Por textura\n\n| Arquivo | Tamanho | Cor dominante |\n|---|---|---|\n')
        for t in sorted(copiadas, key=str.lower):
            v = copiadas[t]
            f.write(f"| `{t.lower()}` | {v['px'][0]}×{v['px'][1]} px, {v['bytes'] / 1024:.1f} KB | {v['cor']} |\n")
    print(f'{len(efeitos)} efeitos, {len(copiadas)} texturas, {total} bytes')


if __name__ == '__main__':
    main()
