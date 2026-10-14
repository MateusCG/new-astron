"""Exporta os modelos 3D das armas do AstroN original para public/modelos/armas/.

Uso:
  python3 -I tools/armas_do_original.py <pasta 3dx> <pasta texturas png> <inititemweapon.cfg> <saída>

  <pasta 3dx>          old-astron/assets_obb/3dx
  <pasta texturas png> old-astron/reference/textures_png
  <inititemweapon.cfg> old-astron/reference/game_data_decoded/locale/en/cfg/inititemweapon.cfg
  <saída>              public/modelos/armas

Gera um <modelo>.glb por arquivo aw*/bw*/sw* (Acron, Bellico, Shrewdo) e a LISTA.md.

A leitura do formato 3DX e a montagem do GLB são as do exportador das naves
(old-astron/scripts/export_ships.py e x3dx_to_obj.py), copiadas aqui para este
repositório não depender do old-astron. O que muda para as armas:

- Mesmo espaço da nave: Y para cima, nariz para +x, +z à direita, unidades do jogo
  original. A origem do modelo é o ponto onde ele se prende na nave: o integrador
  pendura o GLB da arma como filho do nó `l_item`/`r_item` do GLB da nave (com a
  matriz do nó, não só a posição) e aplica a mesma escala que já aplica à nave.
- O helper `fire` (boca da arma, de onde sai o tiro) vira um nó vazio com
  `extras.astron_helper = true`, como os encaixes das naves.
- O nó raiz leva `extras.astron_arma = { modelo, raca, lado }` (`lado` = 'l', 'r' ou
  null quando o mesmo modelo serve nos dois encaixes, sem espelhar).
- Os modelos `aw301`, `bw301` e `sw301` ficam de fora: são um triângulo com textura
  `particle_dummy`, marcador invisível do canhão das naves-comando.
"""
import io
import json
import os
import re
import struct
import sys

from PIL import Image

RACAS = {'aw': 'acron', 'bw': 'bellico', 'sw': 'shrewdo'}
NOME_RACA = {'acron': 'Acron', 'bellico': 'Bellico', 'shrewdo': 'Shrewdo'}
IGNORAR = {'aw301', 'bw301', 'sw301'}


# ---------- leitura do 3DX (de x3dx_to_obj.py) ----------

class Leitor:
    def __init__(self, dados):
        self.d, self.p = dados, 0

    def take(self, n):
        if self.p + n > len(self.d):
            raise EOFError('fim inesperado do arquivo')
        b = self.d[self.p:self.p + n]
        self.p += n
        return b

    def f(self, n):
        return struct.unpack(f'<{n}f', self.take(4 * n))

    def i32(self):
        return struct.unpack('<i', self.take(4))[0]

    def u8(self):
        return self.take(1)[0]

    def cstr(self, n):
        return self.take(n).split(b'\0', 1)[0].decode('latin-1')


def ler_3dx(dados):
    r = Leitor(dados)
    if r.cstr(20) != '3DX(Ver.4.0)':
        raise ValueError('assinatura 3DX inválida')
    nm, no, nh = r.i32(), r.i32(), r.i32()
    mats = []
    for _ in range(nm):
        amb, dif, spe = r.f(3), r.f(3), r.f(3)
        tex = r.cstr(20)
        subs = []
        for _ in range(max(r.i32(), 0)):
            s = (r.f(3), r.f(3), r.f(3), r.cstr(20))
            subs.append({'dif': s[1], 'tex': s[3]})
        mats.append({'dif': dif, 'tex': tex, 'subs': subs})
    objs = []
    for _ in range(no):
        nome = r.cstr(64)
        flags = r.u8()
        matriz = r.f(16)
        r.f(3)
        mat_id, nv, ni, nextra = r.i32(), r.i32(), r.i32(), r.i32()
        r.u8()
        nquadros = r.i32()
        r.take(max(nextra, 0))
        verts = []
        for _ in range(nv):
            pos = r.f(3)
            if flags & 2:
                r.f(4)
            nrm = r.f(3)
            uv = r.f(2)
            if flags & 8:
                r.f(2)
            verts.append((pos, nrm, uv))
        if flags & 1 and ni > 0:
            idx = list(struct.unpack(f'<{ni}H', r.take(2 * ni)))
        else:
            idx = list(range(nv))
        r.take(64 * max(nquadros, 0))
        objs.append({'nome': nome, 'matriz': matriz, 'mat': mat_id, 'verts': verts, 'idx': idx})
    helpers = [(r.cstr(64), r.f(16)) for _ in range(nh)]
    return mats, objs, helpers


