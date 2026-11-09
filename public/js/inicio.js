// A primeira coisa que roda no site: no celular (tela-grande-regras.js) mostra a tela
// "Abra numa tela maior" no lugar da abertura e para aqui, sem baixar o jogo; fora
// dele, carrega o jogo (main.js, que monta a abertura) e, já antes dele, põe no canto
// da abertura a versão do build no ar (server/versao.js).

import { tr } from '../../shared/idioma.js';
import { traduzirDom, montarSeletoresIdioma } from './idioma-dom.js';
import { ehCelular, linkDoJogo } from './tela-grande-regras.js';
import { ARTE_ABERTURA, ROTA_VERSAO, textoVersao } from './abertura-regras.js';

// O HTML no idioma escolhido antes de qualquer tela aparecer.
traduzirDom();
montarSeletoresIdioma();

const celular = ehCelular({
  ua: navigator.userAgent,
  pontoFino: matchMedia('(any-pointer: fine)').matches,
  larguraTela: screen.width,
  alturaTela: screen.height,
  busca: location.search,
});

if (!celular) mostrarVersao();
if (celular) mostrarTelaGrande();
else await import('./main.js');

/** A versão do build no canto da abertura; sem resposta do servidor, o canto fica vazio. */
function mostrarVersao() {
  const el = document.querySelector('#abertura .versao-abertura');
  fetch(ROTA_VERSAO, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => {
      el.textContent = textoVersao(v);
    })
    .catch(() => {});
}

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
      avisar(tr('Link copiado. Cole no navegador do computador.'));
    } catch {
      avisar(tr('Não deu para copiar. O endereço é {link}', { link }));
    }
  });

  // Compartilhar (mandar o link para si mesmo) só onde o navegador sabe.
  const enviar = el.querySelector('.enviar-tela-grande');
  if (typeof navigator.share === 'function') {
    enviar.hidden = false;
    enviar.addEventListener('click', () => {
      navigator.share({ title: 'New AstroN', text: tr('Jogar New AstroN no computador'), url: link }).catch(() => {});
    });
  }
}
