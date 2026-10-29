// Painel do modo de teste (#painel-teste): só aparece quem entrou com "Modo de
// teste" marcado na tela inicial, num mundo só seu, com a partida sem relógio
// (server/index.js). Os botões pedem ao servidor {t:'teste', acao} ('ouro', 'xp',
// 'nivel', 'nivelMax', 'nucleo': o Núcleo de He-3 volta ao começo, para testar o
// escudo e o reflexo quando quiser): quem dá o ouro e o XP é o servidor, e só no mundo de teste,
// então a regra "nunca aceitar recompensa do cliente" continua valendo na partida
// de verdade. O painel serve para testar a Evolução da nave e a Loja sem jogar uma
// partida inteira.

const TEXTO_OK = {
  ouro: '+1000 ouro (teste)',
  xp: '+100 XP (teste)',
  nivel: 'Subiu um nível (teste)',
  nivelMax: 'Nível máximo (teste)',
  nucleo: 'Núcleo de He-3 resetado: nível 1, escudo cheio (teste)',
};

export class PainelTeste {
  /**
   * @param {{ enviar: (m: object) => void, noticia: (texto: string, tipo?: string) => void, signal: AbortSignal }} opcoes
   */
  constructor({ enviar, noticia, signal }) {
    this.el = document.querySelector('#painel-teste');
    this.noticia = noticia;
    this.el.hidden = false;
    this.el.addEventListener(
      'click',
      (e) => {
        const acao = e.target.closest('[data-acao]')?.dataset.acao;
        if (!acao) return;
        enviar({ t: 'teste', acao });
        e.target.blur(); // o foco no botão não pode prender as teclas do jogo
      },
      { signal },
    );
  }

  /** Resposta do servidor a um pedido de teste. */
  resultado(m) {
    if (m.ok) this.noticia(TEXTO_OK[m.item] ?? 'Feito (teste)', 'bom');
    else this.noticia(m.codigo === 'limite' ? 'Já está no nível máximo' : 'Pedido de teste recusado', 'ruim');
  }

  fechar() {
    this.el.hidden = true;
  }
}