def transformar(ob):
    """Matriz do objeto aplicada e eixos trocados para Y para cima: (x, y, z) -> (x, z, y)."""
    m = ob['matriz']
    pos, nrm = [], []
    for p, n, _ in ob['verts']:
        x = p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12]
        y = p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13]
        z = p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14]
        pos.append((x, z, y))
        nx = n[0] * m[0] + n[1] * m[4] + n[2] * m[8]
        ny = n[0] * m[1] + n[1] * m[5] + n[2] * m[9]
        nz = n[0] * m[2] + n[1] * m[6] + n[2] * m[10]
        ln = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
        nrm.append((nx / ln, nz / ln, ny / ln))
    det = (m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8])
           + m[2] * (m[4] * m[9] - m[5] * m[8]))
    return pos, nrm, det >= 0


def orientar(indices, pos, nrm, inverter):
    """Ordem dos vértices de cada triângulo de acordo com as normais do arquivo.

    A regra do exportador das naves (inverter quando o determinante da matriz é >= 0)
    acerta as peças normais, mas erra as espelhadas (determinante -1, a maioria das
    peças _l/_r): elas saíam com as faces do avesso e, com material de dois lados,
    escuras como se a luz viesse de trás. As normais gravadas no 3DX apontam para fora,
    então cada triângulo é virado para concordar com a soma das normais dos seus
    vértices; só triângulo degenerado fica com a regra antiga.
    """
    saida = []
    for i in range(0, len(indices) - 2, 3):
        a, b, c = indices[i:i + 3]
        if inverter:
            b, c = c, b
        pa, pb, pc = pos[a], pos[b], pos[c]
        u = [pb[k] - pa[k] for k in range(3)]
        v = [pc[k] - pa[k] for k in range(3)]
        n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        s = [nrm[a][k] + nrm[b][k] + nrm[c][k] for k in range(3)]
        if sum(n[k] * s[k] for k in range(3)) < 0:
            b, c = c, b
        saida += [a, b, c]
    return saida


def textura_principal(mat):
    if not mat['tex'] and mat['subs']:
        return mat['subs'][0]['tex']
    return mat['tex']


def achar_textura(pasta, nome):
    if not nome:
        return None
    for ext in ('.png', '.pn8', '.bmp'):
        p = os.path.join(pasta, nome.lower() + ext)
        if os.path.exists(p):
            return p
    return None


def png_rgba(caminho):
    """Bytes do PNG para embutir e se ele tem transparência de verdade.

    As texturas das armas são quase todas paletadas: regravadas paletadas ficam bem
    menores que em RGB. Regravar (em vez de copiar o arquivo) tira os blocos gAMA/sRGB,
    que alguns navegadores aplicariam e outros não.
    """
    im = Image.open(caminho)
    alfa = 'transparency' in im.info or im.mode in ('RGBA', 'LA', 'PA')
    if alfa:
        alfa = im.convert('RGBA').getchannel('A').getextrema()[0] < 255
    convertida = im.convert('RGBA' if alfa else 'RGB')
    buf = io.BytesIO()
    convertida.save(buf, 'PNG', optimize=True)
    melhor = buf.getvalue()
    if im.mode == 'P':
        buf = io.BytesIO()
        im.save(buf, 'PNG', optimize=True)
        if len(buf.getvalue()) < len(melhor):
            melhor = buf.getvalue()
    return melhor, alfa


def trocar_eixos_matriz(m):
    """Matriz de helper (D3D, vetor-linha) no espaço convertido (x, z, y): S·M·S."""
    p = [0, 2, 1, 3]
    return [m[p[r] * 4 + p[c]] for r in range(4) for c in range(4)]


# ---------- escrita do GLB (de export_ships.py) ----------

class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors = [], []

    def add(self, dados, alvo=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(dados)}
        if alvo:
            view['target'] = alvo
        self.bin += dados
        self.views.append(view)
        return len(self.views) - 1

    def accessor(self, fmt, valores, comp, tipo, n, minmax=False, alvo=None):
        view = self.add(struct.pack(f'<{len(valores)}{fmt}', *valores), alvo)
        acc = {'bufferView': view, 'componentType': comp, 'count': n, 'type': tipo}
        if minmax:
            k = {'VEC3': 3, 'VEC2': 2}[tipo]
            acc['min'] = [min(valores[i::k]) for i in range(k)]
            acc['max'] = [max(valores[i::k]) for i in range(k)]
        self.accessors.append(acc)
        return len(self.accessors) - 1


