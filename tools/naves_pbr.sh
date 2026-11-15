#!/usr/bin/env bash
# Refaz as naves de jogador mid-poly PBR (public/modelos/naves/) a partir dos modelos
# do original (tools/dados/naves-original/): a malha chanfrada (nave_pbr_malha.py, no
# Blender), o glb com os nós do original (nave_pbr_montar.mjs) e, para cada imagem da
# nave, a cor ampliada por IA (nave_pbr_cor_ia.py) e os quatro mapas
# (nave_pbr_texturas.py). Passo a passo e o que cada um faz: public/modelos/naves/LISTA.md.
#
# Uso: tools/naves_pbr.sh <pasta do realesrgan> [raça/classe/nave ...]   (sem nave: as 45)
#   PYTHON=<python com numpy, scipy e Pillow>  (padrão: python3)
#   BLENDER=<blender>                           (padrão: blender)
set -euo pipefail
cd "$(dirname "$0")/.."
IA=$(realpath "$1"); shift
PYTHON=${PYTHON:-python3}
BLENDER=${BLENDER:-blender}
ORIGEM=tools/dados/naves-original
DESTINO=public/modelos/naves
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Acabamento da pintura do casco (rugosidade,metal) das naves que fogem do padrão.
declare -A TINTA=( [acron/assault/ulysses]=0.40,0.60 )

if [ $# -eq 0 ]; then
  mapfile -t NAVES < <(cd $ORIGEM && find . -name '*.glb' | sed 's|^\./||; s|\.glb$||' | sort)
else
  NAVES=("$@")
fi

for N in "${NAVES[@]}"; do
  mkdir -p "$(dirname $DESTINO/$N)"
  "$BLENDER" -b --factory-startup --python tools/nave_pbr_malha.py -- $ORIGEM/$N.glb "$TMP/malha.glb" > "$TMP/blender.log" 2>&1 || { tail -5 "$TMP/blender.log"; echo "FALHOU a malha de $N"; exit 1; }
  grep 'quinas com chanfro' "$TMP/blender.log" | sed "s|^|$N  |"
  LINHA=$(node tools/nave_pbr_montar.mjs $ORIGEM/$N.glb "$TMP/malha.glb" $DESTINO/$N.glb)
  echo "$LINHA"
  # A semente do grão é o número da unidade no original (o começo do nome do material: "14_Ulysses_mat0").
  SEMENTE=$(node -e 'const b=require("fs").readFileSync(process.argv[1]);const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));console.log(parseInt(j.materials[0].name)||1)' $ORIGEM/$N.glb)
  for K in $(echo "${LINHA##*imagens }" | tr ',' ' '); do
    SUF=""; [ "$K" != 0 ] && SUF="_$K"
    "$PYTHON" -I tools/nave_pbr_cor_ia.py $ORIGEM/$N.glb "$TMP/cor.png" "$IA" "$K" > /dev/null
    "$PYTHON" -I tools/nave_pbr_texturas.py $ORIGEM/$N.glb "$DESTINO/$N$SUF" --imagem "$K" --semente $((SEMENTE + K)) --cor "$TMP/cor.png" ${TINTA[$N]:+--tinta ${TINTA[$N]}}
  done
done
