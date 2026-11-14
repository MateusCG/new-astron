"""Malha mid-poly de uma nave do original, sem mudar a forma nem o layout de UV.

Protótipo (Cyclone Wing): o glb do original tem ~360 triângulos soltos (cada um com
os três vértices dele), sombreados facetados. Aqui a malha é soldada, as faces viram
para fora (as normais do arquivo dizem o lado: o mesmo que `orientarFaces` faz no
cliente), as quinas duras (acima de ANGULO_QUINA) ganham um chanfro de SEGMENTOS
faixas e o resto fica liso com normais ponderadas pela área (weighted normals): a
quina pega o brilho e a superfície que o original aproxima em poucas faces lê como
curva. A UV é a do original (o chanfro interpola a UV dentro de cada ilha; as
costuras das ilhas ficam marcadas e não misturam), então a textura de antes encaixa.
Os nós de encaixe (propulsão, armas, jatos) saem como entraram.

Uso (Blender como módulo, `pip install bpy`, ou `blender -b --python`):
    python3 tools/nave_pbr_malha.py <entrada.glb> <saida.glb>
"""
import math
import sys

import bpy  # antes do bmesh: como módulo, é o bpy que o registra
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ANGULO_QUINA = math.radians(32)  # acima disso a aresta é quina: leva chanfro
LARGURA_CHANFRO = 0.22  # no metro do original (a nave tem ~40 de envergadura; no jogo × 0,5)
SEGMENTOS = 2
DESVIO_MAX = 0.25  # o quanto a malha nova pode se afastar de um vértice do original
SOLDA = 1e-4

entrada, saida = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)

for obj in [o for o in bpy.data.objects if o.type == 'MESH']:
    me = obj.data
    # O lado de fora de cada face, pelas normais do arquivo (antes de soldar).
    fora = [Vector() for _ in me.polygons]
    for p in me.polygons:
        for li in p.loop_indices:
            fora[p.index] += me.corner_normals[li].vector
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    virar = [f for f in bm.faces if f.normal.dot(fora[f.index]) < 0]
    bmesh.ops.reverse_faces(bm, faces=virar)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=SOLDA)

    # Costura onde a UV muda de ilha: o chanfro não interpola de uma ilha para a outra.
    uv = bm.loops.layers.uv.active
    def uv_da_aresta(face, aresta):
        return sorted((tuple(round(c, 5) for c in l[uv].uv) for l in face.loops if l.vert in aresta.verts))
    for e in bm.edges:
        fs = e.link_faces
        e.seam = len(fs) != 2 or uv_da_aresta(fs[0], e) != uv_da_aresta(fs[1], e)

    # Triângulos coplanares da mesma ilha viram uma face só (chanfro mais limpo).
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=bm.verts, edges=bm.edges, delimit={'SEAM', 'MATERIAL'})

    # O chanfro numa ponta fina (bico, ponta de asa, aleta) come a ponta e muda a
    # silhueta. Então ele é feito, medido (a distância de cada vértice do original até
    # a malha nova) e refeito sem as arestas dos vértices que saíram do lugar, até a
    # forma ficar dentro de DESVIO_MAX. As arestas que ficam sem chanfro continuam
    # duras (aresta viva), como no original.
    base = bm
    base.verts.ensure_lookup_table()
    originais = [v.co.copy() for v in base.verts]
    proibidos = set()
    for volta in range(12):
        bm = base.copy()
        bm.verts.ensure_lookup_table()
        duras = {e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > ANGULO_QUINA}
        quinas = [e for e in duras if e.verts[0].index not in proibidos and e.verts[1].index not in proibidos]
        vivas = duras - set(quinas)
        antes = len(bm.faces)
        bmesh.ops.bevel(
            bm, geom=quinas, offset=LARGURA_CHANFRO, offset_type='WIDTH', segments=SEGMENTOS, profile=0.5,
            affect='EDGES', clamp_overlap=True, loop_slide=True, harden_normals=False,
        )
        arvore = BVHTree.FromBMesh(bm)
        desvios = [arvore.find_nearest(co)[3] for co in originais]
        fora_do_lugar = {i for i, d in enumerate(desvios) if d > DESVIO_MAX}
        if not fora_do_lugar:
            break
        proibidos |= fora_do_lugar
        bm.free()
    else:
        raise SystemExit('o chanfro não coube na forma do original')
    desvio = max(desvios)
    vivas = {e for e in vivas if e.is_valid}
    bmesh.ops.triangulate(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = e not in vivas
    bm.to_mesh(me)
    bm.free()
    base.free()

    mod = obj.modifiers.new('normais', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    mod.weight = 100
    mod.mode = 'FACE_AREA'
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    print(f'{obj.name}: {len(quinas)} quinas com chanfro, {len(vivas)} vivas, {antes} faces -> {len(me.polygons)} triângulos, desvio máximo {desvio:.3f}')

bpy.ops.export_scene.gltf(
    filepath=saida, export_format='GLB', export_extras=True, export_yup=True, export_apply=False,
    export_normals=True, export_texcoords=True, export_materials='EXPORT', export_image_format='NONE',
    export_animations=False, export_draco_mesh_compression_enable=False,
)
