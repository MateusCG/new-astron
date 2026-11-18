// Título, descrição, tags e privacidade de cada plataforma, com os limites delas.
// YouTube (Data API v3): título até 100 caracteres, descrição até 5000 bytes,
// sem "<" nem ">" nos dois; tags somando até 500 caracteres (tag com espaço
// conta as aspas). TikTok: a legenda (title do post_info) até 2200 caracteres.

export const LIMITES = {
  youtubeTitulo: 100,
  youtubeDescricaoBytes: 5000,
  youtubeTags: 500,
  tiktokLegenda: 2200,
};

/** Categoria "Jogos" do YouTube. */
export const CATEGORIA_JOGOS = '20';

export const PRIVACIDADE_YOUTUBE = { privado: 'private', naoListado: 'unlisted', publico: 'public' };
export const PRIVACIDADE_TIKTOK = { privado: 'SELF_ONLY', amigos: 'MUTUAL_FOLLOW_FRIENDS', seguidores: 'FOLLOWER_OF_CREATOR', publico: 'PUBLIC_TO_EVERYONE' };

const semSinais = (s) => String(s ?? '').replace(/[<>]/g, '');

function cortarBytes(texto, max) {
  const buf = Buffer.from(texto, 'utf8');
  if (buf.length <= max) return texto;
  // Corta sem quebrar um caractere de vários bytes no meio.
  let t = buf.subarray(0, max).toString('utf8');
  if (t.endsWith('�')) t = t.slice(0, -1);
  return t;
}

/** Tags do YouTube cabendo nos 500 caracteres (as que não cabem ficam de fora). */
export function tagsYoutube(tags) {
  const fora = [];
  const dentro = [];
  let total = 0;
  for (const bruta of tags) {
    const tag = semSinais(bruta).replace(/^#/, '').trim();
    if (!tag) continue;
    const custo = tag.length + (tag.includes(' ') ? 2 : 0) + (dentro.length ? 1 : 0);
    if (total + custo > LIMITES.youtubeTags) { fora.push(tag); continue; }
    dentro.push(tag);
    total += custo;
  }
  return { tags: dentro, fora };
}

/**
 * O corpo do videos.insert. `ia` liga o aviso de conteúdo sintético
 * (status.containsSyntheticMedia), que o YouTube pede para voz ou imagem
 * realista feita por IA. `agendar` (data ISO) exige privacidade privada:
 * o YouTube publica sozinho na hora.
 */
export function metadadosYoutube({ titulo, descricao = '', tags = [], privacidade = 'privado', ia = false, agendar = null }) {
  const title = semSinais(titulo).trim();
  if (!title) throw new Error('O vídeo precisa de --titulo');
  if (title.length > LIMITES.youtubeTitulo) {
    throw new Error(`Título do YouTube com ${title.length} caracteres: o máximo é ${LIMITES.youtubeTitulo}`);
  }
  const privacyStatus = PRIVACIDADE_YOUTUBE[privacidade];
  if (!privacyStatus) throw new Error(`--privacidade do YouTube: ${Object.keys(PRIVACIDADE_YOUTUBE).join(', ')}`);
  const status = { privacyStatus, selfDeclaredMadeForKids: false, containsSyntheticMedia: Boolean(ia) };
  if (agendar) {
    const quando = new Date(agendar);
    if (Number.isNaN(quando.getTime())) throw new Error('--agendar precisa de uma data, ex.: 2026-11-20T18:00:00-03:00');
    status.privacyStatus = 'private';
    status.publishAt = quando.toISOString();
  }
  const t = tagsYoutube(tags);
  return {
    corpo: {
      snippet: {
        title,
        description: cortarBytes(semSinais(descricao), LIMITES.youtubeDescricaoBytes),
        tags: t.tags,
        categoryId: CATEGORIA_JOGOS,
        defaultLanguage: 'pt-BR',
        defaultAudioLanguage: 'pt-BR',
      },
      status,
    },
    tagsFora: t.fora,
  };
}

/** A legenda do TikTok: título, descrição e as tags como hashtags, até 2200. */
export function legendaTiktok({ titulo, descricao = '', tags = [], legenda = null }) {
  if (legenda) return String(legenda).slice(0, LIMITES.tiktokLegenda);
  const hashtags = tags
    .map((t) => '#' + String(t).replace(/^#/, '').replace(/\s+/g, ''))
    .filter((t) => t.length > 1)
    .join(' ');
  const partes = [String(titulo ?? '').trim(), String(descricao ?? '').trim(), hashtags].filter(Boolean);
  return partes.join('\n\n').slice(0, LIMITES.tiktokLegenda);
}
