"""Converte a propulsão das naves do AstroN original (os efeitos NG) para glb.

Uso:
  python3 -I tools/propulsao_do_original.py <old-astron> <saída>

  <old-astron> raiz do old-astron (lê assets_obb/effect/<r>_ng00k.eff, assets_obb/3dx,
               assets_obb/mpal e reference/textures_png)
  <saída>      public/modelos/propulsao

Como o original desenha a propulsão (CUnit::RenderPropulsion, CUnit::RenderScene,
CUnit::LoadResource e CBasePilot::UpdateWeaponPosition, decompilados do libgame):
- toda nave de jogador tem três efeitos da raça (colunas 6 a 8 do initunit.cfg):
  NG001 (voo normal), NG002 (turbo) e NG003 (jatos auxiliares);
- são oito encaixes, nos pontos da nave: l_propulsion e r_propulsion (motores; NG001,
  que vira NG002 com o turbo), c_fire01 e c_fire02 (nariz: ré), l_fire01 e l_fire02,
  r_fire01 e r_fire02 (pontas das asas: curva), os seis com o NG003;
- cada encaixe acende e apaga devagar (alfa ±0,05 por quadro) e o efeito é desenhado
  na matriz do encaixe vezes a da nave, em branco com esse alfa, aditivo.

O .eff de cada um diz as malhas (assets_obb/3dx) e o .MPL, que troca a textura de uma
delas em ciclo (três quadros: é o tremor da chama). As malhas não se mexem (os quadros
do .3dx repetem a pose), salvo o jato auxiliar, que estica e encolhe em 4 quadros.

Aqui cada efeito vira um glb com as peças no espaço do efeito, já na troca de eixos dos
glb das naves (x, z, y: tools do old-astron, export_ships.py), para pendurar direto no
nó do encaixe: o efeito sai para +x do encaixe (o de motor aponta para trás da nave).
Sem escala nem centro: a escala é a da nave (FATOR_TAMANHO_NAVE, aplicada no cliente).
As texturas ficam fora do glb, em texturas/<nome>.png, e cada material diz no
`extras.quadros` a lista de quadros (1 sem .MPL, 3 com); a peça que pulsa traz no
`extras.pulso` a escala de cada quadro. Os materiais não têm cor nem luz: o cliente
desenha aditivo (public/js/propulsao.js).
"""
import json
import os
import shutil
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monstros_do_original import ler_3dx, linear_e_posicao, aplicar  # noqa: E402
from efeitos_do_original import strings  # noqa: E402

RACAS = {'acron': 'a', 'bellico': 'b', 'shrewdo': 's'}
EFEITOS = {'normal': '001', 'turbo': '002', 'auxiliar': '003'}


def nomes_do_eff(caminho):
    """Malhas e .MPL citados no .eff, na ordem."""
    malhas, mpls = [], []
    for s in strings(open(caminho, 'rb').read()):
        if s in ('1FFE', 'STAND'):
            continue
        (mpls if s.upper().endswith('.MPL') else malhas).append(s)
    return list(dict.fromkeys(malhas)), list(dict.fromkeys(mpls))


def texturas_do_mpl(caminho):
    return [s for s in strings(open(caminho, 'rb').read()) if s != '1LPM']


def escala_por_eixo(lin):
    """Escala de cada eixo do espaço do efeito (linha da matriz coluna)."""
    return [sum(x * x for x in linha) ** 0.5 for linha in lin]