def exportar(src, modelo, raca, lado, pasta_tex, saida):
    mats, objs, helpers = ler_3dx(open(src, 'rb').read())
    texs = [textura_principal(m) for m in mats]
    distintas = sorted({t.lower() for t in texs if t and achar_textura(pasta_tex, t)})

    g = GLB()
    gl = {'asset': {'version': '2.0', 'generator': 'New AstroN tools/armas_do_original.py'},
          'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [], 'meshes': [],
          'materials': [], 'textures': [], 'images': [],
          'samplers': [{'wrapS': 10497, 'wrapT': 10497}]}
    tex_idx, tex_alfa = {}, {}
    for t in distintas:
        dados, alfa = png_rgba(achar_textura(pasta_tex, t))
        gl['images'].append({'bufferView': g.add(dados), 'mimeType': 'image/png', 'name': t})
        gl['textures'].append({'source': len(gl['images']) - 1, 'sampler': 0})
        tex_idx[t], tex_alfa[t] = len(gl['textures']) - 1, alfa
    for i, m in enumerate(mats):
        t = (texs[i] or '').lower()
        mat = {'name': f'{modelo}_mat{i}', 'doubleSided': True,
               'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.6}}
        if t in tex_idx:
            mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex_idx[t]}
            if tex_alfa[t]:
                mat['alphaMode'], mat['alphaCutoff'] = 'MASK', 0.5
        else:
            mat['pbrMetallicRoughness']['baseColorFactor'] = [min(max(c, 0), 1) for c in m['dif']] + [1.0]
        gl['materials'].append(mat)

    raiz = {'name': modelo, 'children': [],
            'extras': {'astron_arma': {'modelo': modelo, 'raca': raca, 'lado': lado}}}
    gl['nodes'].append(raiz)
    tris = 0
    todos = []
    for ob in objs:
        if not ob['verts']:
            continue
        pos, nrm, inverter = transformar(ob)
        todos += pos
        nrm = [n if any(n) else (0.0, 1.0, 0.0) for n in nrm]
        idx = orientar(ob['idx'], pos, nrm, inverter)
        tris += len(idx) // 3
        n = len(pos)
        prim = {'attributes': {
            'POSITION': g.accessor('f', [c for p in pos for c in p], 5126, 'VEC3', n, True, 34962),
            'NORMAL': g.accessor('f', [c for v in nrm for c in v], 5126, 'VEC3', n, False, 34962),
            'TEXCOORD_0': g.accessor('f', [c for _, _, uv in ob['verts'] for c in uv], 5126, 'VEC2', n, False, 34962)},
            'indices': g.accessor('H' if n < 65536 else 'I', idx, 5123 if n < 65536 else 5125,
                                  'SCALAR', len(idx), False, 34963), 'mode': 4}
        if 0 <= ob['mat'] < len(mats):
            prim['material'] = ob['mat']
        gl['meshes'].append({'name': ob['nome'] or 'obj', 'primitives': [prim]})
        gl['nodes'].append({'name': ob['nome'] or 'obj', 'mesh': len(gl['meshes']) - 1})
        raiz['children'].append(len(gl['nodes']) - 1)
    for nome, m in helpers:
        gl['nodes'].append({'name': nome, 'matrix': trocar_eixos_matriz(m), 'extras': {'astron_helper': True}})
        raiz['children'].append(len(gl['nodes']) - 1)
    for k in ('textures', 'images'):
        if not gl[k]:
            del gl[k]
    if 'textures' not in gl:
        del gl['samplers']
    while len(g.bin) % 4:
        g.bin.append(0)
    gl['buffers'] = [{'byteLength': len(g.bin)}]
    gl['bufferViews'], gl['accessors'] = g.views, g.accessors
    js = json.dumps(gl, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    caminho = os.path.join(saida, f'{modelo}.glb')
    with open(caminho, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(g.bin)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(g.bin), 0x004E4942) + bytes(g.bin))
    caixa = [(min(p[i] for p in todos), max(p[i] for p in todos)) for i in range(3)] if todos else None
    bocas = [(nome, (m[12], m[14], m[13])) for nome, m in helpers]
    return {'tris': tris, 'helpers': bocas, 'caixa': caixa, 'bytes': os.path.getsize(caminho),
            'texturas': distintas}


