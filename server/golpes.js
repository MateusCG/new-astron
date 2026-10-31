// Golpes das armas no servidor: tudo o que sai de um disparo (shared/sim.js
// stepShip) depois que ele sai da nave. Cada FORMA de golpe do catálogo
// (shared/armas.js) é implementada uma vez aqui, e os números vêm da versão da arma:
//
// - Projétil (feixes, metralhadoras, canhões, mísseis, raios, ondas, lâminas,
//   lançadores e as cargas das armadilhas): voa reto ou teleguiado (curva até o
//   alvo travado pela mira, ou o mais perto à frente), acerta inimigo (ou só aliado,
//   nos de suporte), com área no impacto (explosão que pega todos no raio) ou não,
//   atravessa os alvos (guarda quem já pegou) ou some no primeiro, explode no fim da
//   vida e/ou se divide nos subprojéteis no fim (que podem ser outros projéteis, uma
//   nova, uma mina ou um campo). A onda tem o raio de acerto crescendo em voo.
// - Nova: esfera que cresce parada no ponto (a nave, ou onde o projétil acabou) e
//   pega cada alvo uma vez quando a casca passa por ele: dano e debuff nos inimigos,
//   suporte nos aliados, e os especiais (rebater tiros, desarmar minas).
// - Mina: parada no chão; armada, com inimigo no gatilho explode em área ou, se é
//   das que atiram, dispara o subprojétil travado em cada inimigo ao alcance e some.
// - Campo: área parada que fere (e aplica o efeito) a cada intervalo quem está dentro.
// - Efeito: sem projétil, dispositivo na própria nave (invisível, invulnerável,
//   escudo, resistência, conversor, conserto por tempo). Os de segurar a tecla o
//   stepShip liga (s.seg1/seg2) e o passo daqui aplica o que é de HP e invisibilidade.
//
// Efeitos (EFEITOS em shared/armas.js): o que mexe em movimento, tiro ou energia vai
// para a nave (s.lento, s.emp, s.semTiro, s.trava, s.desgov, s.semRegen, s.cadencia,
// s.enCara, s.drenoEn; o stepShip conta e a predição lê pelo `me`); o resto fica na
// entidade (ent.st: nome -> { fim (tick), ... }), só no servidor: vulnerável, fraco,
// recuo, cego, revelado, invisível, invulnerável, escudo, resistência, conversor,
// conserto e cura por tempo. Acertar de novo renova a duração, não soma. Efeito de
// inimigo não pega em quem está protegido (zona segura, nascimento). O dreno de HP
// segue o de antes (ent.drenoTicks, aplicado pelo World); o do original (drenoHp, o
// "Magma damage" do AstroN) marca ent.drenoMagma, que vira o fx 'magma'.
//
// Debuff recebido (como o CChatList::AddCollisionMsg do original): o jogador atingido
// recebe o evento privado {e:'debuff', para, ef, v?, dur?}, com o nome do debuff (ef),
// o valor (v: o que o texto do original mostra, na escala do jogo) e a duração; o
// cliente escreve a linha com o ícone na lista do canto esquerdo. Os que se veem na
// nave (para todos) vão na lista `fx` da entidade (visiveis).
//
// Sem sorte em nada: o "aleatório" da mira e a chance de desarmar viram regra fixa.
//
// Campo de força das bases (CAMPOS_BASE em shared/terrain.js): o tiro para no plano
// (stepBullet; o evento 'fim' leva `campo`, o time dono, para o cliente piscar o campo
// ali), a área não passa de um lado para o outro (naArea), a mira e o teleguiado só
// escolhem alvo do mesmo lado, e a mina ou o campo de arma que cairia do outro lado
// fica embaixo da nave de quem soltou.

import { DT, HOVER, createBullet, stepBullet, bulletHits, forward } from '../shared/sim.js';
import {
  WEAPONS,
  ARMAS,
  MINA_MAX,
  CONVERTE_ENERGIA_POR_HP,
  ESCUDO_EQUIV_HP,
  VULNERAVEL_ZERA,
  golpeDaArma,
  versaoArma,
  tirosDoGolpe,
  escalarDispositivo,
  fatorDispositivo,
  chanceDebuffEletrico,
} from '../shared/armas.js';
import { alvoDoMissil, guiarMissil, escolherAlvo, tiroFilho, alturaNoChao, naArea, yawPara, semCampoNoMeio } from './armas.js';
import { cruzaCampoBase } from '../shared/terrain.js';

export const INVISIVEL_VISTO_M = 25; // m: invisível a esta distância de um inimigo aparece para ele
export const INVISIVEL_TIRO_S = 0.5; // s: atirar mostra o invisível por este tempo
export const ESPOLETA_FRAC = 0.5; // a carga que não fere abre com inimigo a esta fração da área do que solta
const TICK_HZ = Math.round(1 / DT);
const ticks = (s) => Math.round(s * TICK_HZ);

/** Estados de inimigo que a limpeza (Nova/Canhão Antiparalisia) tira. */
const NA_NAVE_DEBUFF = ['lento', 'emp', 'semTiro', 'trava', 'desgov', 'semRegen', 'cadencia', 'enCara', 'drenoEn'];
// Minas e campos ativos de um monstro (as três salvas de 8 armadilhas da Medusa).
export const MINA_MAX_MONSTRO = 24;
const NA_ENT_DEBUFF = ['vulneravel', 'vulneravel_fisico', 'vulneravel_laser', 'vulneravel_eletrico', 'fraco', 'recuo', 'cego', 'descarga'];
// O ícone da descarga de energia (o "E" do míssil do SN-3) fica na nave por isto (s),
// se o golpe não traz duração (a do original, 2 s no míssil do SN-3).
const DESCARGA_ICONE_S = 2;

export class Golpes {
  /**
   * @param {import('./game.js').World} world
   * @param {{ ferir: Function, podeAcertar: Function, protegido: Function }} ctx os
   *   privados do World que os golpes usam (ferir passa por zona segura, status do
   *   piloto, escudo, morte e recompensa).
   */
  constructor(world, ctx) {
    this.world = world;
    this.ctx = ctx;
    this.novas = [];
  }

  get tick() {
    return this.world.tick;
  }

