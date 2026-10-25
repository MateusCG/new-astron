# Propulsão das naves (do AstroN original)

Gerado por `tools/propulsao_do_original.py` (não edite à mão). Os efeitos NG do original: por raça, `normal` (NG001, motores l/r_propulsion em voo), `turbo` (NG002, os mesmos motores no turbo) e `auxiliar` (NG003, nariz c_fire01/02 na ré e pontas das asas l/r_fire01/02 na curva). Peças no espaço do encaixe (eixos dos glb das naves; o efeito sai para +x do encaixe), sem escala; texturas em `texturas/`, com os quadros do ciclo do .MPL em `extras.quadros` de cada material. Desenho aditivo em `public/js/propulsao.js`.

| Arquivo | Efeito do original | Peças | Texturas (quadros) |
|---|---|---|---|
| `acron-normal.glb` | A_NG001 (A_NG001, A_NG001_flare) | tail, flare | 1343007_01; a_ng001_02 |
| `acron-turbo.glb` | A_NG002 (A_NG002, A_NG002.MPL) | Sphere01, Box05 | a_ng003_03 → a_ng003_02 → a_ng003_01; a_ng001_02 |
| `acron-auxiliar.glb` | A_NG003 (A_NG003) | Tail07 (pulsa) | a_ng002 |
| `bellico-normal.glb` | B_NG001 (B_NG001, B_NG001.MPL) | Mesh05, Box03 | b_ng001_001 → b_ng001_002 → b_ng001_003; b_ng001_01 |
| `bellico-turbo.glb` | B_NG002 (B_NG002, B_NG001.MPL) | Mesh06, Sphere01, Box05 | b_ng001_001 → b_ng001_002 → b_ng001_003; b_ng001_01 |
| `bellico-auxiliar.glb` | B_NG003 (B_NG003) | Tail07 (pulsa) | b_ng003 |
| `shrewdo-normal.glb` | S_NG001 (S_NG001, propulsion.MPL) | Mesh05, Box03 | propulsion01 → propulsion02 → propulsion03; propulsion_light |
| `shrewdo-turbo.glb` | S_NG002 (S_NG002, propulsion.MPL) | Mesh06, Sphere01, Box05 | propulsion01 → propulsion02 → propulsion03; propulsion_light |
| `shrewdo-auxiliar.glb` | S_NG003 (S_NG003, propulsion_01.MPL) | Rectangle05 | propulsion04 → propulsion04_02 → propulsion04_03 |
