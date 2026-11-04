// Painel "Última morte" (#ultima-morte), como o resumo da morte do Dota 2 (pedido do
// Mateus, 03/nov/2026): no canto esquerdo, compacto, quem deu o golpe final ("Morto
// por"), quem feriu a nave nos últimos segundos (as fontes, a que mais tirou primeiro,
// com a barrinha dividida pelos tipos de dano) e quanto entrou de cada tipo ("Op.:
// 1000", "Ph.: 700", "El.: 300"). Os números são do servidor (evento privado
// 'resumoMorte', server/resumo-morte.js); aqui só se desenha.
//
// Morta, a nave mostra o painel sozinho até renascer; viva, a tecla H (ou o botão
// "Morte" do HUD) abre e fecha o da última morte. A partida nova apaga o resumo.
// linhasDoResumo é pura (testada em tests/ultima-morte.test.mjs).

import { aoApertar } from './atalhos.js';
import { SIGLA_TIPO } from '../../shared/equipamentos.js';

/** A ordem e o nome de cada tipo no resumo (o `outro` é o golpe sem tipo). */
const TIPOS = ['fisico', 'laser', 'eletrico'];
const NOME_TIPO = { ...SIGLA_TIPO, outro: 'Outros' };

/** O selo ao lado do nome da fonte, pelo tipo da entidade. */
const SELO = { monstro: 'Monstro', escolta: 'Escolta', torreta: 'Torre', nucleo: 'Objetivo', minerador: 'Minerador', campo: 'Base' };

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A fonte como o painel escreve: nome ("Você" se foi a própria nave), o selo (NV do
 * piloto, Monstro, Torre...) e a classe da cor (inimigo, aliado, objetivo, apagado).
 */
function fonteNaTela(f, meuTime, meuId) {
  if (!f) return { nome: 'Desconhecido', selo: '', classe: 'apagado' };
  const nome = f.id !== null && f.id === meuId ? 'Você' : f.nome;
  const selo = f.tipo === 'jogador' ? `NV ${f.nivel ?? 1}` : (SELO[f.tipo] ?? '');
  let classe = 'inimigo';
  if (f.tipo === 'desconhecido') classe = 'apagado';
  else if (f.tipo === 'nucleo') classe = 'objetivo';
  else if (f.time !== undefined && f.time === meuTime && f.tipo !== 'campo') classe = 'aliado';
  return { nome, selo, classe };
}

/**
 * O que o painel mostra de um resumo do servidor: `por` (o golpe final), as `fontes`
 * (com as partes por tipo em fração da maior fonte, para a barrinha), os `tipos` em
 * ordem do maior para o menor (os três sempre; "Outros" só se houver) e o `total`.
 */
export function linhasDoResumo(resumo, meuTime, meuId) {
  const fontes = resumo.fontes ?? [];
  const maior = Math.max(1, ...fontes.map((f) => f.total));
  const tipos = TIPOS.map((tipo) => ({ tipo, sigla: NOME_TIPO[tipo], v: resumo.tipos?.[tipo] ?? 0 }));
  if (resumo.tipos?.outro > 0) tipos.push({ tipo: 'outro', sigla: NOME_TIPO.outro, v: resumo.tipos.outro });
  tipos.sort((a, b) => b.v - a.v);
  return {
    janela: resumo.janela,
    por: fonteNaTela(resumo.por, meuTime, meuId),
    fontes: fontes.map((f) => ({
      ...fonteNaTela(f, meuTime, meuId),
      total: f.total,
      partes: [...TIPOS, 'outro'].filter((t) => f[t] > 0).map((t) => ({ tipo: t, frac: f[t] / maior })),
    })),
    tipos,
    total: resumo.total ?? 0,
  };
}

export class PainelUltimaMorte {
  /** @param {{ meuId: number, meuTime: number, signal: AbortSignal }} opcoes */
  constructor({ meuId, meuTime, signal }) {
    this.meuId = meuId;
    this.meuTime = meuTime;
    this.el = document.querySelector('#ultima-morte');
    this.hud = document.querySelector('#hud');
    this.resumo = null;
    this.vivo = true;
    document.querySelector('#morte-hud')?.addEventListener(
      'click',
      (e) => {
        this.alternar();
        e.currentTarget.blur();
      },
      { signal },
    );
    aoApertar('morte', () => this.alternar(), { signal });
    this.#desenhar();
    this.#mostrar(false); // a sessão anterior (ESC volta à tela inicial) pode ter deixado aberto
  }

  get aberto() {
    return !this.el.hidden;
  }

  alternar() {
    this.#mostrar(!this.aberto);
  }

  /** O resumo da morte que acabou de acontecer (o evento 'resumoMorte'). */
  registrar(resumo) {
    this.resumo = resumo;
    this.#desenhar();
    this.#mostrar(true);
  }

  /** A cada snapshot: morta, o painel fica aberto; ao renascer, fecha sozinho. */
  definirVivo(vivo) {
    if (vivo === this.vivo) return;
    this.vivo = vivo;
    if (!vivo && this.resumo) this.#mostrar(true);
    else if (vivo) this.#mostrar(false);
  }

  /** Partida nova: a morte da partida anterior não conta mais. */
  limpar() {
    this.resumo = null;
    this.#desenhar();
    if (this.vivo) this.#mostrar(false);
  }

  #mostrar(sim) {
    if (!this.el) return;
    this.el.hidden = !sim;
    // A lista dos debuffs desce para baixo do painel (jogo.css, --alto-morte).
    this.hud?.style.setProperty('--alto-morte', `${sim ? this.el.offsetHeight : 0}px`);
  }

  #desenhar() {
    if (!this.el) return;
    const corpo = this.el.querySelector('.corpo');
    if (!this.resumo) {
      corpo.innerHTML = '<p class="vazio">Nenhuma morte nesta partida</p>';
      return;
    }
    const r = linhasDoResumo(this.resumo, this.meuTime, this.meuId);
    const selo = (f) => (f.selo ? `<i class="selo">${esc(f.selo)}</i>` : '');
    const fontes = r.fontes.length
      ? r.fontes
          .map(
            (f) => `<li class="${f.classe}">
              <span class="nome">${esc(f.nome)}</span>${selo(f)}<b class="num">${f.total}</b>
              <span class="barra">${f.partes.map((p) => `<i class="t-${p.tipo}" style="width:${(p.frac * 100).toFixed(1)}%"></i>`).join('')}</span>
            </li>`,
          )
          .join('')
      : '<li class="vazio">Nenhum dano registrado</li>';
    const tipos = r.tipos.map((t) => `<li class="t-${t.tipo}${t.v > 0 ? '' : ' zero'}"><span>${esc(t.sigla)}:</span><b class="num">${t.v}</b></li>`).join('');
    corpo.innerHTML = `
      <p class="morto-por"><span class="rot">Morto por</span><span class="quem ${r.por.classe}">${esc(r.por.nome)}</span>${selo(r.por)}</p>
      <h3>Fontes de dano</h3>
      <ul class="fontes">${fontes}</ul>
      <h3>Danos recebidos<b class="num">${r.total}</b></h3>
      <ul class="tipos">${tipos}</ul>
      <p class="janela">Últimos ${r.janela} s antes da morte</p>`;
    if (this.aberto) this.#mostrar(true);
  }
}
