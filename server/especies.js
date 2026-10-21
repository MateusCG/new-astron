// Espécies de monstro da jungle do Stage 6 (só no servidor; server/jungle.js dá vida
// a elas). Os números vêm da pesquisa da frente Monstros (PESQUISA-MONSTROS.md, seção
// 6), que leu o AstroN original (initnpc.cfg, initunit.cfg, as armas "(NPC)" do
// inititemweapon.cfg) e pôs na escala do jogo pelo PAPEL de cada monstro no mapa:
//
// - acampamento perto da base (4 pequenos): Armish (o de cima) e Chrometic (o de
//   baixo), mesmos números, ataque diferente (pedra física × onda elétrica);
// - acampamento perto do centro (1 grande + 2 pequenos): Grande Xerxes + 2 Xerxes (o
//   de cima: chama de perto, "vem chegando") e Anti + 2 Bazit (o de baixo: tudo de
//   longe), mesma força por papel;
// - buff de ataque: SN-4 (chefe do Stage 5, mísseis teleguiados);
// - chefe épico do poço de baixo: Ancient Medusa (não se teleporta: fica no poço
//   atirando);
// - sonda errante: A-Fly IV (fraca, sem ataque, foge).
//
// A chave (armish, xerxes...) é a `esp` que vai no protocolo (entidade tipo
// 'monstro'); o cliente escolhe o modelo por ela (public/modelos/monstros/<esp>.glb).
//
// Ataques: cada um tem uma `forma`, que server/jungle.js transforma num golpe no
// formato dos golpes das armas (server/golpes.js resolve voo, curva, área, campo e
// efeitos no alvo, sem duplicar nada):
// - 'projetil': tiro reto mirado (adiantado) no alvo; `tiros` lado a lado (vão `vao`
//   m) ou em leque (`leque` rad entre eles); `area` > 0 explode no impacto e no fim da
//   vida; `minimo` = só atira de mais longe que isto (o Xerxes usa a chama de perto);
// - 'guiado': míssil teleguiado travado no alvo, `giro` rad/s de curva (dá para
//   escapar virando forte);
// - 'cone': chama de perto, dano direto em quem está no cone (meia-abertura
//   `abertura` rad, ou a até `area` m do eixo) a cada `intervaloS`;
// - 'nova': onda em volta do monstro até `alcance` m (só com alguém dentro);
// - 'campo': área no chão embaixo do alvo, fere a cada `intervaloCampoS` por `vidaS`.
// `kind` é o tiro de NPC do catálogo ('laser' ou 'plasma'), para quem já desenha
// esses; `atq` é o nome do ataque no protocolo (o cliente desenha cada um do seu
// jeito: ver o comentário do topo de server/index.js). `efeito` vai no alvo (lento,
// desgoverno, sem tiro), com os mesmos efeitos das armas. `peso` (Medusa) é a chance
// de escolher o ataque entre os prontos, do original (pedras 70, controle 40,
// armadilhas 40).

/** Velocidade do original (m/ms) × 1000 × isto = m/s (metade do fator das naves: todo monstro mais lento que qualquer nave). */
export const FATOR_VEL_MONSTRO = 0.25;
/** Território (m) que o monstro não passa: col 7 do initnpc (1000 nos comuns, 700 nos chefes) × 0,25. */
export const TERRITORIO_COMUM = 250;
export const TERRITORIO_CHEFE = 175;

/** Efeitos no alvo (mesmo formato dos efeitos das armas, shared/armas.js). */
const LENTO_30 = { tipo: 'lento', alvo: 'inimigo', mult: 0.7, dur: 2 };
const DESGOVERNO = { tipo: 'desgoverno', alvo: 'inimigo', dur: 1.5 };
const SEM_TIRO = { tipo: 'semTiro', alvo: 'inimigo', dur: 2 };

