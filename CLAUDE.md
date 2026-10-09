# CLAUDE.md — New AstroN

MMO de naves 3D no navegador, inspirado no **AstroN** (jogo coreano de celular, inacabado): naves voando baixo por cânions e bases, câmera de perseguição atrás da nave, quatro raças em guerra, upgrade de nave e tuning de equipamento. Repo `MateusCG/new-astron`, do Mateus (que também faz o Sideral: `MateusCG/sideral` e `MateusCG/api-sideral`).

**Antes de mexer em qualquer coisa visual, leia `IDENTIDADE-VISUAL.md`** (paleta, regras do 3D, escala, HUD). Ele é obrigatório e anda junto com o código.

## Estado atual (protótipo)

Um mapa (M1, cânion do deserto), voo a 10 m do chão com colisão nas paredes, pouso e decolagem pelo L só dentro das áreas de pouso (`AREAS_POUSO`; no M1, o círculo de neon da base; pousada conserta mais rápido), laser (simples ou duplo, trocado no menu de armas do Q) e plasma, drones inimigos (Arnosh) com IA simples, zona segura na base, morte e renascimento, ouro e abates **só em memória** (sem banco, sem conta). Multijogador real por WebSocket.

## Arquitetura

Um processo Node só: serve o cliente (HTTP) e roda o mundo (WebSocket `/ws`). O cliente é ES module puro, **sem build**.

| Caminho | O que é |
|---|---|
| `shared/terrain.js` | Terreno determinístico (`heightAt`, `paredeAt`). **Servidor e cliente usam o mesmo arquivo.** |
| `shared/sim.js` | Física da nave e dos tiros, raças (`RACES`) e armas (`WEAPONS`). **Mesmo arquivo nos dois lados.** |
| `server/game.js` | `World`: jogadores, drones, tiros, dano, ouro, eventos e snapshots |
| `server/index.js` | HTTP estático + WebSocket + laço de 30 Hz; `iniciar({ porta, world })` para testes |
| `public/js/main.js` | Laço do cliente: predição, reconciliação, interpolação, câmera |
| `public/js/cena.js` | Céu, terreno, base, decoração, luz e poeira |
| `public/js/nave.js` | Modelos das naves e do drone (primitivas low-poly) |
| `public/js/efeitos.js` | Tiros, faíscas, explosões (só visual) |
| `public/js/hud.js`, `controles.js`, `rede.js` | HUD/minimapa/rótulos, teclado + toque, WebSocket |
| `public/js/armas.js` | Menu de armas (`#menu-armas`, Q / botão ARMA): guarda a arma principal que vai no campo `a` do comando |
| `tests/*.test.mjs` | `node:test`: simulação, terreno e servidor |

### Regras de rede (não regredir)

- **O servidor é a autoridade.** O cliente manda só comandos `{t:'in', s:seq, th, tu, b, f1, f2, p, a}` (`a` = arma principal, índice em `ARMAS_PRINCIPAIS`, sanitizado para 0 se inválido); posição, acerto, dano, morte e ouro saem do servidor. Nunca aceite posição, dano ou recompensa vindos do cliente.
- **Passo fixo de 1/30 s** (`DT`). Cada comando é aplicado uma vez, em ordem; no máximo 4 por tick (`MAX_INPUTS_TICK`), contra acelerar o tempo. Entrada da rede passa por `sanitizeInput`.
- **`shared/` é determinístico:** sem `Math.random`, sem relógio, sem Three.js. Se o cliente e o servidor calcularem diferente, a predição dá tranco e a colisão falha.
- O cliente prevê a própria nave e **reconcilia** com `me` + `ack` do snapshot; as outras naves são desenhadas 120 ms no passado (`INTERP_MS`), interpoladas.
- Mudou o protocolo? Atualize o comentário do topo de `server/index.js`.

## Rodar e testar

