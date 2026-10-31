"""Converte efeitos visuais do AstroN original (.eff + .3dx + .MPL) para o cliente tocar.

Uso:
  python3 -I tools/efeitos3d_do_original.py <old-astron> <public/modelos/efeitos> <public/texturas/efeitos> <id> [<id>...]
  python3 -I tools/efeitos3d_do_original.py --malha <old-astron> <saída> <texturas> <modelo> [...]
      (malha solta, só o .3dx: os destroços ex_particl01 a 04 da unidade destruída)
  python3 -I tools/efeitos3d_do_original.py --rastro <old-astron> <saída> <texturas> <modelo> [...]
      (rastro de míssil, a malha com pele da coluna 58: 2343101; veja converter_rastro)

  <old-astron>  raiz do old-astron (lê assets_obb/effect, assets_obb/3dx, assets_obb/mpal
                e reference/textures_png)
  saída         <id>.json por efeito; as texturas que faltam são copiadas para a pasta
                de texturas dos efeitos (o mesmo PNG do original, nome em minúsculas)

Como o original desenha um efeito (CEffectSprite::DrawFrame, EFFECT_DATA::ReLoad,
decompilados do libgame_arm64.so): o .eff tem um cabeçalho de 0x80 bytes ("1FFE",
quadros, peças, movimentos e os nomes do efeito, do modelo .3dx e da paleta .MPL), os
movimentos (0x80 cada: o nome "STAND"... e, em +0x20, o primeiro e o último quadro e
quantos), um registro de 0x40 por quadro e, por
quadro e por peça, um bloco de 196 bytes:
- u16 quadro do .3dx: a matriz da peça naquele quadro (CDummy::SetFrame);
- u16 material da paleta .MPL (a textura daquele quadro: a chama troca de textura);
- 16 floats: matriz local (só com a flag 2);
- D3DMATERIAL9 (17 floats): difusa RGBA (a alfa faz o efeito aparecer e sumir), ambiente,
  especular, emissiva e potência (vale com a flag 4);
- u8 flags: 1 material da paleta, 2 matriz local, 4 material próprio (cor e alfa do
  bloco), 8 virado para a câmera, 16 escondido, 32 rolar a textura (u, v nos floats
  seguintes).
O efeito anda um quadro por atualização (CEffectSprite::NextFrame), a 24 por segundo.

A saída guarda o .3dx cru (espaço do original: Z para cima, frente +x, vetor-linha
p' = p·M) e o cliente (public/js/efeitos-original.js) faz a troca de eixos e a escala.
Peça "virada para a câmera": a rotação vem da câmera, com x = cima da tela e y =
direita (o original troca as duas primeiras linhas da matriz da câmera), por isso as
faíscas do Magma, que andam no x, sobem.

Formato de <id>.json:
  { id, quadros, pecas: [{ nome, tex, pos, uv, idx, m, q }], mpal: [nome], opacas: [nome], blocos, volta? }
  volta: o quadro de onde o efeito repete quando a corrente do .eff fecha no meio (veja
  ordem_dos_quadros); sem ela, repete do começo.
  pos/uv/idx: malha da peça (flat); m: matriz base (16); q: matrizes por quadro do .3dx
  (lista de 16, pode ser vazia); blocos[quadro][peça] = [quadro3dx, material, flags,
  r, g, b, a, du, dv].
opacas: as texturas sem alfa (o casco do míssil, o símbolo dos ícones de estado): o
original só manda para o CAlphaManage (aditivo, SRCALPHA + ONE, sem escrever
profundidade) a peça com textura de alfa; a outra é sólida.
Modelo "particle_dummy" (o projétil do original é um sistema de partículas): usa o
.3dx de mesmo nome do efeito, com as peças viradas para a câmera, girando pelos
quadros do .3dx (sem ele, as variantes <id>_01, _02... como peças), e o json leva `particula: true` (o cliente solta o rastro de
partículas com a textura dele, a nuvem que liga o monstro ao alvo no vídeo).
"""
import json
import os
import re
import shutil
import struct
import sys

from PIL import Image

sys.dont_write_bytecode = True  # importar o vizinho não deixa __pycache__ em tools/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monstros_do_original import ler_3dx  # noqa: E402


