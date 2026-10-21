// Limite de quadros do cliente: o jogo desenha a 30 quadros por segundo.
//
// A simulação já anda em passo fixo de 1/30 s (DT, shared/sim.js), então desenhar
// mais que isso só repete a mesma cena com outra interpolação e gasta placa de vídeo
// (e bateria no celular). O requestAnimationFrame segue a taxa do monitor (60, 75,
// 120, 144 Hz...): este limitador diz em quais desses quadros desenhar.
//
// A grade é a do tempo ideal (um quadro a cada 1000/30 ms), não a do último quadro
// desenhado: assim um monitor de 144 Hz (quadros a cada 6,9 ms) alterna 4 e 5 quadros
// de tela por desenho e fica em 30 de média, em vez de cair para 24 (5 sempre). A
// tolerância segura o tremido do rAF: num monitor de 60 Hz o 2º quadro chega a ~33,2 ou
// ~33,5 ms; sem ela, metade das vezes ele seria pulado e o jogo cairia para 20 fps.
// Atrasou muito (aba escondida, travada), a grade recomeça do quadro de agora.

export const FPS_ALVO = 30;
export const INTERVALO_QUADRO_MS = 1000 / FPS_ALVO;
/** Folga para o quadro do monitor que chega um pouco antes da hora ideal. */
export const TOLERANCIA_QUADRO_MS = 4;

/**
 * Cria um limitador de quadros: `deveDesenhar(agora)` (o tempo do rAF, em ms) diz se
 * este quadro do monitor deve ser desenhado. Pura, sem relógio próprio (testável).
 */
export function criarLimitador(fps = FPS_ALVO, tolerancia = TOLERANCIA_QUADRO_MS) {
  const intervalo = 1000 / fps;
  let proximo = -Infinity;
  return {
    deveDesenhar(agora) {
      if (agora < proximo - tolerancia) return false;
      proximo = Number.isFinite(proximo) ? proximo + intervalo : agora + intervalo;
      if (proximo <= agora) proximo = agora + intervalo; // atrasou: recomeça a grade
      return true;
    },
    /** Esquece a grade (o próximo quadro desenha): ao recomeçar o laço. */
    reiniciar() {
      proximo = -Infinity;
    },
  };
}