- `npm install`, depois `npm start` (ou `npm run dev`, que reinicia ao salvar): http://localhost:5090. A porta vem de `PORT`.
- `npm test` roda tudo (`node --test tests/*.test.mjs`), em segundos e sem banco.
- **Mudança visual:** confira com print no navegador (Playwright/Chromium headless), na base e no cânion, sem erro no console. Teste não pega cor estourada nem câmera dentro da parede.
- Para abrir vários jogadores, use várias abas. `?servidor=ws://host:porta/ws` aponta o cliente para outro servidor.

## Convenções do código (iguais às do Sideral)

- **Português do Brasil** em tudo: UI, comentários, nomes de domínio (`nave`, `tiro`, `jogador`, `base`), mensagens e commits. Identificadores técnicos em inglês só onde já é assim (`stepShip`, `heightAt`); siga o arquivo.
- ES modules, Node >= 20, **sem framework e sem build**. Dependências de runtime: `three` (versão travada, servida de `node_modules` em `/vendor/`) e `ws`. Não adicione dependência sem necessidade real.
- Comentários explicam o **porquê** e as regras de jogo, em prosa, no topo do arquivo ou do bloco. JSDoc curto nas funções públicas. Não comente o óbvio.
- Números de balanceamento (velocidade, dano, recarga, HP de drone) ficam em constantes nomeadas no topo de `shared/sim.js` ou `server/game.js`, nunca soltos no meio da lógica.
- Mudança de comportamento leva teste. Rode `npm test` antes de dizer que terminou.

## Git

- **Nunca commitar direto na `main`.** O Mateus faz o merge e volta para a `main` entre conversas, então **rode `git branch --show-current` antes de commitar**. Se estiver na `main` (ou numa branch já mergeada), crie `claude/<assunto>` a partir da `main` atualizada.
- Commit: uma linha em português, com **prefixo da área seguido de dois-pontos** e o efeito para quem joga. Ex.: `Voo: boost trava ao zerar a energia até soltar o Shift`, `Cânion: pedras baixas para a nave passar por cima`. Sem ponto final, sem `feat:`/`fix:`. Commits pequenos, um assunto por commit.
- Não há `gh` CLI. O PR se abre por link de compare que o Mateus clica: `https://github.com/MateusCG/new-astron/compare/main...<branch>?expand=1`. Entregue o link no fim.

## Documento de design (de onde vêm as regras do jogo)

Resumo do PPT "Dados Astronest" do Mateus. É a base para as próximas etapas:

- **Raças** (status iniciais em `RACES`): Acron (aquático, arma "Mão de Deus", Ondas Caóticas), Bellico (deserto, guerreiros kamikazes), Shrewdo (terreno, corporações, campo furtivo), Mechan (tóxico, biônicos, droides de restauração).
- **Progressão:** nível 1–100, fama 0–50.000 com títulos (Member 100, Vanguard 300, Warrior 1000, Fighter 2000, Soldier 3000, Elite 5000, Hope 10000, Hero 15000, Idol 20000, Legend 50000), itens nv. 1–10 (tuning), nave X–5X, mapas M1–M10.
- **Títulos com bônus:** ex. War Member (+10 HP), Tuning Specialist (+2% drop), Acron Killer (+20 energia), Missionary (+50 velocidade).
- **Guerras de raça (bônus para a raça vencedora):** Cargo (desconto na loja), Tower (drop de itens), Minner (drop de gold), Invade (todos os status), KeyDisc (sucesso no tuning; 10 min, quem tiver mais discos).
- **Tipos de dano:** Physical, Laser e Electricity. **Minerais:** Argon, Titanium, Lithium, Cesium.
- **No AstroN (vídeos):** classes de nave Assault, Mobile e Functional; NPCs na base (Upgrade Center, Item Deposit, Weapon Shop, Clan Agency); briefing de missão por planeta (M1–M5).

## Próximos passos combinados

Persistência (Postgres, contas) → loja e upgrade de nave → missões PvE com chefe → primeira guerra (KeyDisc) → mais planetas/biomas (ver tabela no guia visual).
