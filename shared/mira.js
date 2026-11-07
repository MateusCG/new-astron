// A mira travada das armas com alvo (pedido do Mateus, 06/nov/2026, pelos vídeos do
// original com o Míssil Paralisante), igual nos dois lados: o servidor trava o tiro da
// nave com ela e o cliente desenha os triângulos verdes no mesmo alvo
// (public/js/mira-alvo.js). Sem relógio e sem sorte (só a `semente` de quem pede).
//
// Como no original (decompilado do libgame_arm64.so):
// - CTarget::GetTargetNumber: a arma com tipo de alvo (coluna da mira: 1 "alvo à
//   frente", 2 "mais perto no raio", 3 "aleatório no raio") monta uma esfera de raio R
//   (o raio da mira) com o centro R metros À FRENTE do nariz: ela encosta na nave e
//   alcança 2R, o "Shooting range" do cartão da arma. Quem encosta nela é candidato
//   (com o raio do alvo: monstro grande entra de mais longe).
// - CPilotManage::GetNearestTarget: entre os candidatos, vale o mais perto da LINHA DO
//   NARIZ (a distância de lado e de altura, não a distância até a nave), nos tipos 1 e
//   2; no 3, um sorteado (GetRandomPilot).
// - CTarget::Run refaz a escolha sozinho, um alvo por encaixe, e o disparo
//   (CMyPilot::FillAttackInfo) usa esse mesmo alvo: o tiro vai em quem a mira mostra.
//
// Aqui o "aleatório" sorteia por tiro no servidor (a `semente`); a mira da tela mostra
// o mais perto da linha do nariz nele também (o cliente não sabe o sorteio).

/**
 * A esfera da mira de quem está em (x, z) olhando para `yaw` (0 olha para -z): o
 * centro (cx, cz) R m à frente e o raio R.
 */
export function esferaDaMira(raio, x, z, yaw) {
  return { cx: x - Math.sin(yaw) * raio, cz: z - Math.cos(yaw) * raio, raio };
}

/**
 * O alvo da mira entre os `candidatos` (objetos com x, z e, se tiver, y e raio; quem
 * chama já tirou aliado, morto e o que não se pode acertar): os que encostam na esfera
 * de raio `mira.raio` à frente do nariz, e deles o mais perto da linha do nariz
 * (empate: o mais perto da nave). `y` é a altura de quem mira (a diferença de altura
 * conta como no original). No modo 'aleatorio_no_raio' com `semente`, um dos que
 * encostam (o índice sai da semente, na ordem dos ids). Sem ninguém, null.
 */
export function alvoDaMira(mira, candidatos, x, z, yaw, { y = null, semente = null } = {}) {
  if (!mira || !(mira.raio > 0)) return null;
  const esfera = esferaDaMira(mira.raio, x, z, yaw);
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const dentro = [];
  for (const c of candidatos) {
    const r = c.raio ?? 0;
    if (Math.hypot(c.x - esfera.cx, c.z - esfera.cz) > esfera.raio + r) continue;
    const dx = c.x - x;
    const dz = c.z - z;
    const lado = dx * fz - dz * fx; // distância até a linha do nariz, no plano
    const alto = y === null || c.y === undefined ? 0 : c.y - y;
    dentro.push({ c, nariz: lado * lado + alto * alto, d: dx * dx + dz * dz });
  }
  if (!dentro.length) return null;
  if (mira.modo === 'aleatorio_no_raio' && semente !== null) {
    dentro.sort((a, b) => (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0));
    return dentro[Math.abs(semente) % dentro.length].c;
  }
  let melhor = dentro[0];
  for (const o of dentro) if (o.nariz < melhor.nariz || (o.nariz === melhor.nariz && o.d < melhor.d)) melhor = o;
  return melhor.c;
}
