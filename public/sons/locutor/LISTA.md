# Vozes do locutor

As frases do locutor (First Blood, Double Kill, Godlike…), em inglês, geradas pelo Mateus no ElevenLabs (Eleven v3, voz "mobastron voice") em 04/nov/2026. MP3 44,1 kHz 128 kbps, como o ElevenLabs entrega. Quem toca é `public/js/locutor.js` pelo canal do locutor do `public/js/sons.js` (barra "Locutor" na janela de volume); quando cada uma toca está em `public/js/locutor-regras.js`.

**Volume:** os arquivos vieram cada um num volume (de −6,8 a −11,9 LUFS de loudness momentânea máxima). O jogo põe cada um no degrau dele em `ALVO_POR_SOM` (`public/js/nivel-sons.js`), 1 dB por degrau, para o volume subir junto com a intensidade da fala.

| Arquivo | Quando | Texto sugerido no ElevenLabs | Estabilidade | Degrau |
|---|---|---|---|---|
| `first_blood.mp3` | Primeiro abate de jogador da partida | `[confident] [clear voice] First Blood!` | Robusto | −16 LUFS |
| `double_kill.mp3` | 2 abates com até 10 s entre um e outro | `[excited] [clear voice] Double Kill!` | Natural | −15 LUFS |
| `dominating.mp3` | 4 abates sem morrer | `[excited] [clear voice] Dominating!` | Natural | −15 LUFS |
| `triple_kill.mp3` | 3 ou mais abates com até 10 s entre um e outro | `[excited] [energetic] TRIPLE KILL!` | Natural | −14 LUFS |
| `unstoppable.mp3` | 5 abates sem morrer | `[excited] [energetic] UNSTOPPABLE!` | Natural | −14 LUFS |
| `godlike.mp3` | 6 ou mais abates sem morrer (a cada abate) | `[very excited] [energetic] GODLIKE!!` | Criativo | −13 LUFS |

Voz nova entra aqui, em `ANUNCIOS` de `locutor-regras.js` e com o degrau em `ALVO_POR_SOM` (o teste `tests/locutor.test.mjs` confere que o arquivo existe e que a escada sobe).
