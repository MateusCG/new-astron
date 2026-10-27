"""Converte um monstro do AstroN original (.3dx) para glb, COM a animação do original.

Uso:
  python3 -I tools/monstros_do_original.py <old-astron> <saída.glb> <modelo> <escala>

  <old-astron> raiz do old-astron (lê assets_obb/3dx/<modelo>.3dx e reference/textures_png)
  <saída.glb>  public/modelos/monstros/<esp>.glb
  <modelo>     nome do modelo no initunit.cfg (ex.: nu0230)
  <escala>     metros do jogo por metro do original (0,25 = FATOR_AREA das armas)

Como o original anima um monstro: o .3dx (CDummyObject::Load3DX) guarda, para cada peça
da malha, uma lista de quadros com a matriz 4×4 inteira da peça (CDummy::SetFrame copia a
matriz do quadro para a peça); o .eff do modelo (effect/<modelo>.eff) só dá o nome da
animação ("STAND") e a sequência dos quadros, sem mexer em nada. O efeito anda um quadro
por atualização do jogo (CEffectSprite::NextFrame), a 24 por segundo (o intervalo padrão
do Cocos2dxRenderer, o mesmo QUADROS_POR_S dos efeitos de arma), e volta ao começo.

Aqui cada peça vira um nó do glTF (malha no espaço da peça) e os quadros viram uma
animação "STAND" de translação, rotação e escala por nó (o cliente toca com o
AnimationMixer). O resto segue o padrão dos glb de public/modelos/monstros/ (LISTA.md):
Y para cima, metros do jogo, frente em −z, origem no centro da caixa do corpo, materiais
de dois lados sem metal com a textura do original embutida (PNG). Diferenças:
- a caixa que dá o centro deixa de fora as peças de luz (textura *_light, como o cone de
  luz do SN-Zero): luz não é corpo, e o raio de acerto do servidor fica no corpo;
- material de luz (textura *_light) sai BLEND com `extras.aditivo` (o cliente desenha
  com mistura aditiva, como os efeitos do original);
- a escala é um fator só (não um tamanho-alvo): o tamanho do original vezes `escala`.

Eixos: o 3DX é Z para cima e a frente é +x; vira (x, z, y) (Y para cima, como o
x3dx_to_obj.py do old-astron) e gira a frente de +x para −z. A troca de eixos espelha,
então ela entra na malha (fixa) e o nó guarda só giro, escala e posição (o glTF não
aceita nó espelhado). Ordem dos triângulos pelas normais do próprio arquivo (a mesma
regra do `orientarFaces` das naves). Objetos de osso (flag 4) saem.
"""
import io
import json
import math
import os
import struct
import sys

from PIL import Image

QUADROS_POR_S = 24


class Leitor:
    def __init__(self, dados):
        self.d, self.p = dados, 0

    def bytes(self, n):
        b = self.d[self.p:self.p + n]
        if len(b) < n:
            raise EOFError('fim inesperado do .3dx')
        self.p += n
        return b

    def f(self, n):
        return struct.unpack(f'<{n}f', self.bytes(4 * n))

    def i32(self):
        return struct.unpack('<i', self.bytes(4))[0]

    def u8(self):
        return self.bytes(1)[0]

    def texto(self, n):
        return self.bytes(n).split(b'\0', 1)[0].decode('latin-1')


def ler_3dx(dados):
    r = Leitor(dados)
    if r.texto(20) != '3DX(Ver.4.0)':
        raise ValueError('assinatura 3DX inválida')
    nm, no, nh = r.i32(), r.i32(), r.i32()
    mats = []
    for _ in range(nm):
        r.f(9)
        tex = r.texto(20)
        subs = []
        for _ in range(max(r.i32(), 0)):
            r.f(9)
            subs.append(r.texto(20))
        mats.append(tex or (subs[0] if subs else ''))
    objs = []
    for _ in range(no):
        nome = r.texto(64)
        flags = r.u8()
        matriz = r.f(16)
        r.f(3)
        mat, nv, ni, nextra = r.i32(), r.i32(), r.i32(), r.i32()
        r.u8()
        nq = r.i32()
        paleta = list(r.bytes(max(nextra, 0)))  # malha com pele: os objetos-osso que os vértices usam
        verts = []
        pesos = []
        for _ in range(nv):
            pos = r.f(3)
            if flags & 2:
                # Pele: 3 pesos e, no 4º float, 4 índices (um byte cada) na paleta; 0xff = nenhum.
                w = r.bytes(16)
                p3 = struct.unpack('<3f', w[:12])
                pesos.append((p3, tuple(w[12:16])))
            nrm = r.f(3)
            uv = r.f(2)
            if flags & 8:
                r.f(2)
            verts.append((pos, nrm, uv))
        idx = list(struct.unpack(f'<{ni}H', r.bytes(2 * ni))) if flags & 1 and ni > 0 else list(range(nv))
        quadros = [r.f(16) for _ in range(max(nq, 0))]
        objs.append({'nome': nome, 'flags': flags, 'matriz': matriz, 'mat': mat, 'verts': verts, 'idx': idx, 'quadros': quadros,
                     'pesos': pesos, 'paleta': paleta})
    for _ in range(nh):
        r.texto(64)
        r.f(16)
    return mats, objs


