# New AstroN

MMO de naves em 3D que roda no navegador, inspirado no AstroN: você pilota rente ao chão por cânions, com a câmera atrás da nave, e enfrenta drones e outros jogadores.

## Rodar

```bash
npm install
npm start          # http://localhost:5090
npm run dev        # o mesmo, reiniciando ao salvar
npm test
```

Abra duas abas para ver o multijogador.

## Controles

| PC | Celular | Ação |
|---|---|---|
| `W` / `S` (ou setas) | joystick | acelerar / ré |
| `A` / `D` (ou setas) | joystick | girar |
| `Shift` | SHIFT | boost (gasta energia) |
| `Z` ou `Espaço` | Z | atira com a arma do encaixe do Z (padrão: laser simples) |
| `X` | X | atira com a arma do encaixe do X (padrão: plasma) |
| `Q` | ARMA Z | menu de armas do Z |
| `E` | ARMA X | menu de armas do X |
| `L` | POUSAR | pousar / decolar, só no círculo de neon da base (pousada conserta mais rápido) |
| `V` | | distância da câmera |
| `Esc` | | sair da partida e voltar para a tela inicial (troca de nome e raça); com o menu de armas aberto, só fecha o menu |

A nave tem **duas armas**, uma no Z e outra no X, e as duas escolhem do mesmo catálogo: laser simples, laser duplo (2 tiros paralelos), laser triplo (3 em leque), dreno (o alvo perde vida por alguns segundos), criogênico (o alvo fica lento), plasma (lento e pesado), míssil teleguiado (persegue o inimigo à frente), mina (fica no chão atrás da nave e explode quando um inimigo passa), onda de choque (fere e empurra quem está em volta) e pulso EMP (zera a energia do alvo: sem tiro e sem boost por instantes). Pode usar duas diferentes ou a mesma nas duas; cada encaixe tem a sua recarga, mas a energia é uma só. No menu, `1` a `9` e `0` (ou clique/toque) escolhem; com o menu aberto o jogo segue, mas não sai tiro.

## Variáveis de ambiente

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` | `5090` | Porta HTTP/WebSocket |

## Como funciona

O servidor Node é a autoridade: recebe só os comandos de cada jogador e simula o mundo a 30 Hz. O cliente (Three.js, sem build) prevê a própria nave para responder na hora e interpola as outras. Terreno e física ficam em `shared/` e são o mesmo código nos dois lados. Detalhes no `CLAUDE.md`; regras visuais no `IDENTIDADE-VISUAL.md`.

## Deploy

É um processo só (HTTP + WebSocket), então serve em Railway, Render, Fly etc. com `npm start` e a variável `PORT` que a plataforma fornece.
