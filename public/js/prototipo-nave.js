// Protótipo "nave mid-poly PBR" (nave-pbr-regras.js): a plaquinha "antes e depois".
// Fica no canto direito, no meio da altura, em todas as telas (menu e partida): o
// clique nela, ou a ação `navePbr` (P de fábrica, ligada em main.js), troca as naves do protótipo (Cyclone Wing e Ulysses) entre a nave
// do original (ANTES) e a mid-poly PBR (DEPOIS), na hora, para comparar jogando.
// A escolha fica no navegador. É ferramenta de protótipo: borda tracejada em ouro,
// como o painel do modo de teste.

import { tr } from '../../shared/idioma.js';
import { rotulo } from './atalhos.js';
import { definirNavePbr, navePbrLigada } from './nave.js';

/** Põe a plaquinha na página e devolve a troca (main.js liga na ação `navePbr`). */
export function iniciarPrototipoNave() {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.id = 'prototipo-nave';
  botao.title = tr('Troca a Cyclone Wing e a Ulysses entre a nave do original e a versão mid-poly PBR');
  const pintar = () => {
    const ligado = navePbrLigada();
    botao.classList.toggle('depois', ligado);
    botao.innerHTML = `<small>${tr('Protótipo · Cyclone Wing e Ulysses')}</small><b>${ligado ? tr('DEPOIS · mid-poly PBR') : tr('ANTES · original')}</b><kbd>${rotulo('navePbr') ?? 'P'}</kbd>`;
  };
  const trocar = () => {
    definirNavePbr(!navePbrLigada());
    pintar();
    botao.blur(); // o foco no botão não pode prender as teclas do jogo
  };
  botao.addEventListener('click', trocar);
  pintar();
  document.body.append(botao);
  return trocar;
}
