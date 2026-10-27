"""Copia os efeitos sonoros do AstroN original para public/sons/.

Uso: python3 -I tools/sons_do_original.py <pasta sfx do original> <public/sons>

Por que WAV e não OGG: o ffmpeg disponível na máquina (o do Playwright) não tem
codificador de áudio, e WAV PCM decodifica em qualquer navegador (decodeAudioData
do Safari não lê Vorbis). Os originais já são mono, 22 050 Hz, 16 bits, então o
peso fica baixo. O que este script faz é só cortar o silêncio do fim (vários
arquivos têm mais de um segundo de nada, como os cliques), com um fade curto de
10 ms para não estalar. Os primeiros instantes nunca são cortados: o ataque do
som fica intacto.

O nome do arquivo de saída é o original em minúsculas.
"""
import array
import os
import sys
import wave

# Escolhidos pelo uso no original (inititemweapon.cfg: colunas de som de disparo e
# de impacto das armas jogáveis; commonsound.cfg e commonsound2d.cfg para o resto).
SONS = [
    # Disparo das armas (coluna "som do tiro" do inititemweapon.cfg)
    'shot_ray', 'shot_ray3_2', 'shot_ray3_3', 'shot_ray3_4', 'shot_ray3_5', 'shot_ray4',
    'shot_ray_hm', 'laser1', 'shot_30m', 'shot_30m2', 'shot_30m3', 'shot_30m4', 'shot_30m5',
    'shot_cc', 'shot_ct', 'shot_nova', 'shot_iron', 'shot_fxsph', 'volt', 'drop2',
    # Dispositivos (ativação sem projétil)
    'hide', 'moojuk', 'u_mine', 'u_up', 'u_acc', 'u_decoy', 'u_remove', 'up2', 'dt1', 'dt2',
    # Impacto e explosão (coluna "som do impacto")
    'g_impact', 'b_impact', 'c_explo', 'h_explo', 'n2_explo', 'extra2', 'off_device',
    'off_device2', 'cure',
    # Armas dos monstros da jungle que vêm do original (Bazit e Xerxes)
    'npcfire2', 'npcfire3',
    # Nave
    'hyper', 'repair', 'usehpbattery', 'usehebattery', 'level_up',
    # Interface
    'click', 'click2', 'click3', 'click4', 'error', 'count', 'get_item', 'pickitem', 'i_drop',
    'w_open', 'w_open2', 'a_warn', 'b_warn', 's_warn', 'g_warn', 'st_warn', 'sm_warn',
]

LIMIAR = 48          # amplitude (de 32767) abaixo da qual a cauda conta como silêncio
FADE_S = 0.010       # fade no ponto de corte
SOBRA_S = 0.020      # folga deixada depois do último som audível


def aparar(caminho_in, caminho_out):
    with wave.open(caminho_in) as w:
        params = w.getparams()
        quadros = w.readframes(w.getnframes())
    if params.sampwidth != 2:
        with open(caminho_in, 'rb') as a, open(caminho_out, 'wb') as b:
            b.write(a.read())
        return
    amostras = array.array('h', quadros)
    if sys.byteorder == 'big':
        amostras.byteswap()
    canais = params.nchannels
    fim = len(amostras)
    while fim > 0 and abs(amostras[fim - 1]) < LIMIAR:
        fim -= 1
    fim = min(len(amostras), fim + int(SOBRA_S * params.framerate) * canais)
    fim -= fim % canais
    fim = max(fim, canais)
    corte = amostras[:fim]
    n_fade = min(len(corte) // canais, int(FADE_S * params.framerate))
    if fim < len(amostras):
        for i in range(n_fade):
            g = i / n_fade
            for c in range(canais):
                k = len(corte) - (i + 1) * canais + c
                corte[k] = int(corte[k] * g)
    if sys.byteorder == 'big':
        corte.byteswap()
    with wave.open(caminho_out, 'wb') as w:
        w.setnchannels(canais)
        w.setsampwidth(2)
        w.setframerate(params.framerate)
        w.writeframes(corte.tobytes())


def main():
    origem, destino = sys.argv[1], sys.argv[2]
    os.makedirs(destino, exist_ok=True)
    arquivos = {f.lower(): f for f in os.listdir(origem)}
    total = 0
    for nome in SONS:
        real = arquivos.get(nome + '.wav')
        if not real:
            print('faltou', nome, file=sys.stderr)
            continue
        saida = os.path.join(destino, nome + '.wav')
        aparar(os.path.join(origem, real), saida)
        with wave.open(saida) as w:
            dur = w.getnframes() / w.getframerate()
        tam = os.path.getsize(saida)
        total += tam
        print(f'{nome}\t{tam}\t{dur:.2f}')
    print(f'total\t{total}', file=sys.stderr)


if __name__ == '__main__':
    main()