# ---------- álgebra 3×3 (listas de linhas) ----------

def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def aplicar(m, v):
    return [sum(m[i][k] * v[k] for k in range(3)) for i in range(3)]


def det(m):
    return (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))


def linear_e_posicao(m):
    """Matriz do 3DX (vetor-linha: p' = p·M) -> (L 3×3 coluna, t)."""
    lin = [[m[4 * j + i] for j in range(3)] for i in range(3)]
    return lin, [m[12], m[13], m[14]]


TROCA = [[1, 0, 0], [0, 0, 1], [0, 1, 0]]  # (x, y, z) -> (x, z, y): Z para cima vira Y para cima
GIRO = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]  # frente +x -> −z (90° em torno de Y)
ESPELHO_X = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]


def quaternio(r):
    """Matriz de rotação (3×3, coluna) -> [x, y, z, w]."""
    tr = r[0][0] + r[1][1] + r[2][2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        q = [(r[2][1] - r[1][2]) / s, (r[0][2] - r[2][0]) / s, (r[1][0] - r[0][1]) / s, 0.25 * s]
    elif r[0][0] > r[1][1] and r[0][0] > r[2][2]:
        s = math.sqrt(1.0 + r[0][0] - r[1][1] - r[2][2]) * 2
        q = [0.25 * s, (r[0][1] + r[1][0]) / s, (r[0][2] + r[2][0]) / s, (r[2][1] - r[1][2]) / s]
    elif r[1][1] > r[2][2]:
        s = math.sqrt(1.0 + r[1][1] - r[0][0] - r[2][2]) * 2
        q = [(r[0][1] + r[1][0]) / s, 0.25 * s, (r[1][2] + r[2][1]) / s, (r[0][2] - r[2][0]) / s]
    else:
        s = math.sqrt(1.0 + r[2][2] - r[0][0] - r[1][1]) * 2
        q = [(r[0][2] + r[2][0]) / s, (r[1][2] + r[2][1]) / s, 0.25 * s, (r[1][0] - r[0][1]) / s]
    n = math.sqrt(sum(x * x for x in q)) or 1
    return [x / n for x in q]


def trs(lin):
    """Linear sem cisalhamento e com det > 0 -> (rotação como quatérnio, escala por eixo)."""
    esc = [math.sqrt(sum(lin[i][j] ** 2 for i in range(3))) or 1e-9 for j in range(3)]
    rot = [[lin[i][j] / esc[j] for j in range(3)] for i in range(3)]
    return quaternio(rot), esc


def movimentos_do_eff(caminho):
    """Os movimentos do .eff do modelo: [(nome, [quadro do .3dx por peça, por quadro do movimento])].

    O .eff (EFFECT_DATA::ReLoad) tem o cabeçalho de 0x80 bytes, um registro de 0x80 por
    movimento (o nome e, em +0x20, o primeiro e o último quadro e quantos), um de 0x40
    por quadro e um bloco de 196 bytes por quadro e peça (o u16 do começo é o quadro do
    .3dx que a peça usa). A Medusa tem nove: STAND (o laço parado) e STAND01–08 (o
    teletransporte: sumida, subindo da água, afundando).
    """
    if not os.path.exists(caminho):
        return []
    d = open(caminho, 'rb').read()
    _, nf, no, na = struct.unpack_from('<4s3H', d, 0)
    ini = 0x80 + na * 0x80 + nf * 0x40
    movs = []
    for k in range(na):
        o = 0x80 + k * 0x80
        nome = d[o:o + 32].split(b'\0', 1)[0].decode('latin-1')
        _, a, b, n = struct.unpack_from('<4H', d, o + 0x20)
        quadros = [[struct.unpack_from('<H', d, ini + (q * no + p) * 196)[0] for p in range(no)] for q in range(a, b + 1)]
        movs.append((nome, quadros))
    return movs


def coluna(m16):
    """Matriz do 3DX (16 floats, vetor-linha) como 4×4 de coluna-vetor (lista de linhas)."""
    return [[m16[4 * c + r] for c in range(4)] for r in range(4)]


def mul4(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def inversa4(m):
    """Inversa de uma matriz 4×4 afim (lista de linhas, coluna-vetor)."""
    lin = [r[:3] for r in m[:3]]
    t = [m[0][3], m[1][3], m[2][3]]
    d = det(lin)
    cof = [[(lin[(j + 1) % 3][(i + 1) % 3] * lin[(j + 2) % 3][(i + 2) % 3] - lin[(j + 1) % 3][(i + 2) % 3] * lin[(j + 2) % 3][(i + 1) % 3]) / d
            for j in range(3)] for i in range(3)]
    ti = [-sum(cof[i][k] * t[k] for k in range(3)) for i in range(3)]
    return [cof[0] + [ti[0]], cof[1] + [ti[1]], cof[2] + [ti[2]], [0, 0, 0, 1]]


def converter(old, saida, modelo, escala):
    mats, todos = ler_3dx(open(os.path.join(old, 'assets_obb/3dx', modelo + '.3dx'), 'rb').read())
    tex_dir = os.path.join(old, 'reference/textures_png')
    objs = [o for o in todos if o['verts'] and not o['flags'] & 4]
    # Malha com pele (a Medusa): os vértices seguem os ossos (objetos de flag 4) pelos
    # pesos; os ossos viram juntas do glTF e as animações saem dos movimentos do .eff.
    ossos = [o for o in todos if o['flags'] & 4 and o['quadros']]
    pele = bool(ossos) and any(o['pesos'] for o in objs)
    junta_de = {id(o): i for i, o in enumerate(ossos)}
    glob = [[escala * x for x in linha] for linha in mul(GIRO, TROCA)]  # L = s·R·A

    def textura(i):
        return os.path.splitext(mats[i])[0].lower() if 0 <= i < len(mats) and mats[i] else None

    def luz(o):
        t = textura(o['mat'])
        return bool(t and t.endswith('_light'))

    # Pose parada (matriz da peça) no espaço do jogo, para a caixa do corpo. Com pele,
    # a pose do primeiro quadro do laço STAND do .eff (a Medusa: a pose de ligação é
    # ela ~85 m debaixo d'água, antes de subir; o laço parado é onde ela fica).
    movs = movimentos_do_eff(os.path.join(old, 'assets_obb/effect', modelo + '.eff')) if pele else []
    parado = next((q[0] for n, q in movs if n == 'STAND' and q), None)
    deforma = {}
    if parado:
        indice = {id(o): i for i, o in enumerate(todos)}
        for o in ossos:
            base = coluna(o['matriz'])
            agora = coluna(o['quadros'][min(parado[indice[id(o)]], len(o['quadros']) - 1)])
            deforma[id(o)] = mul4(agora, inversa4(base))
    mn, mx = [1e9] * 3, [-1e9] * 3
    for o in objs:
        if luz(o):
            continue
        lin, t = linear_e_posicao(o['matriz'])
        for k_v, (p, _, _) in enumerate(o['verts']):
            v = [a + b for a, b in zip(aplicar(lin, p), t)]
            if deforma and o['pesos']:
                p3, ids = o['pesos'][k_v]
                w4 = list(p3) + [max(0.0, 1 - sum(p3))]
                soma, acc = 0.0, [0.0, 0.0, 0.0]
                for k, i in enumerate(ids):
                    if i == 255:
                        continue
                    d = deforma[id(todos[o['paleta'][i]])]
                    vv = [sum(d[r][c] * x for c, x in enumerate(v + [1])) for r in range(3)]
                    acc = [a + w4[k] * b for a, b in zip(acc, vv)]
                    soma += w4[k]
                v = [x / (soma or 1) for x in acc]
            w = aplicar(glob, v)
            for k in range(3):
                mn[k], mx[k] = min(mn[k], w[k]), max(mx[k], w[k])
    centro = [(a + b) / 2 for a, b in zip(mn, mx)]

    bin_ = bytearray()
    views, acessores = [], []

    def anexar(dados, alvo=None):
        while len(bin_) % 4:
            bin_.append(0)
        views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(dados), **({'target': alvo} if alvo else {})})
        bin_.extend(dados)
        return len(views) - 1

    def acessor(valores, tipo, comp, alvo=None, minmax=False):
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[tipo]
        fmt = {5126: 'f', 5123: 'H', 5125: 'I'}[comp]
        planos = [x for v in valores for x in (v if n > 1 else [v])]
        dados = struct.pack(f'<{len(planos)}{fmt}', *planos)
        a = {'bufferView': anexar(dados, alvo), 'componentType': comp, 'count': len(valores), 'type': tipo}
        if minmax:
            cols = [[v[k] if n > 1 else v for v in valores] for k in range(n)]
            a['min'] = [min(c) for c in cols]
            a['max'] = [max(c) for c in cols]
        acessores.append(a)
        return len(acessores) - 1

    # Texturas e materiais (um por textura).
    imagens, texturas_gltf, materiais, mat_de = [], [], [], {}
    for o in objs:
        t = textura(o['mat'])
        if t in mat_de:
            continue
        m = {'name': t or 'sem_textura', 'doubleSided': True,
             'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.6}}
        caminho = os.path.join(tex_dir, (t or '') + '.png')
        if t and os.path.exists(caminho):
            im = Image.open(caminho).convert('RGBA')
            alfa = im.getchannel('A').getextrema()
            png = io.BytesIO()
            im.save(png, 'PNG', optimize=True)
            imagens.append({'bufferView': anexar(png.getvalue()), 'mimeType': 'image/png', 'name': t})
            texturas_gltf.append({'source': len(imagens) - 1, 'sampler': 0})
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(texturas_gltf) - 1}
            if luz(o):
                m['alphaMode'] = 'BLEND'
                m['extras'] = {'aditivo': True}
            elif alfa[0] < 255:
                m['alphaMode'] = 'MASK'
                m['alphaCutoff'] = 0.5
        materiais.append(m)
        mat_de[t] = len(materiais) - 1

    def no_do_quadro(m16, espelho):
        """Matriz da peça (quadro) -> nó do glTF: N = L·M·B⁻¹ (B = troca, e espelho se a peça é espelhada)."""
        lin, t = linear_e_posicao(m16)
        b = mul(TROCA, ESPELHO_X) if espelho else TROCA
        n_lin = mul(mul(glob, lin), b)  # B⁻¹ = B (as duas são involuções que comutam aqui)
        pos = [a - c for a, c in zip(aplicar(glob, t), centro)]
        q, esc = trs(n_lin)
        return pos, q, esc

    malhas, nos, canais, amostras = [], [], [], []
    tempos_idx = {}
    for o in objs:
        lin0, t0 = linear_e_posicao(o['matriz'])
        espelho = det(lin0) < 0
        b = mul(TROCA, ESPELHO_X) if espelho else TROCA
        com_pele = pele and o['pesos']
        if com_pele:
            # Vértice com pele: na pose de ligação, já no espaço do jogo (centrado); as
            # juntas é que andam.
            pos = [[a - c for a, c in zip(aplicar(glob, [x + y for x, y in zip(aplicar(lin0, p), t0)]), centro)] for p, _, _ in o['verts']]
            nl = mul(glob, lin0)
        else:
            pos = [aplicar(b, p) for p, _, _ in o['verts']]
        nrm = []
        for _, n, _ in o['verts']:
            v = aplicar(nl, n) if com_pele else aplicar(b, n)
            ln = math.sqrt(sum(x * x for x in v)) or 1
            nrm.append([x / ln for x in v])
        uvs = [list(uv) for _, _, uv in o['verts']]
        tris = []
        idx = o['idx']
        for k in range(0, len(idx) - 2, 3):
            a, c1, c2 = idx[k], idx[k + 1], idx[k + 2]
            pa, pb, pc = pos[a], pos[c1], pos[c2]
            ab = [pb[i] - pa[i] for i in range(3)]
            ac = [pc[i] - pa[i] for i in range(3)]
            cruz = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
            soma = [nrm[a][i] + nrm[c1][i] + nrm[c2][i] for i in range(3)]
            if sum(cruz[i] * soma[i] for i in range(3)) < 0:
                c1, c2 = c2, c1
            tris += [a, c1, c2]
        prim = {
            'attributes': {
                'POSITION': acessor(pos, 'VEC3', 5126, 34962, True),
                'NORMAL': acessor(nrm, 'VEC3', 5126, 34962),
                'TEXCOORD_0': acessor(uvs, 'VEC2', 5126, 34962),
            },
            'indices': acessor(tris, 'SCALAR', 5123 if len(pos) < 65536 else 5125, 34963),
            'material': mat_de[textura(o['mat'])],
        }
        if com_pele:
            juntas, pesos_v = [], []
            for (p3, ids) in o['pesos']:
                w = list(p3) + [max(0.0, 1 - sum(p3))]
                j = []
                for k, i in enumerate(ids):
                    if i == 255:
                        j.append(0)
                        w[k] = 0.0
                    else:
                        j.append(junta_de[id(todos[o['paleta'][i]])])
                soma = sum(w) or 1
                juntas.append(j)
                pesos_v.append([x / soma for x in w])
            prim['attributes']['JOINTS_0'] = acessor(juntas, 'VEC4', 5123, 34962)
            prim['attributes']['WEIGHTS_0'] = acessor(pesos_v, 'VEC4', 5126, 34962)
            malhas.append({'name': o['nome'], 'primitives': [prim]})
            nos.append({'name': o['nome'], 'mesh': len(malhas) - 1, 'skin': 0})
            continue
        malhas.append({'name': o['nome'], 'primitives': [prim]})
        p0, q0, e0 = no_do_quadro(o['matriz'], espelho)
        nos.append({'name': o['nome'] or f'peca{len(nos)}', 'mesh': len(malhas) - 1, 'translation': p0, 'rotation': q0, 'scale': e0})
        quadros = o['quadros']
        if len(quadros) > 1:
            n = len(quadros)
            if n not in tempos_idx:
                tempos_idx[n] = acessor([i / QUADROS_POR_S for i in range(n)], 'SCALAR', 5126, None, True)
            ps, qs, es = [], [], []
            for m16 in quadros:
                p, q, e = no_do_quadro(m16, espelho)
                if qs and sum(a * b for a, b in zip(q, qs[-1])) < 0:
                    q = [-x for x in q]  # o caminho curto entre um quadro e o outro
                ps.append(p)
                qs.append(q)
                es.append(e)
            no_i = len(nos) - 1
            for caminho, valores, tipo in (('translation', ps, 'VEC3'), ('rotation', qs, 'VEC4'), ('scale', es, 'VEC3')):
                amostras.append({'input': tempos_idx[n], 'output': acessor(valores, tipo, 5126), 'interpolation': 'LINEAR'})
                canais.append({'sampler': len(amostras) - 1, 'target': {'node': no_i, 'path': caminho}})

    peles, animacoes = [], []
    if pele:
        # Juntas: um nó por osso, na pose da matriz do osso (a de ligação); a inversa
        # dela é a matriz inversa de ligação. Os movimentos do .eff dizem, quadro a
        # quadro, qual quadro do .3dx cada osso usa (a ordem das peças do .eff é a dos
        # objetos do .3dx).
        primeira = len(nos)
        inversas = []
        for o in ossos:
            espelho = det(linear_e_posicao(o['matriz'])[0]) < 0
            p0, q0, e0 = no_do_quadro(o['matriz'], espelho)
            nos.append({'name': o['nome'], 'translation': p0, 'rotation': q0, 'scale': e0})
            lin, t = linear_e_posicao(o['matriz'])
            b = mul(TROCA, ESPELHO_X) if espelho else TROCA
            n_lin = mul(mul(glob, lin), b)
            pos = [a - c for a, c in zip(aplicar(glob, t), centro)]
            inv = inversa4([n_lin[0] + [pos[0]], n_lin[1] + [pos[1]], n_lin[2] + [pos[2]], [0, 0, 0, 1]])
            inversas.append([inv[r][c] for c in range(4) for r in range(4)])  # coluna a coluna
        peles.append({'joints': list(range(primeira, primeira + len(ossos))), 'inverseBindMatrices': acessor(inversas, 'MAT4', 5126)})
        indice_peca = {id(o): i for i, o in enumerate(todos)}
        movs_feitos = set()
        for nome, quadros in movimentos_do_eff(os.path.join(old, 'assets_obb/effect', modelo + '.eff')):
            # Os movimentos que só repetem quadros já exportados (a Medusa afundando:
            # STAND05–07 voltam STAND04–02 de trás para a frente) e as poses de um quadro
            # só ficam de fora: o cliente toca o trecho ao contrário se precisar.
            linhas = {tuple(q) for q in quadros}
            if len(quadros) < 2 or linhas <= movs_feitos:
                continue
            movs_feitos |= linhas
            tempos = acessor([i / QUADROS_POR_S for i in range(len(quadros))], 'SCALAR', 5126, None, True)
            tempo_unico = acessor([0.0], 'SCALAR', 5126, None, True)
            amostras_m, canais_m = [], []
            for j, o in enumerate(ossos):
                espelho = det(linear_e_posicao(o['matriz'])[0]) < 0
                peca = indice_peca[id(o)]
                ps, qs, es = [], [], []
                for linha in quadros:
                    fr = min(linha[peca], len(o['quadros']) - 1)
                    p, q, e = no_do_quadro(o['quadros'][fr], espelho)
                    if qs and sum(a * b for a, b in zip(q, qs[-1])) < 0:
                        q = [-x for x in q]
                    ps.append(p)
                    qs.append(q)
                    es.append(e)
                for caminho, valores, tipo in (('translation', ps, 'VEC3'), ('rotation', qs, 'VEC4'), ('scale', es, 'VEC3')):
                    # Canal que não muda no movimento vira um valor só (o arquivo encolhe).
                    if all(max(abs(a - b) for a, b in zip(v, valores[0])) < 1e-3 for v in valores):
                        valores = valores[:1]
                        entrada = tempo_unico
                    else:
                        valores = [[round(x, 4) for x in v] for v in valores]
                        entrada = tempos
                    amostras_m.append({'input': entrada, 'output': acessor(valores, tipo, 5126), 'interpolation': 'LINEAR'})
                    canais_m.append({'sampler': len(amostras_m) - 1, 'target': {'node': primeira + j, 'path': caminho}})
            animacoes.append({'name': nome, 'channels': canais_m, 'samplers': amostras_m})

    gltf = {
        'asset': {'version': '2.0', 'generator': 'new-astron tools/monstros_do_original.py'},
        'scene': 0,
        'scenes': [{'nodes': [len(nos)]}],
        'nodes': nos + [{'name': modelo, 'children': list(range(len(nos)))}],
        'meshes': malhas,
        'materials': materiais,
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
        'buffers': [{'byteLength': 0}],
        'bufferViews': views,
        'accessors': acessores,
    }
    if imagens:
        gltf['images'] = imagens
        gltf['textures'] = texturas_gltf
    if canais:
        animacoes.insert(0, {'name': 'STAND', 'channels': canais, 'samplers': amostras})
    if animacoes:
        gltf['animations'] = animacoes
    if peles:
        gltf['skins'] = peles
    while len(bin_) % 4:
        bin_.append(0)
    gltf['buffers'][0]['byteLength'] = len(bin_)
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with open(saida, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(bin_), b'BIN\0') + bytes(bin_))
    tris = sum(len(o['idx']) // 3 for o in objs)
    tam = [b - a for a, b in zip(mn, mx)]
    n_quadros = max((len(o['quadros']) for o in objs), default=0)
    anim = ', '.join(f"{a['name']}" for a in animacoes) if pele else f'STAND {n_quadros} quadros ({(n_quadros - 1) / QUADROS_POR_S:.2f} s)'
    print(f'{modelo}: {len(objs)} peças{f", {len(ossos)} ossos" if pele else ""}, {tris} triângulos, corpo {tam[0]:.1f} × {tam[2]:.1f} × {tam[1]:.1f} m '
          f'(largura × comprimento × altura), {anim}, {total / 1024:.0f} KB -> {saida}')


if __name__ == '__main__':
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    converter(sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4].replace(',', '.')))
