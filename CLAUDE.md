# CLAUDE.md — New AstroN

MMO de naves 3D no navegador, inspirado no **AstroN** (jogo coreano de celular, inacabado): naves voando baixo por cânions e bases, câmera de perseguição atrás da nave, quatro raças em guerra, upgrade de nave e tuning de equipamento. Repo `MateusCG/new-astron`, do Mateus (que também faz o Sideral: `MateusCG/sideral` e `MateusCG/api-sideral`).

**O modo de jogo (3 contra 3, mineradores, objetivos, evolução e loja) está em `DESIGN-PARTIDA.md`**: toda tarefa de jogabilidade parte dele.

**Antes de mexer em qualquer coisa visual, leia `IDENTIDADE-VISUAL.md`** (paleta, regras do 3D, escala, HUD). Ele é obrigatório e anda junto com o código.

## Estado atual (protótipo)

Um mapa (M1, deserto de cânion) já no formato da partida 3 contra 3 (`DESIGN-PARTIDA.md`): retângulo aberto de 3000 × 2000 m com muralha na borda, mesas de rocha espalhadas (simétricas por rotação de 180°), duas bases de time (`BASES`, neon turquesa na sua e vermelho na do outro), corredor dos mineradores com o minério no meio e as entregas nas pontas, plataformas de Evolução e Loja em cada base (pousar mostra "em breve") e os objetivos A (marcação de pouso), B (torre sólida) e C (arena do guardião). **Partida 3 contra 3** (`server/partida.js`): quem entra cai no time com menos gente (máx. 3 por time; cheio, o servidor recusa com `partida_cheia`), nasce e renasce na base do próprio time voltado para o corredor, sem fogo amigo (tiro de aliado atravessa aliado e os mineradores aliados); pouso no anel e nos serviços só na base do próprio time (`pousoPermitido` em `shared/sim.js`, que lê `s.time`); a zona segura só protege o time dono da base (na base do outro time você leva dano; drones e Vorax continuam fora das duas). Partida de 10 minutos (`DURACAO_PARTIDA_S`), com cronômetro que começa quando entra o primeiro jogador (servidor vazio volta a esperar e zera tudo); no fim, vence quem tem mais minério (empate possível), todos veem a tela de resultado por `INTERVALO_FIM_S` e começa outra partida com placar, bônus e mineradores zerados e todo mundo de volta à base. **Mineradores** (`server/mineradores.js`): mini-naves do servidor que saem da base em intervalos (até 3 por time), seguem `ROTAS[time]` pela faixa da direita até a coroa do minério, mineram alguns segundos, voltam e somam a carga (10) no placar ao passar pela `ENTREGAS[time]`; o outro time pode destruí-los (a carga se perde, quem destrói ganha ouro). Bônus por tempo dos mineradores (`server/bonus.js`: mineração +1, velocidade ×1,4, durabilidade ×1,5), lidos pelos mineradores e mostrados no placar. **Objetivos** (`server/objetivos.js`): A = ficar pousado 10 s na marcação (contestado trava, decolar zera), B = derrubar a torre (sai da física nos dois lados com `definirObstaculoAtivo` e volta depois), C = matar o guardião da arena; cada um liga o bônus ('mineracao', 'velocidade', 'durabilidade') por 60 s para o time de quem tomou e entra em recarga de 90 s; estado sobre a marcação, no minimapa e barra no HUD pousado no A. **XP e nível** (`server/progressao.js`): XP e ouro por abate (`RECOMPENSA` por tipo) e por objetivo, nível 1 a 20 (`xpParaNivel`), +3% de HP máximo por nível, anel de luz ao subir; ouro, XP e nível zeram a cada partida. Monstro elite **Krakor** (`server/elites.js`), raro e territorial, além dos Arnosh e Vorax. HUD com o placar e o tempo no canto superior direito, cores por time (seu time turquesa, o outro vermelho) em rótulos, minimapa e marca de luz nas naves. Voo a 10 m do chão com colisão nas rochas e construções, pouso e decolagem pelo L só dentro das áreas de pouso (`AREAS_POUSO`: anel de cada base, serviços e objetivos A; pousada conserta mais rápido), **duas armas na nave**, uma em cada encaixe (Z e X, sem principal nem secundária; `s.encaixes`, padrão laser simples no Z e plasma no X), escolhidas do mesmo catálogo `ARMAS` (laser simples, duplo, triplo em leque, dreno que tira vida por alguns segundos, criogênico que deixa o alvo lento, plasma, míssil teleguiado que o servidor curva até o inimigo à frente, mina que fica no chão e explode com inimigo perto, onda de choque que fere e empurra em volta, pulso EMP que zera a energia e tira tiro e boost) no menu do Q (Z) e do E (X), a mesma arma pode ir nos dois, recarga por encaixe (`cd1`, `cd2`) e energia uma só; hoje todas liberadas, ver `possuiArma` e `s.armas`, drones inimigos (Arnosh) com IA simples espalhados pelo mundo aberto, seis monstros caçadores (Vorax) que vêm atrás de quem sai da base contornando as rochas, atacam com garra, rondam a borda da zona segura sem entrar e renascem longe ao morrer, ESC volta para a tela inicial, zona segura na base, morte e renascimento, ouro e abates **só em memória** (sem banco, sem conta). Multijogador real por WebSocket.

