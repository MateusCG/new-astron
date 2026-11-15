// As naves de jogador são mid-poly PBR (pedido do Mateus, 14–15/nov/2026): as 45 do
// original com a MESMA forma e o MESMO layout de UV, a malha chanfrada e lisa, a
// textura de cor ampliada por IA e os mapas de relevo, rugosidade, metal e emissivo
// (public/modelos/naves/LISTA.md; os modelos do original, a fonte dos geradores,
// ficam em tools/dados/naves-original/).
//
// O glb vem sem imagem. Cada material dele se chama `pbr_nave` (a imagem 0 do
// original) ou `pbr_nave_<k>` (a imagem k: as Shrewdo de várias peças têm até 3), e os
// quatro mapas de cada um ficam ao lado do glb: `<nave>[_<k>]_<mapa>.webp`.
//
// Puro (sem DOM nem Three.js) e testado em tests/nave-pbr.test.mjs.

/** Os quatro mapas de cada material, pelo sufixo do arquivo. */
export const MAPAS_PBR = Object.freeze(['cor', 'mr', 'normal', 'emissivo']);

/** Sufixo dos arquivos de um material do glb ('' ou '_<k>'), ou null se não é um `pbr_nave*`. */
export function sufixoDoMaterial(nome) {
  const m = /^pbr_nave(?:_(\d+))?$/.exec(nome ?? '');
  return m ? (m[1] ? `_${m[1]}` : '') : null;
}

/** Os mapas de um material da nave (`url` do glb): `{ cor, mr, normal, emissivo }` (URLs), ou null. */
export function arquivosDoMaterial(url, nome) {
  const sufixo = sufixoDoMaterial(nome);
  if (sufixo === null) return null;
  const base = url.replace(/\.glb$/, '') + sufixo;
  return Object.fromEntries(MAPAS_PBR.map((m) => [m, `${base}_${m}.webp`]));
}
