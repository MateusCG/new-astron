// O index.html no idioma da página (shared/idioma.js): no começo do site, troca cada
// texto e cada title, aria-label, alt e placeholder do HTML pelo do dicionário (a chave
// é o texto com os espaços juntados; os pedaços entre <kbd> e <b> são chaves
// separadas). No português não mexe em nada. O que o JS escreve depois já sai
// traduzido por tr().

import { IDIOMAS, idioma, emIngles, temTraducao, trocarIdioma, tr } from '../../shared/idioma.js';

const ATRIBUTOS = ['title', 'aria-label', 'alt', 'placeholder'];
const PULAR = new Set(['SCRIPT', 'STYLE', 'KBD', 'svg']);

/** Junta os espaços (a chave do dicionário). */
export function chaveDoTexto(texto) {
  return texto.replace(/\s+/g, ' ').trim();
}

function traduzido(texto) {
  const chave = chaveDoTexto(texto);
  if (!chave || !temTraducao(chave)) return null;
  return tr(chave);
}

/** Traduz o HTML de `raiz` (o documento inteiro por padrão) e acerta o `lang`. */
export function traduzirDom(raiz = document.body) {
  document.documentElement.lang = idioma() === 'en' ? 'en' : 'pt-BR';
  if (!emIngles()) return;
  const passar = (no) => {
    if (no.nodeType === 3) {
      const novo = traduzido(no.nodeValue);
      if (novo != null) {
        const [, antes, , depois] = no.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/);
        no.nodeValue = antes + novo + depois;
      }
      return;
    }
    if (no.nodeType !== 1 || PULAR.has(no.nodeName)) return;
    for (const a of ATRIBUTOS) {
      const v = no.getAttribute(a);
      if (v == null) continue;
      const novo = traduzido(v);
      if (novo != null) no.setAttribute(a, novo);
    }
    for (const filho of no.childNodes) passar(filho);
  };
  passar(raiz);
}

/**
 * O seletor de idioma (PT | EN) dentro de `el` (um `.seletor-idioma`): um botão por
 * idioma, o de agora aceso; o clique guarda e recarrega a página no idioma novo.
 */
export function montarSeletorIdioma(el) {
  if (!el) return;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Idioma / Language');
  el.replaceChildren(
    ...IDIOMAS.map((i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.idioma = i.id;
      b.textContent = i.id.toUpperCase();
      b.title = i.nome;
      b.setAttribute('aria-pressed', String(i.id === idioma()));
      b.classList.toggle('sel', i.id === idioma());
      b.addEventListener('click', () => trocarIdioma(i.id));
      return b;
    }),
  );
}

/** Todos os `.seletor-idioma` da página. */
export function montarSeletoresIdioma(raiz = document) {
  for (const el of raiz.querySelectorAll('.seletor-idioma')) montarSeletorIdioma(el);
}