export const ESPECIES = {
  armish: {
    nome: 'Armish', hp: 160, velocidade: 22, raio: 5, tamanho: 12, xp: 20, ouro: 18,
    ataques: [{ atq: 'pedra', forma: 'projetil', kind: 'plasma', tipoDano: 'fisico', dano: 4, intervaloS: 1.4, alcance: 170, vel: 140 }],
  },
  chrometic: {
    nome: 'Chrometic', hp: 160, velocidade: 22, raio: 5, tamanho: 12, xp: 20, ouro: 18,
    ataques: [{ atq: 'onda_eletrica', forma: 'projetil', kind: 'laser', tipoDano: 'eletrico', dano: 4, intervaloS: 1.4, alcance: 170, vel: 200 }],
  },
  xerxes: {
    nome: 'Xerxes', hp: 240, velocidade: 37, raio: 6, tamanho: 13, xp: 35, ouro: 28,
    ataques: [
      { atq: 'chama', forma: 'cone', tipoDano: 'laser', dano: 1.5, intervaloS: 0.4, alcance: 70, abertura: 0.5 },
      { atq: 'bala_explosiva', forma: 'projetil', kind: 'plasma', tipoDano: 'fisico', dano: 8, intervaloS: 3.5, alcance: 220, minimo: 70, area: 10, vel: 120 },
    ],
  },
  great_xerxes: {
    nome: 'Grande Xerxes', hp: 900, velocidade: 30, raio: 11, tamanho: 26, xp: 90, ouro: 70,
    ataques: [{ atq: 'chama', forma: 'cone', tipoDano: 'laser', dano: 3, intervaloS: 0.4, alcance: 110, abertura: 0.5, area: 15 }],
  },
  bazit: {
    nome: 'Bazit', hp: 240, velocidade: 37, raio: 6, tamanho: 13, xp: 35, ouro: 28,
    ataques: [{ atq: 'feixe_optico', forma: 'projetil', kind: 'laser', tipoDano: 'laser', dano: 2, tiros: 3, vao: 3, intervaloS: 1.6, alcance: 200, vel: 220 }],
  },
  anti: {
    nome: 'Anti', hp: 900, velocidade: 30, raio: 11, tamanho: 26, xp: 90, ouro: 70,
    ataques: [{ atq: 'missil', forma: 'guiado', kind: 'plasma', tipoDano: 'fisico', dano: 5, tiros: 3, leque: 0.25, intervaloS: 2, alcance: 240, vel: 110, giro: 1.2 }],
  },
  sn4: {
    nome: 'SN-4', hp: 2000, velocidade: 15, raio: 26, tamanho: 60, xp: 150, ouro: 100, territorio: TERRITORIO_CHEFE, chefe: true,
    ataques: [
      { atq: 'missil_cruzador', forma: 'guiado', kind: 'plasma', tipoDano: 'fisico', dano: 4, tiros: 4, leque: 0.2, intervaloS: 3, alcance: 320, vel: 120, giro: 2.5 },
      { atq: 'onda_feixe', forma: 'nova', kind: 'laser', tipoDano: 'laser', dano: 25, intervaloS: 8, alcance: 70, velOnda: 140 },
      { atq: 'campo_eletrico', forma: 'campo', kind: 'plasma', tipoDano: 'eletrico', dano: 5, intervaloS: 12, alcance: 200, raioCampo: 20, vidaS: 6, intervaloCampoS: 1, efeito: LENTO_30 },
    ],
  },
  medusa: {
    nome: 'Medusa Anciã', hp: 12000, regenHpS: 10, velocidade: 12, raio: 20, tamanho: 48, alturaCentro: 18,
    xp: 220, ouro: 150, doTime: true, // XP e ouro para CADA piloto do time de quem deu o golpe final
    territorio: TERRITORIO_CHEFE, chefe: true, entreAtaquesS: 1.5,
    ataques: [
      { atq: 'pedra_gigante', peso: 70, forma: 'projetil', kind: 'plasma', tipoDano: 'fisico', dano: 30, tiros: 2, leque: 0.06, intervaloS: 3, alcance: 300, vel: 160, raioTiro: 8 },
      { atq: 'controle', peso: 40, forma: 'projetil', kind: 'laser', tipoDano: 'eletrico', dano: 3, tiros: 10, leque: 0.1, intervaloS: 7, alcance: 250, vel: 200, efeito: DESGOVERNO },
      { atq: 'armadilha', peso: 40, forma: 'guiado', kind: 'plasma', tipoDano: 'eletrico', dano: 10, tiros: 8, leque: 0.35, intervaloS: 12, alcance: 100, vel: 45, giro: 3, efeito: SEM_TIRO },
    ],
  },
  sonda: {
    nome: 'Sonda Errante', hp: 300, velocidade: 30, raio: 4, tamanho: 8, xp: 40, ouro: 35, foge: true,
    ataques: [],
  },
};

/** Maior alcance entre os ataques da espécie (0 sem ataque). */
export function alcanceMaximo(esp) {
  return Math.max(0, ...(ESPECIES[esp]?.ataques ?? []).map((a) => a.alcance));
}
