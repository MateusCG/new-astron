"""Amplia 4× a textura de cor de uma nave do original com o Real-ESRGAN (IA, local).

A textura sai do glb, ganha uma borda de BORDA pixels que dá a volta (a textura
repete, e sem a borda a IA deixaria uma costura no limite da imagem), passa pelo
`realesrgan-ncnn-vulkan` (roda em qualquer placa com Vulkan, a Iris Xe inclusive:
uns 15 s por textura no modelo `realesrgan-x4plus`) e perde a borda. O PNG que sai
entra em `tools/nave_pbr_texturas.py --cor`, que tira dele os outros mapas.

O executável e os modelos NÃO ficam no repositório: são o zip
`realesrgan-ncnn-vulkan-20220424-ubuntu.zip` da versão v0.2.5.0 do Real-ESRGAN
(github.com/xinntao/Real-ESRGAN/releases), extraído numa pasta qualquer.

Uso: python3 -I tools/nave_pbr_cor_ia.py <nave.glb> <saida.png> <pasta do realesrgan> [modelo]
"""
import io
import json
import os
import struct
import subprocess
import sys
import tempfile

from PIL import Image

BORDA = 16
FATOR = 4
MODELO = 'realesrgan-x4plus'  # o que ficou melhor nas naves: borda limpa sem mudar a cor

glb, saida, pasta = sys.argv[1:4]
modelo = sys.argv[4] if len(sys.argv) > 4 else MODELO
dados = open(glb, 'rb').read()
tam = struct.unpack_from('<I', dados, 12)[0]
gltf = json.loads(dados[20:20 + tam])
inicio = 20 + tam + 8
tex = gltf['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']
vista = gltf['bufferViews'][gltf['images'][gltf['textures'][tex]['source']]['bufferView']]
original = Image.open(io.BytesIO(dados[inicio + vista.get('byteOffset', 0):][:vista['byteLength']])).convert('RGB')
w, h = original.size
ladrilho = Image.new('RGB', (w * 3, h * 3))
for y in range(3):
    for x in range(3):
        ladrilho.paste(original, (x * w, y * h))
with tempfile.TemporaryDirectory() as tmp:
    entrada, ampliada = os.path.join(tmp, 'entrada.png'), os.path.join(tmp, 'ampliada.png')
    ladrilho.crop((w - BORDA, h - BORDA, 2 * w + BORDA, 2 * h + BORDA)).save(entrada)
    # O executável acha os modelos na pasta `models` ao lado dele.
    subprocess.run([os.path.join(os.path.abspath(pasta), 'realesrgan-ncnn-vulkan'), '-i', entrada, '-o', ampliada, '-n', modelo, '-s', str(FATOR)], check=True, cwd=pasta, capture_output=True)
    b = BORDA * FATOR
    Image.open(ampliada).convert('RGB').crop((b, b, b + w * FATOR, b + h * FATOR)).save(saida)
print(f'{saida}: {w * FATOR} × {h * FATOR}, {modelo}')