def ler_eff(d):
    _, nf, no, na = struct.unpack_from('<4s3H', d, 0)
    nome = lambda o: d[o:o + 32].split(b'\0', 1)[0].decode('latin-1')
    ini = 0x80 + na * 0x80 + nf * 0x40  # cabeçalho, movimentos de 0x80 e um registro por quadro
    blocos = []
    for q in range(nf):
        linha = []
        for p in range(no):
            o = ini + (q * no + p) * 196
            fr, mat = struct.unpack_from('<2H', d, o)
            dif = struct.unpack_from('<4f', d, o + 68)
            fl = d[o + 136]
            du, dv = struct.unpack_from('<2f', d, o + 140)
            linha.append([fr, mat, fl, *[round(x, 3) for x in dif], round(du, 4), round(dv, 4)])
        blocos.append(linha)
    ordem, volta = ordem_dos_quadros(d, nf, na)
    return {'nf': nf, 'no': no, 'modelo': nome(0x30), 'mpal': nome(0x50), 'blocos': blocos, 'ordem': ordem, 'volta': volta}


def ordem_dos_quadros(d, nf, na):
    """A ordem em que o original toca os quadros do primeiro movimento e de onde repete.

    CEffectSprite::NextFrame anda pelos registros de 0x40 bytes de cada quadro: u16 +2 =
    quantos passos o quadro dura, +4 = o quadro seguinte (vale com a flag 1 do byte +8),
    +6 = o anterior (flag 2), flag 4 = vai e volta. O movimento começa no quadro de
    +0x22 do seu registro e um quadro sem a flag 1 (e sem a 4) encerra o efeito. A
    corrente nem sempre segue a numeração: no lvup001 o quadro 71 vem entre o 60 e o 61
    (e os que ficam fora da corrente não tocam). Devolve (ordem, volta): (None, 0) se o
    efeito repete do começo (a corrente fecha no primeiro) ou vai e volta (o json guarda
    os quadros na ordem do arquivo); (ordem, n) quando a corrente fecha num quadro do
    meio: toca a entrada uma vez e repete dali (a Armadilha Supressora abre as garras e
    fica pulsando do quadro 20 ao 39; os ícones de estado entram e giram).
    """
    if na < 1:
        return None, 0
    q = struct.unpack_from('<H', d, 0x80 + 0x22)[0]
    ini = 0x80 + na * 0x80
    ordem = [q]
    while True:
        fl = d[ini + q * 0x40 + 8]
        if fl & 4:
            return None, 0
        if not fl & 1:
            return ordem, 0
        q = struct.unpack_from('<H', d, ini + q * 0x40 + 4)[0]
        if q >= nf:
            return None, 0
        if q in ordem:
            volta = ordem.index(q)
            return (ordem, volta) if volta > 0 else (None, 0)
        ordem.append(q)


def ler_mpal(d):
    n, tam = struct.unpack_from('<2I', d, 4)
    return [d[0x20 + i * tam:0x20 + i * tam + 32].split(b'\0', 1)[0].decode('latin-1').lower() for i in range(n)]


def r4(x):
    return round(x, 4)