## Arquitetura

Um processo Node só: serve o cliente (HTTP) e roda o mundo (WebSocket `/ws`). O cliente é ES module puro, **sem build**.

| Caminho | O que é |
|---|---|
| `shared/terrain.js` | Terreno determinístico (`heightAt`, `paredeAt`, `noMapaAberto`) e o contrato do mapa: `MAP_HALF_X/Z`, `BASES` (`BASE` = time 0), `CORREDOR`, `MINERIO`, `ENTREGAS`, `SERVICOS`, `OBJETIVOS`, `ROTAS` dos mineradores, `MESAS`, `AREAS_POUSO`/`areaPouso`. **Servidor e cliente usam o mesmo arquivo.** |
| `shared/obstaculos.js` | Construções sólidas (hangares, portais e antenas das duas bases, cristais do minério, torres dos objetivos B): planta única usada pela física (`alturaSolida`) **e** pelo desenho em `cena.js`. Construção nova entra aqui. Também `pontoAberto(rng)` (onde nascem os monstros do mundo aberto) e `daBase` (planta da base do time 0 girada para o time 1). |
| `shared/sim.js` | Física da nave e dos tiros, raças (`RACES`), catálogo de armas (`WEAPONS`, ordem em `ARMAS`, `ENCAIXE_PADRAO`, `possuiArma`) e os dois encaixes no `stepShip`. **Mesmo arquivo nos dois lados.** |
| `server/game.js` | `World`: jogadores, drones, monstros Vorax, tiros, dano, ouro, eventos e snapshots; ganchos dos módulos da partida (`world.partida`, `world.mineradores`, `world.bonus`). `new World({ duracaoPartidaS, intervaloFimS })` encurta a partida nos testes |
| `server/partida.js` | `Partida`: times (`escolherTime`, `MAX_POR_TIME`), cronômetro (`DURACAO_PARTIDA_S`, `INTERVALO_FIM_S`), placar de minério, vencedor e estado para o snapshot |
| `server/mineradores.js` | `Mineradores`: IA e ciclo dos mineradores (saída, rota, mineração, entrega). Atributos num lugar só: `atributos(time, tick)` junta `MINERADOR`, `melhorias[time]` (para a Evolução) e os bônus |
| `server/bonus.js` | `Bonus`: contrato dos bônus por tempo (`ativar`, `ativo`, `restante`, `paraSnapshot`) e os efeitos em `BONUS` |
| `server/objetivos.js` | `Objetivos`: regras do A (pouso), B (torre) e C (guardião), recarga, ativação dos bônus, `estado()` para o snapshot e `reiniciar()` na partida nova |
| `server/progressao.js` | XP, nível e ouro: `RECOMPENSA` por tipo de abate, `xpParaNivel`, `NIVEL_MAX`, `HP_POR_NIVEL`, `ganharXp`, `recompensar` |
| `server/armas.js` | Geometria das armas que não são projétil reto (só no servidor): curva do míssil (`alvoDoMissil`, `guiarMissil`), mina (`novaMina`) e área (`naArea`); quem fere e empurra é o `World` |
| `server/elites.js` | Monstros elite (Krakor do mundo aberto e o guardião do C): `KRAKOR`, `GUARDIAO`, IA territorial (`iaElite`) |
| `server/navegacao.js` | Grade de navegação dos monstros (300 × 200 células de 10 m, rampa da nave sobre `heightAt`, zona segura das duas bases bloqueada) e Dijkstra com várias fontes até os jogadores caçáveis |
| `server/index.js` | HTTP estático + WebSocket + laço de 30 Hz; `iniciar({ porta, world })` para testes |
| `public/js/main.js` | Laço do cliente: predição, reconciliação, interpolação, câmera |
| `public/js/cena.js` | Céu, terreno, bases (cor relativa ao time: `criarCena({ meuTime })`), corredor, minério, entregas, serviços, objetivos, decoração, luz e poeira |
| `public/js/nave.js` | Modelos das naves (com a marca de luz do time), do minerador, do drone Arnosh e dos monstros Vorax, Krakor e guardião (primitivas low-poly) |
| `public/js/objetivos.js` | `ObjetivosNaTela`: aplica o `obj` do snapshot (torre B fora da física, marcação apagada em recarga) e desenha o rótulo de estado sobre cada objetivo |
| `public/js/placar.js` | Placar dos times, tempo da partida e bônus ativos (`#placar`), e a tela de fim de partida (`#fim-partida`) |
| `public/js/efeitos.js` | Tiros, faíscas, explosões, míssil com rastro (`corrigirGuiados`), minas (`atualizarMinas`), anel de área (`anelArea`) e auras de dreno, gelo e EMP (só visual) |
| `public/js/hud.js`, `controles.js`, `rede.js` | HUD/minimapa/rótulos, teclado + toque, WebSocket |
| `public/js/armas.js` | Menu de armas (`#menu-armas`, um elemento para os dois encaixes: Q / ARMA Z edita o Z, E / ARMA X edita o X): guarda `encaixes`, que vão nos campos `a` e `a2` do comando; `definirPosse` trava o que a nave não possui |
| `tests/*.test.mjs` | `node:test`: simulação, mapa (`mapa.test.mjs`), construções, monstros, servidor, partida (`partida.test.mjs`), mineradores (`mineradores.test.mjs`), XP e Krakor (`progressao.test.mjs`), objetivos (`objetivos.test.mjs`) e as duas armas e as armas novas (`armas.test.mjs`) |

