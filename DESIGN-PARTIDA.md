# Partida do New AstroN (desenho do Mateus)

Documento de referência do modo de jogo principal. Toda tarefa de jogabilidade parte daqui; se a regra mudar, este arquivo muda junto (no mesmo PR).

## Resumo

- **Partida de 10 minutos**, **dois times de 3 jogadores**.
- **Vence o time que mais minerou**: o que conta é o minério que os **mineradores** (mini-naves controladas pelo jogo) entregam na base.
- Os jogadores não mineram: eles **protegem os próprios mineradores, destroem os do outro time**, caçam monstros no mundo aberto para ganhar **XP, nível e ouro**, tomam **objetivos** que dão bônus aos mineradores e gastam o ouro na **Evolução** e na **Loja** da base.

## Mapa (vista de cima; -z é "em cima" no desenho)

Escala do desenho: 1 px ≈ 3 m. Retângulo aberto com muralha só na borda.

| Elemento | No desenho | No jogo |
|---|---|---|
| Base de cada time | Círculos verdes em cima e embaixo | `BASES` (x 0, z ±700, raio 200). Nasce, renasce, pousa e conserta ali; zona segura |
| Corredor dos mineradores | Faixa vermelha ligando as bases | `CORREDOR` (x 0, largura 100): estrada por onde os mineradores vão e voltam |
| Minério | Bola azul no centro | `MINERIO` (0, 0, raio 60): depósito de cristais onde os mineradores carregam |
| Entrega | Retângulos azuis nas pontas do corredor | `ENTREGAS`: cada minerador entrega **10 de minério** ao chegar |
| Evolução | Retângulo preto da esquerda em cada base | Plataforma de pouso: **pousado**, abre a tela de evolução |
| Loja | Retângulo preto da direita em cada base | Plataforma de pouso: **pousado**, abre a loja |
| Mundo aberto | Todo o cinza | Monstros para enfrentar (XP, nível, ouro) |
| Objetivos | Pontos brancos A, B, C (três de cada lado, simétricos) | Ver abaixo |

## Mineradores

- Saem da base de cada time de tempos em tempos, vão pelo corredor até o minério, carregam e voltam até a entrega do próprio time: **+10 de minério** para o time por entrega.
- **Podem ser destruídos** pelos jogadores do outro time (o minério que carregavam se perde).
- Melhoráveis na Evolução: **mais mineradores**, mais **durabilidade**, mais **defesa**, mais **velocidade**.

## Objetivos (bônus por tempo para os mineradores do time que tomar)

| Tipo | Como toma | Bônus (exemplo do Mateus) |
|---|---|---|
| **A** | Ficar **pousado 10 s** na marcação | Cada minerador do time minera **+1** de minério por viagem, por 1 minuto |
| **B** | **Destruir a torre** | Mineradores do time **mais rápidos** por 1 minuto |
| **C** | Livre (proposta: derrotar o **guardião** da arena) | A definir (proposta: mineradores com mais durabilidade por 1 minuto) |

Objetivos voltam a ficar disponíveis depois de um tempo (a definir).

## Progressão do jogador

- **XP e nível** ao destruir monstros, mineradores e jogadores inimigos. Começa no nível 1.
- **Ouro** pelas mesmas fontes.
- **Evolução da nave** nos níveis **5, 10 e 15**, pagando ouro: mais durabilidade, mais energia etc.
- **Loja**: comprar e trocar armas, armaduras e itens (as armas do menu Q passam a ser compradas aqui).
- Evolução e Loja só abrem **com a nave pousada** na plataforma do serviço.

## HUD

- **Canto superior direito**: minério de cada time (placar) e o tempo restante da partida.
- Ouro, nível e XP do jogador.
- Fim da partida: tela com o time vencedor.