def converter(old, saida, pasta_tex, eid):
    base = os.path.join(old, 'assets_obb')
    e = ler_eff(open(os.path.join(base, 'effect', eid + '.eff'), 'rb').read())
    modelo = e['modelo'].lower()
    particula = modelo == 'particle_dummy'
    if particula:
        modelo = eid
    # A partícula de várias variantes (1322064_01, _02: o original sorteia uma por
    # partícula) junta as variantes, uma peça cada.
    modelos = [modelo]
    if particula and not os.path.exists(os.path.join(base, '3dx', modelo + '.3dx')):
        modelos = sorted(f[:-4] for f in os.listdir(os.path.join(base, '3dx')) if re.fullmatch(re.escape(eid) + r'_\d+\.3dx', f))
    mats, objs = [], []
    for mod in modelos:
        m, o = ler_3dx(open(os.path.join(base, '3dx', mod + '.3dx'), 'rb').read())
        for x in o:
            x['mat'] += len(mats)
        mats += m
        objs += o
    objs = [o for o in objs if not o['flags'] & 4]
    mpal = []
    if e['mpal']:
        mpal = ler_mpal(open(os.path.join(base, 'mpal', e['mpal'].lower()), 'rb').read())
    pecas = []
    for o in objs:
        tex = mats[o['mat']].lower() if 0 <= o['mat'] < len(mats) and mats[o['mat']] else None
        pecas.append({
            'nome': o['nome'],
            'tex': tex,
            'pos': [r4(x) for v in o['verts'] for x in v[0]],
            'uv': [r4(x) for v in o['verts'] for x in v[2]],
            'idx': o['idx'],
            'm': [r4(x) for x in o['matriz']],
            'q': [[r4(x) for x in m] for m in o['quadros']],
        })
    blocos = [e['blocos'][q] for q in e['ordem']] if e['ordem'] else e['blocos']
    if particula:
        # Sem blocos de verdade (a peça do .eff é a linha do emissor): um bloco por
        # quadro do .3dx, virado para a câmera, com o material do próprio modelo.
        nq = max(1, max((len(p['q']) for p in pecas), default=1))
        blocos = [[[q, 0, 4 | 8, 1, 1, 1, 1, 0, 0] for _ in pecas] for q in range(nq)]
    texturas = {p['tex'] for p in pecas if p['tex']} | set(mpal)
    copiadas = []
    for t in sorted(texturas):
        destino = os.path.join(pasta_tex, t + '.png')
        origem = os.path.join(old, 'reference/textures_png', t + '.png')
        if not os.path.exists(destino) and os.path.exists(origem):
            shutil.copyfile(origem, destino)
            copiadas.append(t)
    opacas = sorted(t for t in texturas if os.path.exists(os.path.join(pasta_tex, t + '.png'))
                    and Image.open(os.path.join(pasta_tex, t + '.png')).convert('RGBA').getchannel('A').getextrema()[0] == 255)
    out = {'id': eid, 'quadros': len(blocos), 'pecas': pecas, 'mpal': mpal, 'opacas': opacas, 'blocos': blocos}
    if e['volta'] and not particula:
        out['volta'] = e['volta']  # o quadro (na ordem de `blocos`) de onde o efeito repete
    if particula:
        out['particula'] = True
        out['variantes'] = len(modelos)
    with open(os.path.join(saida, eid + '.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'{eid}: {len(pecas)} peças, {len(blocos)} quadros, modelo {modelo}{" (partícula)" if particula else ""}'
          f', paleta {len(mpal)}, texturas novas {copiadas or "-"}')


def copiar_textura(old, pasta_tex, t):
    """Copia a textura `t` do original se ainda não está na pasta; devolve se é sólida (sem alfa)."""
    destino = os.path.join(pasta_tex, t + '.png')
    origem = os.path.join(old, 'reference/textures_png', t + '.png')
    if not os.path.exists(destino) and os.path.exists(origem):
        shutil.copyfile(origem, destino)
    return os.path.exists(destino) and Image.open(destino).convert('RGBA').getchannel('A').getextrema()[0] == 255


def converter_malha(old, saida, pasta_tex, nome):
    """
    Malha solta do original (um .3dx sem .eff) no mesmo formato de efeito, com um
    quadro só, parada: os destroços da unidade destruída (ex_particl01 a 04, que o
    CUnitWreck desenha com a textura da própria unidade; a do .3dx fica de reserva).
    """
    mats, objs = ler_3dx(open(os.path.join(old, 'assets_obb', '3dx', nome + '.3dx'), 'rb').read())
    objs = [o for o in objs if not o['flags'] & 4]
    pecas = []
    for o in objs:
        tex = mats[o['mat']].lower() if 0 <= o['mat'] < len(mats) and mats[o['mat']] else None
        pecas.append({
            'nome': o['nome'],
            'tex': tex,
            'pos': [r4(x) for v in o['verts'] for x in v[0]],
            'uv': [r4(x) for v in o['verts'] for x in v[2]],
            'idx': o['idx'],
            'm': [r4(x) for x in o['matriz']],
            'q': [],
        })
    texturas = sorted({p['tex'] for p in pecas if p['tex']})
    opacas = [t for t in texturas if copiar_textura(old, pasta_tex, t)]
    out = {'id': nome, 'quadros': 1, 'pecas': pecas, 'mpal': [], 'opacas': opacas,
           'blocos': [[[0, 0, 0, 1, 1, 1, 1, 0, 0] for _ in pecas]], 'malha': True}
    with open(os.path.join(saida, nome + '.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'{nome}: malha de {len(pecas)} peça(s), texturas {texturas or "-"}')


def inversa_linha(m):
    """Inversa de uma matriz 4×4 do original (16 floats, vetor-linha), por Gauss-Jordan."""
    a = [list(m[r * 4:r * 4 + 4]) + [1.0 if c == r else 0.0 for c in range(4)] for r in range(4)]
    for c in range(4):
        piv = max(range(c, 4), key=lambda r: abs(a[r][c]))
        a[c], a[piv] = a[piv], a[c]
        d = a[c][c]
        a[c] = [x / d for x in a[c]]
        for r in range(4):
            if r != c and a[r][c]:
                k = a[r][c]
                a[r] = [x - k * y for x, y in zip(a[r], a[c])]
    return [x for r in range(4) for x in a[r][4:]]


def vezes_linha(p, m):
    """p·M (ponto do original, vetor-linha, com w = 1)."""
    return [p[0] * m[c] + p[1] * m[4 + c] + p[2] * m[8 + c] + m[12 + c] for c in range(3)]


def converter_rastro(old, saida, pasta_tex, nome):
    """
    Rastro de míssil do original (CUnitMissileTail, o .3dx da coluna 58 do
    inititemweapon.cfg): uma malha com pele presa a ossos Bone01..BoneN. O original
    (CUnitMissileTail::Proceed e RenderScene) guarda as 16 últimas matrizes do nó `Tail`
    do míssil e põe o Bone01 na de agora, o último osso na mais velha e os do meio em
    (16 − 1) × k / N + 1; a malha estica pelo caminho andado. Aqui cada vértice já sai no
    espaço de cada osso que o puxa (a posição de ligação vezes a inversa do osso), com
    o peso: o cliente só soma peso × (matriz do osso agora) × ponto.
    """
    mats, todos = ler_3dx(open(os.path.join(old, 'assets_obb', '3dx', nome + '.3dx'), 'rb').read())
    ossos = sorted((o for o in todos if o['flags'] & 4 and o['nome'].startswith('Bone')), key=lambda o: o['nome'])
    num = {id(o): k for k, o in enumerate(ossos)}
    inversas = {id(o): inversa_linha(o['matriz']) for o in ossos}
    malha = next(o for o in todos if o['pesos'])
    tex = mats[malha['mat']].lower()
    inf = []
    for (p, _, _), (p3, ids) in zip(malha['verts'], malha['pesos']):
        v = vezes_linha(p, malha['matriz'])
        pesos = list(p3) + [max(0.0, 1 - sum(p3))]
        linha = []
        for w, i in zip(pesos, ids):
            if i == 255 or w <= 1e-4:
                continue
            o = todos[malha['paleta'][i]]
            linha.append([num[id(o)], r4(w), *[r4(x) for x in vezes_linha(v, inversas[id(o)])]])
        inf.append(linha)
    opaca = copiar_textura(old, pasta_tex, tex)
    out = {'id': nome, 'rastro': True, 'tex': tex, 'opaca': opaca, 'ossos': len(ossos), 'historico': 16,
           'uv': [r4(x) for v in malha['verts'] for x in v[2]], 'idx': malha['idx'], 'inf': inf}
    with open(os.path.join(saida, nome + '.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'{nome}: rastro de {len(inf)} vértices em {len(ossos)} ossos, textura {tex}')


if __name__ == '__main__':
    args = sys.argv[1:]
    modo = converter
    if '--malha' in args:
        args.remove('--malha')
        modo = converter_malha
    if '--rastro' in args:
        args.remove('--rastro')
        modo = converter_rastro
    if len(args) < 4:
        print(__doc__)
        sys.exit(1)
    os.makedirs(args[1], exist_ok=True)
    for i in args[3:]:
        modo(args[0], args[1], args[2], i)