  #id() {
    return this.world.nextId++;
  }

  // ---------- Estados ----------

  /** O estado `nome` da entidade, se ativo (ent.st[nome] com fim no futuro). */
  st(ent, nome) {
    const e = ent?.st?.[nome];
    return e && e.fim > this.tick ? e : null;
  }

  #por(ent, nome, dur, dados = {}) {
    ent.st ??= {};
    const fim = this.tick + ticks(dur);
    const atual = ent.st[nome];
    ent.st[nome] = { ...dados, fim: atual && atual.fim > fim ? atual.fim : fim };
  }

  /** A camuflagem da nave está ligada (pelo tempo ou segurando), revelada ou não? */
  camuflado(ent) {
    if (!ent?.vivo) return false;
    return !!this.st(ent, 'invisivel') || segurandoTipo(ent.ship, 'invisivel');
  }

  /** O jogador está invisível para inimigos agora? */
  invisivel(ent) {
    if (!ent?.vivo || this.st(ent, 'revelado')) return false;
    if (ent.ultimoTiro !== undefined && this.tick - ent.ultimoTiro < ticks(INVISIVEL_TIRO_S)) return false;
    if (this.st(ent, 'invisivel')) return true;
    const s = ent.ship;
    return segurandoTipo(s, 'invisivel');
  }

  // ---------- Disparo ----------

  /** Cria os golpes dos disparos de `ent` (de stepShip). */
  disparar(ent, disparos) {
    if (!disparos.length) return;
    ent.ultimoTiro = this.tick;
    const fonte = this.#fonte(ent);
    for (const d of disparos) {
      const v = versaoArma(d.kind, d.nivel ?? 1);
      if (!v) continue;
      const g = v.golpe;
      const f = { ...fonte, kind: d.kind, nivel: d.nivel ?? 1 };
      const s = ent.ship;
      if (g.forma === 'projetil') {
        const b = createBullet(s, d.kind, this.#id(), ent.id, d.off, d.ang, f.nivel, g);
        this.#prepararTiro(b, f, g, s.yaw + (d.ang ?? 0));
        b.enc = d.enc; // de qual encaixe saiu (o cliente desenha da boca daquela arma)
        this.#lancar(b, g);
      } else if (g.forma === 'nova') {
        this.#nova(f, g, s.x, s.y, s.z);
      } else if (g.forma === 'mina' || g.forma === 'campo') {
        const p = forward(s.yaw);
        let mx = s.x - p.x * 9;
        let mz = s.z - p.z * 9;
        if (cruzaCampoBase(s.x, s.z, mx, mz)) {
          // Cairia do outro lado do campo de força de uma base: fica embaixo da nave.
          mx = s.x;
          mz = s.z;
        }
        this.#mina(f, g, mx, s.y, mz);
      } else {
        this.#efeitoProprio(ent, g, f, d.de);
      }
    }
  }

  /** Quem atirou, como o golpe carrega: id, time, drone, multiplicador do NPC. */
  #fonte(ent) {
    return { id: ent.id, time: ent.time, drone: !!ent.drone, mult: ent.danoMult ?? 1 };
  }

  // ---------- Monstros (server/jungle.js) ----------

  /**
   * Golpe de monstro da jungle: `g` vem montado por server/jungle.js no mesmo formato
   * dos golpes do catálogo (forma, dano, area, efeitos, tiros, vel, vida, guia,
   * nova...), com `tipoDano` e `atq` (o nome do ataque, que vai nos eventos e no
   * snapshot para o cliente desenhar) próprios; `kind` é o tiro de NPC ('laser' ou
   * 'plasma', ou a arma de NPC do original, 'n511080'...). O projétil sai de `ent`
   * no rumo `yaw` (o teleguiado trava em `alvo`; o reto sobe ou desce até a altura
   * dele); `k` é o disparo da rajada (o padrão gira com a varredura, como nas armas do
   * jogador); nova, mina e campo abrem em (x, z).
   */
  golpeDeMonstro(ent, kind, g, { yaw = ent.ship.yaw, alvo = null, x = ent.ship.x, z = ent.ship.z, k = 0 } = {}) {
    ent.ultimoTiro = this.tick;
    const f = { ...this.#fonte(ent), kind, nivel: 1 };
    const s = ent.ship;
    if (g.forma === 'projetil') {
      for (const { off, ang } of tirosDoGolpe(g, k)) {
        const b = tiroFilho(g, this.#id(), s.x, s.y, s.z, yaw, off, ang);
        this.#prepararTiro(b, f, g, yaw + ang);
        if (alvo && g.guia) b.alvo = alvo.id;
        else if (alvo) {
          const d = Math.hypot(alvo.ship.x - b.x, alvo.ship.z - b.z);
          if (d > 1) b.vy = ((alvo.ship.y - b.y) * (g.vel ?? 0)) / d;
        }
        this.#lancar(b, g);
      }
    } else if (g.forma === 'nova') this.#nova(f, g, x, s.y, z);
    else if (g.forma === 'mina' || g.forma === 'campo') {
      // Do outro lado do campo de força de uma base, não abre (o campo segura).
      if (!cruzaCampoBase(s.x, s.z, x, z)) this.#mina(f, g, x, s.y, z);
    }
  }

  /** Completa o tiro com quem atirou, a mira (trava o alvo ou aponta para ele) e o golpe. */
  #prepararTiro(b, f, g, yaw) {
    Object.assign(b, { owner: f.id, kind: f.kind, nivel: f.nivel, drone: f.drone, time: f.time, mult: f.mult, g, nasceu: this.tick });
    if (!g.inimigo) b.dano = 0; // carga e suporte não ferem (nem torre)
    if (g.mira) {
      const alvo = escolherAlvo(g.mira, this.#candidatos(b, g), b.x, b.z, yaw, this.tick + b.id);
      if (alvo && g.guia) b.alvo = alvo.id;
      else if (alvo) {
        // Mira sem curva: o tiro sai apontado para o alvo.
        const vel = Math.hypot(b.vx, b.vz);
        const ny = yawPara(b.x, b.z, alvo.ship.x, alvo.ship.z);
        b.vx = -Math.sin(ny) * vel;
        b.vz = -Math.cos(ny) * vel;
      }
    }
  }

  /** O tiro entra no mundo (ou na lista `novos`, que entra no fim do passo) e vira o evento 'tiro'. */
  #lancar(b, g, novos = this.world.bullets) {
    novos.push(b);
    this.world.eventos.push({
      e: 'tiro',
      id: b.id,
      dono: b.owner,
      kind: b.kind,
      nv: b.nivel,
      p: g.prof,
      x: +b.x.toFixed(2),
      y: +b.y.toFixed(2),
      z: +b.z.toFixed(2),
      vx: +b.vx.toFixed(2),
      vy: +b.vy.toFixed(2),
      vz: +b.vz.toFixed(2),
      vida: +b.vida.toFixed(2),
      ...(b.enc !== undefined ? { enc: b.enc } : {}),
      ...(g.atq ? { atq: g.atq } : {}), // ataque de monstro (server/jungle.js)
    });
  }

  /** Quem o golpe pode pegar: inimigos (fogo amigo não) ou, no de suporte, aliados. */
  #candidatos(fonte, g) {
    const vivos = this.world.vivosAgora();
    // A mira sai de onde está a nave (o tiro nasce no nariz): alvo do outro lado do
    // campo de força de uma base não entra.
    const ox = fonte.ox ?? fonte.x;
    const oz = fonte.oz ?? fonte.z;
    if (g.inimigo) return vivos.filter((a) => this.ctx.podeAcertar(fonte, a) && semCampoNoMeio(a, ox, oz));
    if (g.aliado) return vivos.filter((a) => this.#aliado(fonte, a, false) && semCampoNoMeio(a, ox, oz));
    return [];
  }

  /** `alvo` é aliado de quem atirou (mesmo time, vivo)? comDono: a própria nave conta. */
  #aliado(fonte, alvo, comDono = true) {
    if (!alvo.vivo || alvo.drone || fonte.time === undefined || alvo.time !== fonte.time) return false;
    if (alvo.tipo !== 'jogador') return false;
    return comDono || alvo.id !== (fonte.owner ?? fonte.id);
  }

  // ---------- Passo ----------

  /** Um passo de tudo o que está no ar e no chão. `vivos` = entidades vivas do tick. */
  passo(vivos) {
    this.#passoNovas(vivos); // antes dos tiros: o Rebatedor pega o tiro antes de ele acertar
    this.#passoTiros(vivos);
    this.#passoMinas(vivos);
    this.#passoEstados(vivos);
  }

  #passoTiros(vivos) {
    const w = this.world;
    const novos = [];
    w.bullets = w.bullets.filter((b) => {
      const g = b.g ?? golpeDaArma(b.kind, b.nivel ?? 1, b.prof ?? 0);
      if (g?.guia && this.tick - (b.nasceu ?? 0) >= ticks(g.guia.comeca)) {
        let alvo = b.alvo ? vivos.find((a) => a.id === b.alvo) : null;
        if (!alvo) alvo = alvoDoMissil(b, this.#candidatosDe(b, g, vivos), g.guia);
        guiarMissil(b, alvo, g.guia);
      }
      if (g?.cresce && b.raio < g.cresce.raio) b.raio = Math.min(g.cresce.raio, b.raio + g.cresce.vel * DT);
      const segue = stepBullet(b);
      if (w.objetivos.tiroNaTorre(b) || w.torretas.tiroNaTorreta(b)) {
        // Bateu numa torre de suporte ou numa torreta (sólidas): acaba ali.
        this.#fimDoTiro(b, g, novos);
        return false;
      }
      if (!segue) {
        // `campo`: bateu no campo de força da base desse time (o cliente pisca o campo ali).
        w.eventos.push({ e: 'fim', bala: b.id, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), ...(b.campo !== undefined ? { campo: b.campo } : {}) });
        this.#fimDoTiro(b, g, novos);
        return false;
      }
      if (g && !g.inimigo && !g.aliado && g.divide && this.#espoleta(b, g, vivos)) {
        // Carga que não acerta ninguém (Canhão de Faíscas): abre perto do inimigo.
        this.#fimDoTiro(b, g, novos);
        return false;
      }
      for (const alvo of vivos) {
        if (b.atingidos?.has(alvo.id)) continue;
        const inimigo = (g?.inimigo ?? true) && this.ctx.podeAcertar(b, alvo);
        const aliado = g?.aliado && this.#aliado(b, alvo, false);
        if (!inimigo && !aliado) continue;
        if (!bulletHits(b, alvo.ship)) continue;
        this.#acerto(b, g, b.x, b.y, b.z, alvo, b.id);
        if (!g?.atravessa) return false;
        (b.atingidos ??= new Set()).add(alvo.id);
      }
      return true;
    });
    w.bullets.push(...novos);
  }

  /** Inimigo perto da carga (metade da área do que ela solta, no mínimo o raio dela)? */
  #espoleta(b, g, vivos) {
    const raio = Math.max(b.raio ?? 0, (g.divide.area ?? 0) * ESPOLETA_FRAC);
    return vivos.some((a) => this.ctx.podeAcertar(b, a) && naArea(a, b.x, b.y, b.z, raio));
  }

  #candidatosDe(b, g, vivos) {
    if (g.inimigo) return vivos.filter((a) => this.ctx.podeAcertar(b, a) && semCampoNoMeio(a, b.x, b.z));
    if (g.aliado) return vivos.filter((a) => this.#aliado(b, a, false) && semCampoNoMeio(a, b.x, b.z));
    return [];
  }

  /** O tiro acabou sem acertar ninguém (vida, chão, torre): explode no fim e se divide. */
  #fimDoTiro(b, g, novos) {
    if (!g) return;
    if (g.fim && g.area > 0) this.#acerto(b, g, b.x, b.y, b.z, null);
    if (g.divide) this.#dividir(b, g.divide, novos);
  }

  /** Os subprojéteis do tiro `b` (golpe filho `filho`) nascem onde ele acabou, no rumo dele. */
  #dividir(b, filho, novos) {
    const f = { id: b.owner, time: b.time, drone: b.drone, mult: b.mult, kind: b.kind, nivel: b.nivel };
    if (filho.forma === 'nova') return this.#nova(f, filho, b.x, b.y, b.z);
    if (filho.forma === 'mina' || filho.forma === 'campo') return this.#mina(f, filho, b.x, b.y, b.z);
    const yaw = Math.atan2(-b.vx, -b.vz);
    for (const { off, ang } of tirosDoGolpe(filho, 0)) {
      const t = tiroFilho(filho, this.#id(), b.x, b.y, b.z, yaw, off, ang);
      this.#prepararTiro(t, f, filho, yaw + ang);
      this.#lancar(t, filho, novos); // entra no fim do passo, para não andar neste
    }
  }

  /**
   * O golpe `g` de `fonte` pega no ponto (x, y, z): com área, todos no raio (o
   * `direto` incluso); sem área, só o `direto`. Inimigos levam o dano e os debuffs;
   * aliados, o suporte; os especiais agem em tiros e minas no raio. `bala` = id do
   * tiro que acertou o `direto` (o cliente apaga o desenho dele).
   */
  #acerto(fonte, g, x, y, z, direto, bala) {
    const w = this.world;
    const kind = fonte.kind;
    const como = { owner: fonte.owner ?? fonte.id, time: fonte.time, drone: fonte.drone };
    const autor = como.owner;
    const tipoDano = g.tipoDano ?? WEAPONS[kind]?.tipoDano; // golpe de monstro traz o tipo próprio
    const dano = (g.dano ?? 0) * (fonte.mult ?? 1) * (fonte.drone ? 1 : w.multDanoDe(autor, tipoDano));
    const alvos = [];
    if (g.area > 0) {
      for (const a of w.vivosAgora()) if (naArea(a, x, y, z, g.area)) alvos.push(a);
      w.eventos.push({ e: 'explosao', arma: kind, nv: fonte.nivel, p: g.prof, dono: autor, time: fonte.time, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), raio: g.area, ...(g.atq ? { atq: g.atq } : {}), ...(fonte.expirou ? { expirou: 1 } : {}) });
    } else if (direto) alvos.push(direto);
    for (const a of alvos) {
      if (g.inimigo && this.ctx.podeAcertar(como, a)) {
        const ev = { e: 'acerto', kind, nv: fonte.nivel, p: g.prof, x: +a.ship.x.toFixed(2), y: +a.ship.y.toFixed(2), z: +a.ship.z.toFixed(2), ...(g.atq ? { atq: g.atq } : {}) };
        if (a === direto && bala !== undefined) ev.bala = bala;
        if (dano > 0 || a === direto) this.ctx.ferir(a, dano, autor, ev, { tipoDano, penetrante: !!g.penetrante });
        if (a.vivo) this.#efeitosInimigo(g, a, autor, fonte);
      } else if (g.aliado && this.#aliado(como, a, true)) {
        if (a === direto && bala !== undefined) w.eventos.push({ e: 'fim', bala, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
        this.#efeitosAliado(g, a, como);
      }
    }
    if (g.area > 0 && g.inimigo && dano > 0) w.torretas.area({ id: autor, time: como.time }, x, y, z, g.area, dano, kind);
    this.#especiais(g, como, x, z, g.area);
  }

  // ---------- Efeitos ----------

  #efeitosInimigo(g, alvo, autor, fonte) {
    if (!g.efeitos?.length || this.ctx.protegido(alvo)) return;
    if (!g.efeitos.some((ef) => ef.alvo === 'inimigo')) return;
    if (!this.#debuffPega(alvo, autor, fonte)) return;
    for (const ef of g.efeitos) if (ef.alvo === 'inimigo') this.#aplicarInimigo(ef, alvo, autor, fonte);
  }

  /**
   * O debuff de arma elétrica de bloqueio ou de suporte pega no piloto `alvo`? Como no
   * original (CUnitBeam::ProcessDamage): a chance sai do poder El. dos pontos de quem
   * atirou e da resistência El. de quem leva (chanceDebuffEletrico); de 100 para cima
   * pega sempre. Quando falha, o "MISS" do original na nave de quem resistiu (evento
   * privado 'miss'); o dano já entrou.
   */
  #debuffPega(alvo, autor, fonte) {
    if (alvo.tipo !== 'jogador') return true;
    const quem = this.world.players.get(autor);
    const chance = chanceDebuffEletrico(fonte?.kind, quem?.ship?.fatorEl ?? 1, this.world.resistBruta(alvo, 'eletrico'));
    if (chance === null || chance >= 100) return true;
    if (chance > Math.floor(this.world.rng() * 100)) return true;
    this.world.eventos.push({ e: 'miss', para: alvo.id, id: alvo.id, kind: fonte.kind });
    return false;
  }

  #aplicarInimigo(ef, alvo, autor, fonte) {
    const s = alvo.ship;
    this.#avisar(ef, alvo);
    switch (ef.tipo) {
      case 'dreno':
      case 'drenoDuplo':
        alvo.drenoTicks = ticks(ef.dur);
        alvo.drenoDono = autor;
        alvo.drenoDps = ef.dps;
        alvo.drenoMagma = !!ef.magma;
        alvo.drenoTipo = WEAPONS[fonte?.kind]?.tipoDano; // o poder de quem drena e a resistência do alvo contam
        if (ef.tipo === 'drenoDuplo') {
          s.drenoEn = Math.max(s.drenoEn ?? 0, ef.dur);
          s.drenoEnPs = ef.enPs;
        }
        break;
      case 'drenoEn':
        s.drenoEn = Math.max(s.drenoEn ?? 0, ef.dur);
        s.drenoEnPs = ef.enPs;
        break;
      case 'lento':
        s.lentoMult = s.lento > 0 ? Math.min(s.lentoMult ?? ef.mult, ef.mult) : ef.mult;
        s.lento = Math.max(s.lento || 0, ef.dur);
        break;
      case 'trava':
        s.trava = Math.max(s.trava ?? 0, ef.dur);
        break;
      case 'paralisa':
        s.semTiro = Math.max(s.semTiro ?? 0, ef.dur);
        s.lentoMult = 0;
        s.lento = Math.max(s.lento || 0, ef.dur);
        break;
      case 'semTiro':
        s.semTiro = Math.max(s.semTiro ?? 0, ef.dur);
        break;
      case 'descarga':
        s.en = Math.max(0, s.en * (1 - ef.frac));
        this.#por(alvo, 'descarga', ef.dur || DESCARGA_ICONE_S);
        break;
      case 'roubaEn': {
        const tirado = Math.min(s.en, ef.qtd);
        s.en -= tirado;
        const quem = this.world.players.get(autor);
        if (quem?.vivo) quem.ship.en = Math.min(quem.ship.maxEn, quem.ship.en + tirado * ef.frac);
        break;
      }
      case 'semRegen':
        s.semRegen = Math.max(s.semRegen ?? 0, ef.dur);
        break;
      case 'enCara':
        s.enCaraMult = s.enCara > 0 ? Math.max(s.enCaraMult ?? 1, ef.mult) : ef.mult;
        s.enCara = Math.max(s.enCara ?? 0, ef.dur);
        break;
      case 'cadencia':
        s.cadMult = s.cadencia > 0 ? Math.max(s.cadMult ?? 1, ef.mult) : ef.mult;
        s.cadencia = Math.max(s.cadencia ?? 0, ef.dur);
        break;
      case 'desgoverno':
        s.desgov = Math.max(s.desgov ?? 0, ef.dur);
        break;
      case 'fraco':
        this.#por(alvo, 'fraco', ef.dur, { mult: ef.mult });
        break;
      case 'vulneravel':
        // Um estado por tipo (e um para todos), para o Canhão Amplificador e o Quebra-Resistência não se apagarem.
        this.#por(alvo, ef.tipoDano ? `vulneravel_${ef.tipoDano}` : 'vulneravel', ef.dur, { menos: ef.menos });
        break;
      case 'recuo':
        this.#por(alvo, 'recuo', ef.dur, { frac: ef.frac, dono: autor });
        break;
      case 'cego':
        this.#por(alvo, 'cego', ef.dur);
        break;
      case 'revela':
        if (alvo.st) delete alvo.st.invisivel;
        this.#por(alvo, 'revelado', ef.dur);
        break;
      case 'quebraEscudo':
        // Descarrega na hora a fração do original do escudo do equipamento (sem
        // passar pelo HP). Sem escudo equipado (monstros, minerador, piloto sem
        // escudo), tira a fração equivalente do HP máximo, como antes.
        if (s.maxEscudo > 0) s.escudo = Math.max(0, (s.escudo ?? 0) - (s.maxEscudo * ef.frac) / ESCUDO_EQUIV_HP);
        else this.ctx.ferir(alvo, s.maxHp * ef.frac, autor, null, { direto: false });
        break;
    }
  }

  /**
   * O evento privado do debuff que o jogador `alvo` recebeu (a mensagem do original,
   * CChatList::AddCollisionMsg): nome, valor e duração. Monstro não recebe.
   */
  #avisar(ef, alvo) {
    if (this.world.players.get(alvo.id) !== alvo) return;
    const msg = mensagemDebuff(ef);
    if (msg) this.world.eventos.push({ e: 'debuff', para: alvo.id, ...msg });
  }

  #efeitosAliado(g, alvo, como) {
    for (const ef of g.efeitos ?? []) {
      if (ef.alvo !== 'aliado') continue;
      if (ef.semProprio && alvo.id === como.owner) continue;
      const s = alvo.ship;
      if (ef.tipo === 'cura') this.#curar(alvo, ef.hp, como.owner, como.kind);
      else if (ef.tipo === 'curaFrac') this.#curar(alvo, s.maxHp * ef.frac, como.owner, como.kind);
      else if (ef.tipo === 'curaTempo') this.#por(alvo, 'curaTempo', ef.dur, { hps: ef.hps });
      else if (ef.tipo === 'doaEnergia') s.en = Math.min(s.maxEn, s.en + s.maxEn * ef.frac);
      else if (ef.tipo === 'limpa') limparDebuffs(alvo);
    }
  }

  #curar(alvo, hp, por, kind) {
    const s = alvo.ship;
    if (!alvo.vivo || hp <= 0 || s.hp >= s.maxHp) return;
    const antes = s.hp;
    s.hp = Math.min(s.maxHp, s.hp + hp);
    this.world.eventos.push({ e: 'cura', id: alvo.id, por, ...(kind ? { kind } : {}), hp: Math.round(s.hp - antes), x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2) });
  }

  /** Especiais em volta de (x, z), no raio: rebater tiros inimigos, desarmar minas inimigas. */
  #especiais(g, como, x, z, raio) {
    for (const ef of g.efeitos ?? []) {
      if (ef.alvo !== 'especial') continue;
      const r = raio || ef.raio;
      if (ef.tipo === 'rebate') this.#rebater(como, x, z, r);
      else if (ef.tipo === 'desarma') this.#desarmar(como, x, z, r, ef.frac);
    }
  }

  #inimigoDe(como, time, drone) {
    if (drone) return !como.drone;
    return time === undefined || time !== como.time;
  }

  /**
   * Tiros inimigos no raio saem para fora, do centro do rebatedor para onde cada um
   * está, na mesma velocidade, agora dele: o rumo do original (CGameSocket::
   * LGReflectBullet: a direção vira a do centro até o tiro). O evento 'rebatido' vira o
   * desenho do tiro no cliente, que não prevê a troca.
   */
  #rebater(como, x, z, raio) {
    for (const b of this.world.bullets) {
      if (b.rebatido || !this.#inimigoDe(como, b.time, b.drone)) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d > raio || cruzaCampoBase(x, z, b.x, b.z)) continue;
      const v = Math.hypot(b.vx, b.vz);
      if (d > 1e-6) {
        b.vx = ((b.x - x) / d) * v;
        b.vz = ((b.z - z) / d) * v;
      } else {
        // Em cima do centro: sem para onde sair, volta por onde veio.
        b.vx = -b.vx;
        b.vz = -b.vz;
      }
      b.owner = como.owner;
      b.time = como.time;
      b.drone = false;
      b.alvo = undefined;
      b.atingidos = undefined;
      b.rebatido = true;
      const r2 = (n) => +n.toFixed(2);
      this.world.eventos.push({ e: 'rebatido', bala: b.id, kind: b.kind, dono: como.owner, time: como.time, x: r2(b.x), y: r2(b.y), z: r2(b.z), vx: r2(b.vx), vy: r2(b.vy), vz: r2(b.vz) });
    }
  }

  /** Destrói a fração `frac` (as mais perto primeiro) das minas inimigas no raio. */
  #desarmar(como, x, z, raio, frac) {
    const w = this.world;
    const perto = w.minas
      .filter((m) => this.#inimigoDe(como, m.time, m.drone) && Math.hypot(m.x - x, m.z - z) <= raio && !cruzaCampoBase(x, z, m.x, m.z))
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    const sai = new Set(perto.slice(0, Math.ceil(perto.length * frac)));
    if (!sai.size) return;
    for (const m of sai) w.eventos.push({ e: 'desarmou', id: m.id, x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2) });
    w.minas = w.minas.filter((m) => !sai.has(m));
  }

  /**
   * Dispositivo da própria nave (com tempo): o buff fica na entidade, com o valor e a
   * duração × o poder El. dos pontos do piloto nos elétricos (fatorDispositivo).
   */
  #efeitoProprio(ent, g, f, de) {
    const s = ent.ship;
    const fator = fatorDispositivo(f.kind, s);
    for (const original of g.efeitos) {
      if (original.alvo !== 'proprio' || original.segurar) continue;
      const ef = escalarDispositivo(original, fator);
      if (ef.tipo === 'invisivel') this.#por(ent, 'invisivel', ef.dur);
      else if (ef.tipo === 'invulneravel') this.#por(ent, 'invulneravel', ef.dur);
      else if (ef.tipo === 'escudo') this.#por(ent, 'escudo', ef.dur, { hp: s.maxHp * ef.frac });
      else if (ef.tipo === 'resiste') this.#por(ent, `resiste_${ef.tipoDano}`, ef.dur, { frac: ef.frac, modo: ef.modo ?? 'pontos' });
      else if (ef.tipo === 'converte') this.#por(ent, 'converte', ef.dur, { frac: ef.frac });
      else if (ef.tipo === 'regen') this.#por(ent, 'regen', ef.dur, { fracPorS: ef.fracPorS });
    }
    // Atirar revela; ligar a camuflagem não conta como tiro.
    if (g.efeitos.some((e) => e.tipo === 'invisivel')) ent.ultimoTiro = undefined;
    // O teleporte leva de onde a nave saltou (ox, oy, oz): o efeito sai lá e aqui.
    const origem = de ? { ox: +de.x.toFixed(2), oy: +de.y.toFixed(2), oz: +de.z.toFixed(2) } : {};
    this.world.eventos.push({ e: 'efeito', id: ent.id, kind: f.kind, nv: f.nivel, time: ent.time, x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), ...origem });
  }

  // ---------- Novas ----------

  #nova(f, g, x, y, z) {
    const n = { id: this.#id(), owner: f.id, time: f.time, drone: f.drone, mult: f.mult, kind: f.kind, nivel: f.nivel, g, x, y, z, r: 0, atingidos: new Set() };
    this.novas.push(n);
    this.world.eventos.push({ e: 'nova', id: n.id, dono: f.id, time: f.time, kind: f.kind, nv: f.nivel, p: g.prof, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), raio: g.nova.raio, vel: g.nova.vel, ...(g.atq ? { atq: g.atq } : {}) });
  }

  #passoNovas(vivos) {
    const w = this.world;
    this.novas = this.novas.filter((n) => {
      const g = n.g;
      n.r = g.nova.vel > 0 ? Math.min(g.nova.raio, n.r + g.nova.vel * DT) : g.nova.raio;
      const como = { owner: n.owner, time: n.time, drone: n.drone };
      const tipoDano = g.tipoDano ?? WEAPONS[n.kind]?.tipoDano;
      const dano = (g.dano ?? 0) * (n.mult ?? 1) * (n.drone ? 1 : w.multDanoDe(n.owner, tipoDano));
      for (const a of vivos) {
        if (n.atingidos.has(a.id) || !a.vivo || !naArea(a, n.x, n.y, n.z, n.r)) continue;
        if (g.inimigo && this.ctx.podeAcertar(como, a)) {
          n.atingidos.add(a.id);
          if (dano > 0) this.ctx.ferir(a, dano, n.owner, { e: 'acerto', kind: n.kind, nv: n.nivel, p: g.prof, x: +a.ship.x.toFixed(2), y: +a.ship.y.toFixed(2), z: +a.ship.z.toFixed(2), ...(g.atq ? { atq: g.atq } : {}) }, { tipoDano });
          if (a.vivo) this.#efeitosInimigo(g, a, n.owner, n);
        } else if (g.aliado && this.#aliado(como, a, true)) {
          n.atingidos.add(a.id);
          // O original cria o impacto da nova em cada aliado que ela pega (a de reparo, a
          // antiparalisia, a doadora de energia): o cliente desenha pelo 'apoio'.
          w.eventos.push({ e: 'apoio', kind: n.kind, nv: n.nivel, p: g.prof, alvo: a.id, por: n.owner, time: n.time, x: +a.ship.x.toFixed(2), y: +a.ship.y.toFixed(2), z: +a.ship.z.toFixed(2) });
          this.#efeitosAliado(g, a, { ...como, kind: n.kind });
        }
      }
      // Torretas inimigas na casca levam o dano uma vez (a casca as pega ao chegar no raio máximo).
      if (n.r >= g.nova.raio && g.inimigo && dano > 0) w.torretas.area({ id: n.owner, time: n.time }, n.x, n.y, n.z, n.r, dano, n.kind);
      this.#especiais(g, como, n.x, n.z, n.r);
      return n.r < g.nova.raio;
    });
  }

  // ---------- Minas e campos ----------

  #mina(f, g, x, y, z) {
    const w = this.world;
    const minhas = w.minas.filter((m) => m.dono === f.id);
    // O teto é do piloto; monstro (não é jogador) solta as do original: a Medusa deixa
    // 8 armadilhas por salva, que duram 30 s.
    if (minhas.length >= (w.players.get(f.id) ? MINA_MAX : MINA_MAX_MONSTRO)) {
      const velha = minhas[0];
      w.minas = w.minas.filter((m) => m !== velha);
    }
    const m = {
      id: this.#id(),
      dono: f.id,
      time: f.time,
      drone: f.drone,
      mult: f.mult,
      kind: f.kind,
      nivel: f.nivel,
      g,
      campo: g.forma === 'campo',
      x,
      z,
      y: alturaNoChao(x, z, y),
      armaTick: this.tick + ticks(g.armaS ?? 0),
      fimTick: this.tick + Math.max(1, ticks(g.vida)),
      proxDano: 0,
    };
    w.minas.push(m);
    return m;
  }

  #passoMinas(vivos) {
    const w = this.world;
    w.minas = w.minas.filter((m) => {
      const g = m.g ?? golpeDaArma(m.kind, m.nivel, 0);
      if (this.tick >= m.fimTick) {
        if (g.fim && !m.campo) this.#explodirMina(m, g, true);
        return false;
      }
      if (this.tick < m.armaTick) return true;
      const como = { owner: m.dono, time: m.time, drone: m.drone };
      if (m.campo) {
        if (this.tick < m.proxDano) return true;
        m.proxDano = this.tick + Math.max(1, ticks(g.intervalo));
        const fonte = { owner: m.dono, id: m.id, time: m.time, drone: m.drone, mult: m.mult, kind: m.kind, nivel: m.nivel };
        for (const a of vivos) {
          if (!naArea(a, m.x, m.y, m.z, g.area)) continue;
          if ((g.inimigo || g.efeitos.length) && this.ctx.podeAcertar(como, a)) this.#acertoCampo(fonte, g, a);
        }
        return true;
      }
      const perto = vivos.filter((a) => this.ctx.podeAcertar(como, a) && naArea(a, m.x, m.y, m.z, g.gatilho));
      if (!perto.length) return true;
      if (g.dispara) {
        // Mina que atira: um subprojétil travado em cada inimigo ao alcance, e some.
        const alvos = vivos.filter((a) => this.ctx.podeAcertar(como, a) && naArea(a, m.x, m.y, m.z, g.atira));
        const f = { id: m.dono, time: m.time, drone: m.drone, mult: m.mult, kind: m.kind, nivel: m.nivel };
        for (const alvo of alvos) {
          const yaw = yawPara(m.x, m.z, alvo.ship.x, alvo.ship.z);
          // Sai na altura do voo das naves (a mina está no chão).
          const t = tiroFilho(g.dispara, this.#id(), m.x, m.y + HOVER, m.z, yaw);
          this.#prepararTiro(t, f, g.dispara, yaw);
          t.alvo = alvo.id;
          this.#lancar(t, g.dispara);
        }
        w.eventos.push({ e: 'explosao', arma: m.kind, nv: m.nivel, p: g.prof, dono: m.dono, time: m.time, x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), raio: 0, mina: m.id });
        return false;
      }
      this.#explodirMina(m, g);
      return false;
    });
  }

  /** A mina explode: pisaram nela ou (`expirou`) a vida acabou (o evento 'explosao' leva `expirou`). */
  #explodirMina(m, g, expirou = false) {
    const fonte = { owner: m.dono, id: m.id, time: m.time, drone: m.drone, mult: m.mult, kind: m.kind, nivel: m.nivel, expirou };
    this.#acerto(fonte, { ...g, area: g.area || g.gatilho }, m.x, m.y + 1.5, m.z, null);
  }

  #acertoCampo(fonte, g, a) {
    const w = this.world;
    const tipoDano = g.tipoDano ?? WEAPONS[fonte.kind]?.tipoDano;
    const dano = (g.dano ?? 0) * (fonte.mult ?? 1) * (fonte.drone ? 1 : w.multDanoDe(fonte.owner, tipoDano));
    if (dano > 0) this.ctx.ferir(a, dano, fonte.owner, { e: 'acerto', kind: fonte.kind, nv: fonte.nivel, p: g.prof, x: +a.ship.x.toFixed(2), y: +a.ship.y.toFixed(2), z: +a.ship.z.toFixed(2), ...(g.atq ? { atq: g.atq } : {}) }, { tipoDano });
    if (a.vivo) this.#efeitosInimigo(g, a, fonte.owner, fonte);
  }

  // ---------- Estados por tick ----------

  /** Conserto e cura por tempo, e o que as armas de segurar fazem no HP. */
  #passoEstados(vivos) {
    for (const ent of vivos) {
      const s = ent.ship;
      let hps = 0;
      const regen = this.st(ent, 'regen');
      if (regen) hps += s.maxHp * regen.fracPorS;
      const cura = this.st(ent, 'curaTempo');
      if (cura) hps += cura.hps;
      let custo = 0;
      for (const enc of [0, 1]) {
        const ef = escalarDispositivo(segurando(s, enc), fatorDispositivo(enc ? ARMAS[s.seg2] : ARMAS[s.seg1], s));
        if (ef?.tipo === 'regen') hps += s.maxHp * ef.fracPorS;
        custo += versaoSeg(s, enc)?.hpPorS ?? 0; // Arrancada, Amplificador e Reparador Bellico gastam HP
      }
      if (hps > 0 && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + hps * DT);
      // O custo em HP das armas de segurar não mata: para em 1.
      if (custo > 0) s.hp = Math.max(Math.min(s.hp, 1), s.hp - custo * DT);
      if (ent.st && this.tick % TICK_HZ === 0) {
        for (const [k, e] of Object.entries(ent.st)) if (!(e.fim > this.tick)) delete ent.st[k];
      }
    }
  }

  // ---------- Dano ----------

  /**
   * Dano final de um golpe em `alvo` vindo de `autor`, com os estados dos dois:
   * invulnerável (só dano direto), fraco (de quem bate), vulnerável e resistência
   * (por tipo de dano), escudo (absorve primeiro) e conversor (parte vira cura,
   * gastando energia). O recuo devolve a quem bateu uma parte do dano que ele
   * causou. Chamado pelo World em todo dano.
   */
  modificarDano(alvo, dano, autor, { tipoDano, direto = true, penetrante = false } = {}) {
    if (dano <= 0) return 0;
    if (direto && this.st(alvo, 'invulneravel')) return 0;
    const quem = autor !== undefined ? (this.world.players.get(autor) ?? null) : null;
    const fraco = this.st(quem, 'fraco');
    if (fraco) dano *= fraco.mult;
    const escudo = this.st(alvo, 'escudo');
    if (escudo && escudo.hp > 0) {
      const absorve = Math.min(escudo.hp, dano);
      escudo.hp -= absorve;
      dano -= absorve;
    }
    const conv = this.st(alvo, 'converte');
    if (conv && dano > 0) {
      const s = alvo.ship;
      const parte = dano * conv.frac;
      const gasto = parte * CONVERTE_ENERGIA_POR_HP;
      if (s.en >= gasto) {
        s.en -= gasto;
        dano -= parte;
      }
    }
    const recuo = this.st(quem, 'recuo');
    if (recuo && quem?.vivo && direto && dano > 0) this.ctx.ferir(quem, dano * recuo.frac, recuo.dono, null, { direto: false });
    return dano;
  }

  /**
   * Quanto da resistência do alvo ao tipo os debuffs de quebra tiram agora (0 a 1),
   * como no original: o Canhão Amplificador e o de Choque zeram a do tipo deles, o
   * Quebra-Resistência tira os pontos dele de todas, e o campo do SN-4 zera todas.
   * Vale para a resistência do equipamento e para a das armas de dispositivo.
   */
  /**
   * Resistência ao tipo que as armas de dispositivo dão agora: { pontos, pct } (frações).
   * O Disjuntor (e o de Ph.) soma pontos; a Tenda de Luz, um % da resistência que a nave
   * já tem (World#resistEfetiva).
   */
  resistArma(alvo, tipoDano) {
    const e = tipoDano ? this.st(alvo, `resiste_${tipoDano}`) : null;
    if (!e) return { pontos: 0, pct: 0 };
    return e.modo === 'pct' ? { pontos: 0, pct: e.frac } : { pontos: e.frac, pct: 0 };
  }

  /** O tipo está zerado agora (o Canhão de Choque, o Amplificador: o estado que zera)? */
  resistZerada(alvo, tipoDano) {
    return (this.st(alvo, `vulneravel_${tipoDano}`)?.menos ?? 0) >= VULNERAVEL_ZERA;
  }

  resistQuebrada(alvo, tipoDano) {
    const todas = this.st(alvo, 'vulneravel')?.menos ?? 0;
    const doTipo = tipoDano ? (this.st(alvo, `vulneravel_${tipoDano}`)?.menos ?? 0) : 0;
    return Math.min(1, todas + doTipo);
  }

  /** Estados para o snapshot de quem é o dono (s restantes), para o HUD. */
  paraMe(ent) {
    const out = {};
    for (const k of ['cego', 'invisivel', 'revelado', 'invulneravel', 'escudo', 'converte', 'regen', 'fraco', 'vulneravel', 'recuo', 'curaTempo']) {
      const e = this.st(ent, k);
      if (e) out[k] = +((e.fim - this.tick) * DT).toFixed(1);
    }
    for (const t of ['laser', 'fisico', 'eletrico']) {
      const e = this.st(ent, `resiste_${t}`);
      if (e) out[`resiste_${t}`] = +((e.fim - this.tick) * DT).toFixed(1);
    }
    if (this.invisivel(ent)) out.invisivel = out.invisivel ?? -1;
    return out;
  }

  /** Efeitos visíveis de uma entidade (para todos desenharem): lista curta. */
  visiveis(ent) {
    const fx = [];
    const s = ent.ship;
    // Paralisia de movimento (com ou sem o tiro) é o "LD" do original; só o tiro
    // impedido (a armadilha da Medusa) é a espada proibida.
    if ((s.lento > 0 && s.lentoMult === 0) || s.trava > 0) fx.push('para');
    else if (s.semTiro > 0) fx.push('semTiro');
    if (s.desgov > 0) fx.push('desg');
    if (s.drenoEn > 0 || s.semRegen > 0) fx.push('energia');
    if (this.st(ent, 'descarga')) fx.push('descarga');
    if (ent.drenoTicks > 0 && ent.drenoMagma) fx.push('magma');
    if (this.st(ent, 'invulneravel')) fx.push('invul');
    if (this.st(ent, 'escudo')?.hp > 0) fx.push('escudo');
    if (this.st(ent, 'vulneravel')) fx.push('resist');
    const vulnTipo = ['fisico', 'laser', 'eletrico'].some((t) => this.st(ent, `vulneravel_${t}`));
    if (vulnTipo || this.st(ent, 'fraco') || this.st(ent, 'recuo')) fx.push('fraco');
    // O reparo do escudo (os quanta do original), o conserto de HP com tempo (a aura), o
    // conversor de impacto e as resistências do Disjuntor (o efeito do original na nave).
    if (this.st(ent, 'regen') || segurandoTipo(s, 'regen')) fx.push('escudoRec');
    if (this.st(ent, 'curaTempo')) fx.push('regen');
    if (this.st(ent, 'converte')) fx.push('converte');
    if (this.st(ent, 'resiste_eletrico')) fx.push('resEl');
    if (this.st(ent, 'resiste_laser')) fx.push('resOp');
    if (this.st(ent, 'resiste_fisico')) fx.push('resFis');
    if (segurandoTipo(s, 'acelera')) fx.push('acel');
    // Camuflagem ligada (mesmo revelada: quem a vê, a vê translúcida, como no original).
    if (this.camuflado(ent)) fx.push('inv');
    return fx;
  }

  /** Partida nova ou servidor vazio: nada no ar nem no chão. */
  limpar() {
    this.novas = [];
  }
}


