// Protótipo "nave mid-poly PBR" (pedido do Mateus, 14/nov/2026): uma nave do original
// com a MESMA forma e o MESMO layout de UV, mas com a malha chanfrada e lisa
// (tools/nave_pbr_malha.py), a textura ampliada e os mapas de relevo, rugosidade,
// metal e emissivo (tools/nave_pbr_texturas.py), para comparar antes e depois
// jogando. Por enquanto só a Cyclone Wing. Os arquivos ficam em
// public/modelos/naves-pbr/, no mesmo caminho da nave em public/modelos/naves/.
//
// Puro (sem DOM nem Three.js) e testado em tests/nave-pbr.test.mjs: quais naves têm
// a versão nova, os arquivos dela e a escolha "antes ou depois" guardada no navegador.

/** Chave do navegador: '0' = a nave do original (antes); qualquer outra coisa, a nova. */
export const CHAVE_NAVE_PBR = 'astron.navePbr';

/** Modelos (o `modelo` de shared/naves.js) que têm a versão mid-poly PBR. */
export const NAVES_PBR = Object.freeze(['modelos/naves/shrewdo/functional/cyclone-wing.glb']);

/** Os quatro mapas de cada nave, pelo sufixo do arquivo. */
export const MAPAS_PBR = Object.freeze(['cor', 'mr', 'normal', 'emissivo']);

/** A nave (o `modelo` do catálogo) tem a versão mid-poly PBR? */
export function temPbr(modelo) {
  return NAVES_PBR.includes(modelo);
}

/** Arquivos da versão PBR de um modelo: `{ glb, cor, mr, normal, emissivo }` (URLs), ou null. */
export function arquivosPbr(modelo) {
  if (!temPbr(modelo)) return null;
  const base = '/' + modelo.replace(/^modelos\/naves\//, 'modelos/naves-pbr/').replace(/\.glb$/, '');
  return { glb: base + '.glb', ...Object.fromEntries(MAPAS_PBR.map((m) => [m, `${base}_${m}.webp`])) };
}

/** A escolha guardada: true = depois (a nave nova, o padrão), false = antes (a do original). */
export function lerNavePbr(storage) {
  try {
    return storage?.getItem(CHAVE_NAVE_PBR) !== '0';
  } catch {
    return true;
  }
}

/** Guarda a escolha (o navegador pode recusar: a escolha vale só nesta página). */
export function guardarNavePbr(storage, ligado) {
  try {
    storage?.setItem(CHAVE_NAVE_PBR, ligado ? '1' : '0');
  } catch {
    /* sem armazenamento: segue com a escolha na memória */
  }
}
