// A primeira coisa que roda no site: no celular (tela-grande-regras.js) mostra a tela
// "Abra numa tela maior" no lugar da abertura e para aqui, sem baixar o jogo; fora
// dele, carrega o jogo (main.js, que monta a abertura).

import { ehCelular, linkDoJogo } from './tela-grande-regras.js';
import { ARTE_ABERTURA } from './abertura-regras.js';

const celular = ehCelular({
  ua: navigator.userAgent,
  pontoFino: matchMedia('(any-pointer: fine)').matches,
  larguraTela: screen.width,
  alturaTela: screen.height,
  busca: location.search,
});

if (celular) mostrarTelaGrande();
else await import('./main.js');

/** Troca a abertura pela tela do celular: a arte, o recado e o link para levar ao computador. */
function mostrarTelaGrande() {
  const el = document.querySelector('#tela-grande');
  document.querySelector('#abertura').hidden = true;
  el.hidden = false;
  const arte = el.querySelector('.arte-tela-grande');
  arte.addEventListener('load', () => arte.classList.add('pronta'), { once: true });
  arte.src = ARTE_ABERTURA;

  const link = linkDoJogo(location.origin);
  el.querySelector('.link-tela-grande').textContent = link.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aviso = el.querySelector('.aviso-tela-grande');
  const avisar = (texto) => {
    aviso.textContent = texto;
  };

  const copiar = el.querySelector('.copiar-tela-grande');
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      avisar('Link copiado. Cole no navegador do computador.');
    } catch {
      avisar(`Não deu para copiar. O endereço é ${link}`);
    }
  });

  // Compartilhar (mandar o link para si mesmo) só onde o navegador sabe.
  const enviar = el.querySelector('.enviar-tela-grande');
  if (typeof navigator.share === 'function') {
    enviar.hidden = false;
    enviar.addEventListener('click', () => {
      navigator.share({ title: 'New AstroN', text: 'Jogar New AstroN no computador', url: link }).catch(() => {});
    });
  }
}