/** Versão da arma de segurar ligada no encaixe `enc` da nave `s` (s.seg1/seg2, no nível do encaixe), ou null. */
function versaoSeg(s, enc) {
  const a = enc ? s.seg2 : s.seg1;
  return a >= 0 ? versaoArma(a, s.nivEnc?.[enc] ?? 1) : null;
}

/** Efeito de segurar ligado no encaixe `enc` da nave `s` (ou null). */
function segurando(s, enc) {
  return versaoSeg(s, enc)?.golpe.efeitos.find((e) => e.segurar) ?? null;
}

/** Algum dos dois encaixes está segurando um efeito do tipo `tipo`? */
function segurandoTipo(s, tipo) {
  return [0, 1].some((enc) => segurando(s, enc)?.tipo === tipo);
}

const um = (x) => Math.round(x * 10) / 10;

/**
 * A mensagem do debuff `ef` (efeito de arma no inimigo) como o original escreve
 * (CChatList::AddCollisionMsg: um texto por código, com o valor e a duração), ou
 * null para o que o original não avisa. `ef` é o nome no protocolo; `v` o número do
 * texto (na escala do jogo) e `dur` em s.
 */
export function mensagemDebuff(ef) {
  const dur = um(ef.dur ?? 0);
  switch (ef.tipo) {
    case 'dreno':
      return ef.magma ? { ef: 'magma', v: um(ef.dps * ef.dur), dur } : null;
    case 'drenoDuplo':
      return { ef: 'drenoDuplo', v: um(ef.dps), dur };
    case 'drenoEn':
      return { ef: 'drenoEn', v: um(ef.enPs), dur };
    case 'lento':
      return ef.mult === 0 ? { ef: 'imovel', dur } : { ef: 'lento', v: um((1 - ef.mult) * 100), dur };
    case 'trava':
      return { ef: 'trava', dur };
    case 'paralisa':
      return { ef: 'paralisa', dur };
    case 'semTiro':
      return { ef: 'semTiro', dur };
    case 'descarga':
      return { ef: 'descarga', v: um(ef.frac * 100) };
    case 'semRegen':
      return { ef: 'semRegen', dur };
    case 'enCara':
      return { ef: 'enCara', v: um((ef.mult - 1) * 100), dur };
    case 'cadencia':
      return { ef: 'cadencia', v: um((ef.mult - 1) * 100), dur };
    case 'desgoverno':
      return { ef: 'desgoverno', dur };
    case 'fraco':
      return { ef: 'fraco', v: um((1 - ef.mult) * 100), dur };
    case 'vulneravel':
      if (!ef.tipoDano) return { ef: 'resist', v: um(ef.menos * 100), dur };
      return { ef: ef.tipoDano === 'fisico' ? 'vulnFisico' : 'vulnLaser', dur };
    case 'cego':
      return { ef: 'cego', dur };
    case 'revela':
      return { ef: 'revela', dur };
    case 'recuo':
      return { ef: 'recuo', v: um(ef.frac * 100), dur };
    default:
      return null;
  }
}

/** Tira os debuffs de inimigo (paralisia, lentidão e os outros) de um aliado. */
export function limparDebuffs(ent) {
  const s = ent.ship;
  for (const k of NA_NAVE_DEBUFF) if (s[k] > 0) s[k] = 0;
  ent.drenoTicks = 0;
  if (ent.st) for (const k of NA_ENT_DEBUFF) delete ent.st[k];
}