def armas_por_modelo(cfg):
    """{modelo minúsculo: [nomes das armas jogáveis que o usam]} (só a versão base, sem NPC)."""
    usos = {}
    for linha in open(cfg, encoding='utf-8', errors='replace'):
        c = [x.strip() for x in linha.rstrip('\r\n').split('\t')]
        if len(c) < 12 or not re.fullmatch(r'\d{6}', c[0]) or c[0][3] != '0' or c[0][0] not in '123':
            continue
        nome = c[1]
        if '(' in nome:  # partes internas: "(mainbody)", "(warhead)", "(Normal Bullet)"...
            continue
        for m in {c[5].lower(), c[6].lower()}:
            if m and m != '0':
                usos.setdefault(m, [])
                if nome not in usos[m]:
                    usos[m].append(nome)
    return usos


def main():
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    pasta_3dx, pasta_tex, cfg, saida = sys.argv[1:]
    os.makedirs(saida, exist_ok=True)
    usos = armas_por_modelo(cfg)
    linhas = []
    for arq in sorted(os.listdir(pasta_3dx)):
        base, ext = os.path.splitext(arq)
        modelo = base.lower()
        if ext.lower() != '.3dx' or modelo[:2] not in RACAS or modelo in IGNORAR:
            continue
        raca = RACAS[modelo[:2]]
        lado = modelo[-1] if re.search(r'_[lr]$', modelo) else None
        info = exportar(os.path.join(pasta_3dx, arq), modelo, raca, lado, pasta_tex, saida)
        linhas.append((modelo, raca, lado, info))
        print(f"{modelo:10} {info['tris']:4} tri {info['bytes']:7} B")

    total = sum(i['bytes'] for *_, i in linhas)
    with open(os.path.join(saida, 'LISTA.md'), 'w') as f:
        f.write(
            '# Modelos das armas do AstroN original\n\n'
            f'Gerados por `tools/armas_do_original.py` a partir de `old-astron/assets_obb/3dx` (aw = Acron, '
            f'bw = Bellico, sw = Shrewdo). {len(linhas)} modelos, {total / 1024 / 1024:.2f} MB no total, '
            'cada um com a textura embutida.\n\n'
            '## Como montar na nave\n\n'
            '- **Espaço:** o mesmo dos GLB das naves (`public/modelos/ulysses.glb`): Y para cima, nariz para +x, '
            '+z à direita, unidades do jogo original (as naves têm ~30–50 de envergadura; as armas, ~10–20 de '
            'comprimento).\n'
            '- **Encaixe:** a origem do modelo é o ponto de fixação. Pendure o GLB da arma como filho do nó '
            '`l_item` (arma esquerda) ou `r_item` (direita) do GLB da nave, com a matriz do nó, e aplique a mesma '
            'rotação e escala que a nave recebe em `public/js/nave.js` (nariz de +x para -z e '
            '`COMPRIMENTO_NAVE / comprimento da nave`). Nada de escala própria para a arma.\n'
            '- **Lado:** modelo com `_l`/`_r` tem uma peça para cada encaixe (no original: colunas L e R de '
            '`inititemweapon.cfg`). Modelo sem sufixo vai **igual nos dois encaixes**, sem espelhar.\n'
            '- **Boca:** o nó `fire` (`extras.astron_helper = true`) é de onde sai o tiro. Modelo sem `fire` é '
            'dispositivo (escudo, camuflagem, acelerador): não dispara projétil.\n'
            '- **Raiz:** `extras.astron_arma = { modelo, raca, lado }`.\n'
            '- Ficaram de fora `aw301`, `bw301` e `sw301`: um triângulo de marcador invisível (`particle_dummy`) '
            'do canhão das naves-comando.\n\n'
            '| Modelo | Raça | Lado | Tamanho | Triângulos | Comprimento × largura × altura | Encaixes (posição) | '
            'Armas do original que usam |\n'
            '|---|---|---|---|---|---|---|---|\n')
        for modelo, raca, lado, i in linhas:
            cx = i['caixa']
            dims = ' × '.join(f'{b - a:.1f}' for a, b in (cx[0], cx[2], cx[1])) if cx else '—'
            enc = ', '.join(f"`{n}` ({x:.1f}, {y:.1f}, {z:.1f})" for n, (x, y, z) in i['helpers']) or '—'
            armas = '; '.join(usos.get(modelo, [])) or '—'
            f.write(f"| `{modelo}.glb` | {NOME_RACA[raca]} | {lado or 'ambos'} | {i['bytes'] / 1024:.1f} KB | "
                    f"{i['tris']} | {dims} | {enc} | {armas} |\n")
    print(f'{len(linhas)} modelos, {total} bytes')


if __name__ == '__main__':
    main()