### Regras de rede (não regredir)

- **O servidor é a autoridade.** O cliente manda só comandos `{t:'in', s:seq, th, tu, b, f1, f2, p, a, a2}` (`f1`/`f2` = gatilho do Z/X; `a`/`a2` = arma do encaixe do Z/X, índice em `ARMAS`, sanitizado para a padrão do encaixe se inválido ou não possuído: 0 no Z, 5 no X; efeitos de arma, como dreno, lentidão e EMP, a curva do míssil, as minas e a onda de choque também só o servidor aplica); posição, acerto, dano, morte e ouro saem do servidor. Nunca aceite posição, dano ou recompensa vindos do cliente.
- **Passo fixo de 1/30 s** (`DT`). Cada comando é aplicado uma vez, em ordem; no máximo 4 por tick (`MAX_INPUTS_TICK`), contra acelerar o tempo. Entrada da rede passa por `sanitizeInput`.
- **`shared/` é determinístico:** sem `Math.random`, sem relógio, sem Three.js. Se o cliente e o servidor calcularem diferente, a predição dá tranco e a colisão falha.
- O cliente prevê a própria nave e **reconcilia** com `me` + `ack` do snapshot; as outras naves são desenhadas 120 ms no passado (`INTERP_MS`), interpoladas.
- **Time e partida no protocolo:** o `bemvindo` traz `time` (0 = base de baixo, +z; 1 = base de cima); entrada recusada vem como `{t:'erro', codigo}` (`partida_cheia`). O snapshot traz `time`, `partida` (`{n, estado, restante, placar, vencedor, novaEm}`) e `bonus` (`{0: {mineracao: s}, 1: {}}`, só os ativos); `me.time` vai para a predição do pouso. Entidades de jogador e minerador trazem `time`; minerador (`tipo: 'minerador'`) também `carga` e `minerando`. Eventos novos: `entrega`, `partida`, `fimPartida`; `morte` traz `tipo` e `time`.
- **XP e objetivos no protocolo:** o snapshot traz `nivel`, `xp` (dentro do nível) e `xpProx` (0 no máximo), e `obj` (estado dos seis objetivos: `estado`, `time`, `resta`, e `prog`/`quem`/`falta` no A, `vida` no B e no C). Entidades de jogador trazem `nivel`; `tipo` pode ser `'krakor'` ou `'guardiao'`. Eventos novos: `nivel`, `objetivo` e `acerto` com `torre`. A torre B em recarga está caída: o cliente chama `definirObstaculoAtivo` para a predição bater. Cores no cliente são sempre relativas a `meuTime` (do `bemvindo`).
- **Duas armas no protocolo:** `me` traz `encaixes` ([Z, X]), `cd1`/`cd2`, `armas` (posse) e `emp` (s sem tiro e sem boost; a predição bloqueia igual). O snapshot traz `minas` (`{id, dono, time, x, y, z, armada}`) e `guiados` (mísseis em voo, `{id, x, y, z, vx, vy, vz}`: o cliente não prevê a curva, desenha o míssil, o próprio inclusive, pelo evento `tiro` e corrige por aqui). Entidades trazem `emp`. Eventos novos: `choque` (`{id, time, x, y, z, raio}`), `explosao` (`{arma:'mina', id, dono, time, x, y, z, raio}`) e `acerto` com `arma` (dano em área, sem bala).
- Mudou o protocolo? Atualize o comentário do topo de `server/index.js`.

