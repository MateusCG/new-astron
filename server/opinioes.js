// Opiniões dos jogadores no banco (shared/opiniao.js tem o contrato): o cliente manda
// um POST /api/opiniao com o JSON do formulário, o servidor saneia, segura o excesso
// por endereço e grava.
//
// O banco é o Postgres do Railway: com a variável DATABASE_URL (o Railway põe sozinho
// quando o serviço do Postgres está ligado ao do jogo), as opiniões vão para a tabela
// `opinioes`, criada na primeira gravação se não existir. Sem DATABASE_URL (a máquina
// do desenvolvedor, os testes), ficam só na memória do processo, com um aviso no
// console: o jogo funciona igual, só não guarda.
//
// O endereço de quem manda serve só para o limite (OPINIOES_POR_JANELA a cada
// JANELA_OPINIAO_MS) e não vai para o banco: nem conta nem IP, como o resto do jogo.

import { validarOpiniao, OPINIAO_CORPO_MAX } from '../shared/opiniao.js';

/** Quantas opiniões cada endereço manda por janela, contra quem cola o botão. */
export const OPINIOES_POR_JANELA = 5;
export const JANELA_OPINIAO_MS = 10 * 60 * 1000;

// Uma coluna por campo de `validarOpiniao`, na mesma ordem, mais a data e o navegador.
const CAMPOS = ['texto', 'nota', 'categoria', 'origem', 'idioma', 'nome', 'raca', 'classe', 'modo', 'resultado'];
const CRIAR_TABELA = `CREATE TABLE IF NOT EXISTS opinioes (
  id BIGSERIAL PRIMARY KEY,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  texto TEXT NOT NULL,
  nota SMALLINT CHECK (nota BETWEEN 1 AND 5),
  categoria TEXT NOT NULL,
  origem TEXT NOT NULL,
  idioma TEXT,
  nome TEXT,
  raca TEXT,
  classe TEXT,
  modo TEXT,
  resultado TEXT,
  navegador TEXT
)`;

/**
 * Guarda no Postgres. `pool` é um pg.Pool (ou o que tiver `query` e `end`, nos testes).
 */
export class OpinioesNoBanco {
  constructor(pool) {
    this.pool = pool;
    this.pronta = null; // a promessa do CREATE TABLE (uma vez só; falhou, tenta de novo)
    this.persistente = true;
  }

  async #tabela() {
    this.pronta ??= this.pool.query(CRIAR_TABELA).catch((err) => {
      this.pronta = null;
      throw err;
    });
    return this.pronta;
  }

  /** Grava uma opinião já saneada; devolve o id. */
  async gravar(opiniao, navegador = null) {
    await this.#tabela();
    const colunas = [...CAMPOS, 'navegador'];
    const valores = [...CAMPOS.map((c) => opiniao[c] ?? null), navegador];
    const r = await this.pool.query(
      `INSERT INTO opinioes (${colunas.join(', ')}) VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      valores,
    );
    return Number(r.rows[0].id);
  }

  fechar() {
    return this.pool.end();
  }
}

/** Sem banco: guarda na memória do processo (some ao reiniciar). */
export class OpinioesNaMemoria {
  constructor() {
    this.lista = [];
    this.persistente = false;
  }

  async gravar(opiniao, navegador = null) {
    const id = this.lista.length + 1;
    this.lista.push({ id, criadaEm: new Date(), ...opiniao, navegador });
    return id;
  }

  async fechar() {}
}

let avisouMemoria = false; // o aviso sai uma vez por processo (os testes sobem vários servidores)

/**
 * O armazém das opiniões: no Postgres com `url` (DATABASE_URL), senão na memória.
 * @param {{ url?: string }} [opcoes]
 */
export async function criarArmazemOpinioes({ url = process.env.DATABASE_URL } = {}) {
  if (!url) {
    if (!avisouMemoria) console.warn('Opiniões: sem DATABASE_URL, ficam só na memória do servidor (somem ao reiniciar).');
    avisouMemoria = true;
    return new OpinioesNaMemoria();
  }
  const { default: pg } = await import('pg');
  // Poucas conexões: uma opinião é um INSERT de vez em quando. Erro de conexão ociosa
  // (o banco reiniciou) não pode derrubar o processo do jogo.
  const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  pool.on('error', (err) => console.error('Opiniões: erro na conexão com o banco:', err.message));
  return new OpinioesNoBanco(pool);
}

/** Limite por endereço: no máximo `max` envios por `janelaMs`. */
export class LimiteOpinioes {
  constructor({ max = OPINIOES_POR_JANELA, janelaMs = JANELA_OPINIAO_MS, agora = () => Date.now() } = {}) {
    this.max = max;
    this.janelaMs = janelaMs;
    this.agora = agora;
    this.envios = new Map(); // endereço -> [instantes]
  }

  /** Conta o envio e diz se ele pode passar. */
  pode(endereco) {
    const t = this.agora();
    const lista = (this.envios.get(endereco) ?? []).filter((x) => t - x < this.janelaMs);
    // De vez em quando some com os endereços que já saíram da janela.
    if (this.envios.size > 1000) for (const [k, v] of this.envios) if (!v.some((x) => t - x < this.janelaMs)) this.envios.delete(k);
    if (lista.length >= this.max) {
      this.envios.set(endereco, lista);
      return false;
    }
    lista.push(t);
    this.envios.set(endereco, lista);
    return true;
  }
}

/** O endereço de quem pediu: atrás do proxy do Railway, o primeiro do X-Forwarded-For. */
export function enderecoDoPedido(req) {
  const fwd = req.headers['x-forwarded-for'];
  const primeiro = typeof fwd === 'string' ? fwd.split(',')[0].trim() : '';
  return primeiro || req.socket?.remoteAddress || '?';
}

function responder(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

/**
 * Atende o POST /api/opiniao: `{ok: true}` (201) ou `{ok: false, codigo}` com
 * 400 (o de `validarOpiniao` ou 'json'), 405, 413 ('grande'), 415 ('json'),
 * 429 ('muitas') e 503 ('indisponivel': o banco falhou).
 */
export function atenderOpiniao(req, res, { armazem, limite }) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return responder(res, 405, { ok: false, codigo: 'invalido' });
  }
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return responder(res, 415, { ok: false, codigo: 'json' });
  const partes = [];
  let tamanho = 0;
  let grande = false;
  req.on('data', (p) => {
    tamanho += p.length;
    if (tamanho > OPINIAO_CORPO_MAX) grande = true;
    else partes.push(p);
  });
  req.on('end', async () => {
    if (grande) return responder(res, 413, { ok: false, codigo: 'grande' });
    let corpo;
    try {
      corpo = JSON.parse(Buffer.concat(partes).toString('utf8'));
    } catch {
      return responder(res, 400, { ok: false, codigo: 'json' });
    }
    const v = validarOpiniao(corpo);
    if (!v.ok) return responder(res, 400, v);
    // O limite conta só o que ia ser gravado: um texto curto corrigido não gasta envio.
    if (!limite.pode(enderecoDoPedido(req))) return responder(res, 429, { ok: false, codigo: 'muitas' });
    try {
      const navegador = String(req.headers['user-agent'] ?? '').slice(0, 200) || null;
      await armazem.gravar(v.opiniao, navegador);
      responder(res, 201, { ok: true });
    } catch (err) {
      console.error('Opiniões: não gravou:', err.message);
      responder(res, 503, { ok: false, codigo: 'indisponivel' });
    }
  });
  req.on('error', () => res.destroy());
}
