# Música

A trilha do jogo, fora dos efeitos do original. Toca pelo canal da música do `public/js/sons.js` (a barra "Música" da janela de volume) por `public/js/musica.js`, num `<audio>` em fluxo (o servidor entrega por intervalo, `Range`), e não pela lista da tela de carregamento: decodificada inteira não caberia na memória.

| Arquivo | Quando | Formato | Loudness |
|---|---|---|---|
| `partida.mp3` | Na partida, do fim da tela de carregamento até sair dela, repetindo (pedido do Mateus, 07/nov/2026) | MP3 48 kHz estéreo 128 kbps, 24 min 02 s | −11,9 LUFS integrada; o jogo toca a −22 (`GANHO_MUSICA`) antes da barra |

Faixa nova: meça a loudness integrada (BS.1770 com o gate) e ponha o número no lugar de `LUFS_MUSICA_PARTIDA`.