## Rodar e testar

- `npm install`, depois `npm start` (ou `npm run dev`, que reinicia ao salvar): http://localhost:5090. A porta vem de `PORT`.
- `npm test` roda tudo (`node --test tests/*.test.mjs`), em segundos e sem banco.
- **Mudança visual:** confira com print no navegador (Playwright/Chromium headless), na base, no corredor e no mundo aberto, sem erro no console. Teste não pega cor estourada nem câmera dentro da parede.
- Para abrir vários jogadores, use várias abas. `?servidor=ws://host:porta/ws` aponta o cliente para outro servidor.

## Convenções do código (iguais às do Sideral)

- **Português do Brasil** em tudo: UI, comentários, nomes de domínio (`nave`, `tiro`, `jogador`, `base`), mensagens e commits. Identificadores técnicos em inglês só onde já é assim (`stepShip`, `heightAt`); siga o arquivo.
- ES modules, Node >= 20, **sem framework e sem build**. Dependências de runtime: `three` (versão travada, servida de `node_modules` em `/vendor/`) e `ws`. Não adicione dependência sem necessidade real.
- Comentários explicam o **porquê** e as regras de jogo, em prosa, no topo do arquivo ou do bloco. JSDoc curto nas funções públicas. Não comente o óbvio.
- Números de balanceamento (velocidade, dano, recarga, HP de drone) ficam em constantes nomeadas no topo de `shared/sim.js` ou `server/game.js` (os da partida no topo de `server/partida.js`, `server/mineradores.js` e `server/bonus.js`), nunca soltos no meio da lógica.
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
