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
// segue o de antes (ent.drenoTicks, aplicado pelo World).
//
// Sem sorte em nada: o "aleatório" da mira e a chance de desarmar viram regra fixa.

import { DT, HOVER, createBullet, stepBullet, bulletHits, forward } from '../shared/sim.js';
import { WEAPONS, MINA_MAX, CONVERTE_ENERGIA_POR_HP, ESCUDO_EQUIV_HP, golpeDaArma, versaoArma, tirosDoGolpe } from '../shared/armas.js';
import { alvoDoMissil, guiarMissil, escolherAlvo, tiroFilho, alturaNoChao, naArea, yawPara } from './armas.js';

export const INVISIVEL_VISTO_M = 25; // m: invisível a esta distância de um inimigo aparece para ele
export const INVISIVEL_TIRO_S = 0.5; // s: atirar mostra o invisível por este tempo
export const ESPOLETA_FRAC = 0.5; // a carga que não fere abre com inimigo a esta fração da área do que solta
const TICK_HZ = Math.round(1 / DT);
const ticks = (s) => Math.round(s * TICK_HZ);

/** Estados de inimigo que a limpeza (Nova/Canhão Antiparalisia) tira. */
const NA_NAVE_DEBUFF = ['lento', 'emp', 'semTiro', 'trava', 'desgov', 'semRegen', 'cadencia', 'enCara', 'drenoEn'];
const NA_ENT_DEBUFF = ['vulneravel', 'fraco', 'recuo', 'cego'];

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

  /** O jogador está invisível para inimigos agora? */
  invisivel(ent) {
    if (!ent?.vivo || this.st(ent, 'revelado')) return false;
    if (ent.ultimoTiro !== undefined && this.tick - ent.ultimoTiro < ticks(INVISIVEL_TIRO_S)) return false;
    if (this.st(ent, 'invisivel')) return true;
    const s = ent.ship;
    return segurandoTipo(s, 'invisivel');
  }

  // ---------- Disparo ----------

  /** Cria os golpes dos disparos de `ent` (de stepShip ou da IA dos elites). */
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
        this.#mina(f, g, s.x - p.x * 9, s.y, s.z - p.z * 9);
      } else {
        this.#efeitoProprio(ent, g, f);
      }
    }
  }

  /** Quem atirou, como o golpe carrega: id, time, drone, multiplicador do NPC. */
  #fonte(ent) {
    return { id: ent.id, time: ent.time, drone: !!ent.drone, mult: ent.danoMult ?? (ent.drone ? this.world.danoMultDrone : 1) };
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
    });
  }

  /** Quem o golpe pode pegar: inimigos (fogo amigo não) ou, no de suporte, aliados. */
  #candidatos(fonte, g) {
    const vivos = this.world.vivosAgora();
    if (g.inimigo) return vivos.filter((a) => this.ctx.podeAcertar(fonte, a));
    if (g.aliado) return vivos.filter((a) => this.#aliado(fonte, a, false));
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
        // Bateu numa torre B ou numa torreta (sólidas): acaba ali.
        this.#fimDoTiro(b, g, novos);
        return false;
      }
      if (!segue) {
        w.eventos.push({ e: 'fim', bala: b.id, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2) });
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
    if (g.inimigo) return vivos.filter((a) => this.ctx.podeAcertar(b, a));
    if (g.aliado) return vivos.filter((a) => this.#aliado(b, a, false));
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
    const tipoDano = WEAPONS[kind]?.tipoDano;
    const dano = (g.dano ?? 0) * (fonte.mult ?? 1) * (fonte.drone ? 1 : w.multDanoDe(autor, tipoDano));
    const alvos = [];
    if (g.area > 0) {
      for (const a of w.vivosAgora()) if (naArea(a, x, y, z, g.area)) alvos.push(a);
      w.eventos.push({ e: 'explosao', arma: kind, nv: fonte.nivel, p: g.prof, dono: autor, time: fonte.time, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), raio: g.area });
    } else if (direto) alvos.push(direto);
    for (const a of alvos) {
      if (g.inimigo && this.ctx.podeAcertar(como, a)) {
        const ev = { e: 'acerto', kind, x: +a.ship.x.toFixed(2), y: +a.ship.y.toFixed(2), z: +a.ship.z.toFixed(2) };
        if (a === direto && bala !== undefined) ev.bala = bala;
        if (dano > 0 || a === direto) this.ctx.ferir(a, dano, autor, ev, { tipoDano });
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
    for (const ef of g.efeitos) if (ef.alvo === 'inimigo') this.#aplicarInimigo(ef, alvo, autor, fonte);
  }

  #aplicarInimigo(ef, alvo, autor, fonte) {
    const s = alvo.ship;
    switch (ef.tipo) {
      case 'dreno':
      case 'drenoDuplo':
        alvo.drenoTicks = ticks(ef.dur);
        alvo.drenoDono = autor;
        alvo.drenoDps = ef.dps;
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
        this.#por(alvo, 'vulneravel', ef.dur, { k: ef.k, tipoDano: ef.tipoDano });
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

  #efeitosAliado(g, alvo, como) {
    for (const ef of g.efeitos ?? []) {
      if (ef.alvo !== 'aliado') continue;
      if (ef.semProprio && alvo.id === como.owner) continue;
      const s = alvo.ship;
      if (ef.tipo === 'cura') this.#curar(alvo, ef.hp, como.owner);
      else if (ef.tipo === 'curaFrac') this.#curar(alvo, s.maxHp * ef.frac, como.owner);
      else if (ef.tipo === 'curaTempo') this.#por(alvo, 'curaTempo', ef.dur, { hps: ef.hps });
      else if (ef.tipo === 'doaEnergia') s.en = Math.min(s.maxEn, s.en + s.maxEn * ef.frac);
      else if (ef.tipo === 'limpa') limparDebuffs(alvo);
    }
  }

  #curar(alvo, hp, por) {
    const s = alvo.ship;
    if (!alvo.vivo || hp <= 0 || s.hp >= s.maxHp) return;
    const antes = s.hp;
    s.hp = Math.min(s.maxHp, s.hp + hp);
    this.world.eventos.push({ e: 'cura', id: alvo.id, por, hp: Math.round(s.hp - antes), x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2) });
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

  /** Tiros inimigos no raio voltam pelo caminho de onde vieram, agora do rebatedor. */
  #rebater(como, x, z, raio) {
    for (const b of this.world.bullets) {
      if (b.rebatido || !this.#inimigoDe(como, b.time, b.drone)) continue;
      if (Math.hypot(b.x - x, b.z - z) > raio) continue;
      b.vx = -b.vx;
      b.vz = -b.vz;
      b.owner = como.owner;
      b.time = como.time;
      b.drone = false;
      b.alvo = undefined;
      b.atingidos = undefined;
      b.rebatido = true;
    }
  }

  /** Destrói a fração `frac` (as mais perto primeiro) das minas inimigas no raio. */
  #desarmar(como, x, z, raio, frac) {
    const w = this.world;
    const perto = w.minas
      .filter((m) => this.#inimigoDe(como, m.time, m.drone) && Math.hypot(m.x - x, m.z - z) <= raio)
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    const sai = new Set(perto.slice(0, Math.ceil(perto.length * frac)));
    if (!sai.size) return;
    for (const m of sai) w.eventos.push({ e: 'desarmou', id: m.id, x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2) });
    w.minas = w.minas.filter((m) => !sai.has(m));
  }

  /** Dispositivo da própria nave (com tempo): o buff fica na entidade. */
  #efeitoProprio(ent, g, f) {
    const s = ent.ship;
    for (const ef of g.efeitos) {
      if (ef.alvo !== 'proprio' || ef.segurar) continue;
      if (ef.tipo === 'invisivel') this.#por(ent, 'invisivel', ef.dur);
      else if (ef.tipo === 'invulneravel') this.#por(ent, 'invulneravel', ef.dur);
      else if (ef.tipo === 'escudo') this.#por(ent, 'escudo', ef.dur, { hp: s.maxHp * ef.frac });
      else if (ef.tipo === 'resiste') this.#por(ent, `resiste_${ef.tipoDano}`, ef.dur, { frac: ef.frac });
      else if (ef.tipo === 'converte') this.#por(ent, 'converte', ef.dur, { frac: ef.frac });
      else if (ef.tipo === 'regen') this.#por(ent, 'regen', ef.dur, { fracPorS: ef.fracPorS });
    }
    // Atirar revela; ligar a camuflagem não conta como tiro.
    if (g.efeitos.some((e) => e.tipo === 'invisivel')) ent.ultimoTiro = undefined;
    this.world.eventos.push({ e: 'efeito', id: ent.id, kind: f.kind, nv: f.nivel, time: ent.time, x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2) });
  }

  // ---------- Novas ----------

  #nova(f, g, x, y, z) {
    const n = { id: this.#id(), owner: f.id, time: f.time, drone: f.drone, mult: f.mult, kind: f.kind, nivel: f.nivel, g, x, y, z, r: 0, atingidos: new Set() };
    this.novas.push(n);
    this.world.eventos.push({ e: 'nova', id: n.id, dono: f.id, time: f.time, kind: f.kind, nv: f.nivel, p: g.prof, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), raio: g.nova.raio, vel: g.nova.vel });
  }

  #passoNovas(vivos) {
    const w = this.world;
    this.novas = this.novas.filter((n) => {
      const g = n.g;
      n.r = g.nova.vel > 0 ? Math.min(g.nova.raio, n.r + g.nova.vel * DT) : g.nova.raio;
      const como = { owner: n.owner, time: n.time, drone: n.drone };
      const tipoDano = WEAPONS[n.kind]?.tipoDano;
      const dano = (g.dano ?? 0) * (n.mult ?? 1) * (n.drone ? 1 : w.multDanoDe(n.owner, tipoDano));
      for (const a of vivos) {
        if (n.atingidos.has(a.id) || !a.vivo || !naArea(a, n.x, n.y, n.z, n.r)) continue;
        if (g.inimigo && this.ctx.podeAcertar(como, a)) {
          n.atingidos.add(a.id);
          if (dano > 0) this.ctx.ferir(a, dano, n.owner, { e: 'acerto', kind: n.kind, x: +a.ship.x.toFixed(2), y: +a.ship.y.toFixed(2), z: +a.ship.z.toFixed(2) }, { tipoDano });
          if (a.vivo) this.#efeitosInimigo(g, a, n.owner, n);
        } else if (g.aliado && this.#aliado(como, a, true)) {
          n.atingidos.add(a.id);
          this.#efeitosAliado(g, a, como);
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
    if (minhas.length >= MINA_MAX) {
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
        if (g.fim && !m.campo) this.#explodirMina(m, g);
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

  #explodirMina(m, g) {
    const fonte = { owner: m.dono, id: m.id, time: m.time, drone: m.drone, mult: m.mult, kind: m.kind, nivel: m.nivel };
    this.#acerto(fonte, { ...g, area: g.area || g.gatilho }, m.x, m.y + 1.5, m.z, null);
  }

  #acertoCampo(fonte, g, a) {
    const w = this.world;
    const tipoDano = WEAPONS[fonte.kind]?.tipoDano;
    const dano = (g.dano ?? 0) * (fonte.mult ?? 1) * (fonte.drone ? 1 : w.multDanoDe(fonte.owner, tipoDano));
    if (dano > 0) this.ctx.ferir(a, dano, fonte.owner, { e: 'acerto', kind: fonte.kind, x: +a.ship.x.toFixed(2), y: +a.ship.y.toFixed(2), z: +a.ship.z.toFixed(2) }, { tipoDano });
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
        const ef = segurando(s, enc);
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
  modificarDano(alvo, dano, autor, { tipoDano, direto = true } = {}) {
    if (dano <= 0) return 0;
    if (direto && this.st(alvo, 'invulneravel')) return 0;
    const quem = autor !== undefined ? (this.world.players.get(autor) ?? null) : null;
    const fraco = this.st(quem, 'fraco');
    if (fraco) dano *= fraco.mult;
    const vul = this.st(alvo, 'vulneravel');
    if (vul && (!vul.tipoDano || vul.tipoDano === tipoDano)) dano *= 1 + vul.k;
    const res = tipoDano ? this.st(alvo, `resiste_${tipoDano}`) : null;
    if (res) dano *= 1 - res.frac;
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
    if (s.semTiro > 0 || (s.lento > 0 && s.lentoMult === 0) || s.trava > 0) fx.push('para');
    if (s.desgov > 0) fx.push('desg');
    if (s.drenoEn > 0 || s.semRegen > 0) fx.push('energia');
    if (this.st(ent, 'invulneravel')) fx.push('invul');
    if (this.st(ent, 'escudo')?.hp > 0) fx.push('escudo');
    if (this.st(ent, 'vulneravel') || this.st(ent, 'fraco') || this.st(ent, 'recuo')) fx.push('fraco');
    if (this.st(ent, 'regen') || this.st(ent, 'curaTempo') || segurandoTipo(s, 'regen')) fx.push('regen');
    if (segurandoTipo(s, 'acelera')) fx.push('acel');
    if (this.invisivel(ent)) fx.push('inv');
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

/** Tira os debuffs de inimigo (paralisia, lentidão e os outros) de um aliado. */
export function limparDebuffs(ent) {
  const s = ent.ship;
  for (const k of NA_NAVE_DEBUFF) if (s[k] > 0) s[k] = 0;
  ent.drenoTicks = 0;
  if (ent.st) for (const k of NA_ENT_DEBUFF) delete ent.st[k];
}