def converter_efeito(old, saida, prefixo, ng):
    d3 = os.path.join(old, 'assets_obb/3dx')
    malhas, mpls = nomes_do_eff(os.path.join(old, 'assets_obb/effect', f'{prefixo}_ng{ng}.eff'))
    ciclos = [[t.lower() for t in texturas_do_mpl(os.path.join(old, 'assets_obb/mpal', m.lower()))] for m in mpls]

    bin_ = bytearray()
    views, acessores, materiais, mat_de, nos, malhas_gltf = [], [], [], {}, [], []

    def acessor(valores, tipo, comp, alvo, minmax=False):
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[tipo]
        fmt = {5126: 'f', 5123: 'H'}[comp]
        planos = [x for v in valores for x in (v if n > 1 else [v])]
        while len(bin_) % 4:
            bin_.append(0)
        views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': 4 * len(planos) if fmt == 'f' else 2 * len(planos), 'target': alvo})
        bin_.extend(struct.pack(f'<{len(planos)}{fmt}', *planos))
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(valores), 'type': tipo}
        if minmax:
            a['min'] = [min(v[k] for v in valores) for k in range(n)]
            a['max'] = [max(v[k] for v in valores) for k in range(n)]
        acessores.append(a)
        return len(acessores) - 1

    texturas = set()
    for nome in malhas:
        caminho = os.path.join(d3, nome.lower() + '.3dx')
        if not os.path.exists(caminho):
            continue
        mats, objs = ler_3dx(open(caminho, 'rb').read())
        for o in objs:
            if not o['verts'] or o['flags'] & 4:  # ossos não se desenham
                continue
            tex = mats[o['mat']].lower() if 0 <= o['mat'] < len(mats) else ''
            quadros = next((c for c in ciclos if tex in c), [tex])
            texturas.update(quadros)
            if tex not in mat_de:
                materiais.append({'name': tex, 'doubleSided': True, 'alphaMode': 'BLEND',
                                  'extras': {'aditivo': True, 'quadros': quadros}})
                mat_de[tex] = len(materiais) - 1
            # Pose da peça no espaço do efeito, depois a troca de eixos das naves (x, z, y).
            lin, t = linear_e_posicao(o['matriz'])
            pos = []
            for p, _, _ in o['verts']:
                e = [a + b for a, b in zip(aplicar(lin, p), t)]
                pos.append([e[0], e[2], e[1]])
            uvs = [list(uv) for _, _, uv in o['verts']]
            idx = o['idx']
            tris = idx[:len(idx) - len(idx) % 3]
            prim = {'attributes': {'POSITION': acessor(pos, 'VEC3', 5126, 34962, True),
                                   'TEXCOORD_0': acessor(uvs, 'VEC2', 5126, 34962)},
                    'indices': acessor(tris, 'SCALAR', 5123, 34963),
                    'material': mat_de[tex]}
            malhas_gltf.append({'name': o['nome'], 'primitives': [prim]})
            no = {'name': o['nome'], 'mesh': len(malhas_gltf) - 1}
            # Pulso: escala de cada quadro em relação à pose (x, y, z do glTF).
            base = escala_por_eixo(lin)
            pulso = []
            for q in o['quadros']:
                e = [a / (b or 1) for a, b in zip(escala_por_eixo(linear_e_posicao(q)[0]), base)]
                pulso.append([round(e[0], 4), round(e[2], 4), round(e[1], 4)])
            if any(abs(c - 1) > 1e-3 for e in pulso for c in e):
                no['extras'] = {'pulso': pulso}
            nos.append(no)

    raiz = f'{prefixo}_ng{ng}'.upper()
    gltf = {
        'asset': {'version': '2.0', 'generator': 'new-astron tools/propulsao_do_original.py'},
        'scene': 0,
        'scenes': [{'nodes': [len(nos)]}],
        'nodes': nos + [{'name': raiz, 'children': list(range(len(nos)))}],
        'meshes': malhas_gltf,
        'materials': materiais,
        'buffers': [{'byteLength': 0}],
        'bufferViews': views,
        'accessors': acessores,
    }
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
    return raiz, malhas, mpls, nos, materiais, texturas


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    old, saida = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.join(saida, 'texturas'), exist_ok=True)
    linhas = []
    todas = set()
    for raca, prefixo in RACAS.items():
        for efeito, ng in EFEITOS.items():
            arquivo = f'{raca}-{efeito}.glb'
            raiz, malhas, mpls, nos, materiais, texturas = converter_efeito(old, os.path.join(saida, arquivo), prefixo, ng)
            todas |= texturas
            pecas = ', '.join(n['name'] + (' (pulsa)' if 'extras' in n else '') for n in nos)
            quadros = '; '.join(' → '.join(m['extras']['quadros']) for m in materiais)
            linhas.append(f'| `{arquivo}` | {raiz} ({", ".join(malhas + mpls)}) | {pecas} | {quadros} |')
            print(f'{arquivo}: {len(nos)} peças, texturas {quadros}')
    for t in sorted(todas):
        shutil.copyfile(os.path.join(old, 'reference/textures_png', t + '.png'), os.path.join(saida, 'texturas', t + '.png'))
    with open(os.path.join(saida, 'LISTA.md'), 'w') as f:
        f.write('# Propulsão das naves (do AstroN original)\n\n'
                'Gerado por `tools/propulsao_do_original.py` (não edite à mão). Os efeitos NG do original: '
                'por raça, `normal` (NG001, motores l/r_propulsion em voo), `turbo` (NG002, os mesmos motores no '
                'turbo) e `auxiliar` (NG003, nariz c_fire01/02 na ré e pontas das asas l/r_fire01/02 na curva). '
                'Peças no espaço do encaixe (eixos dos glb das naves; o efeito sai para +x do encaixe), sem escala; '
                'texturas em `texturas/`, com os quadros do ciclo do .MPL em `extras.quadros` de cada material. '
                'Desenho aditivo em `public/js/propulsao.js`.\n\n'
                '| Arquivo | Efeito do original | Peças | Texturas (quadros) |\n|---|---|---|---|\n')
        f.write('\n'.join(linhas) + '\n')


if __name__ == '__main__':
    main()
