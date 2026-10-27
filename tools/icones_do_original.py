"""Copia os ícones dos itens do AstroN original para public/texturas/itens/.

Uso:
  python3 -I tools/icones_do_original.py <old-astron> <saída>

  <old-astron> raiz do old-astron (lê assets_obb/texture/item/*.pn8)
  <saída>      public/texturas/itens

Os ícones da Loja e do INVENTÁRIO do original são figuras de 64 × 64 (a peça
desenhada sobre preto, com as barras da moldura já na cor do tipo de dano: verde
Ph., azul El., rosa Op., branco sem tipo) em texture/item. O .pn8 é um PNG comum,
então vai byte a byte, só com a extensão trocada. Quem usa qual:
- arma: o nome do modelo dela (coluna 3 do inititemweapon.cfg, `modeloArma.modelo`
  em tools/dados/armas.json: AW001 → aw001.png), o mesmo nas oito versões;
- escudo, armadura e potenciador: a coluna 2 dos cfg (`icone` em
  tools/dados/equipamentos.json: XS034 → xs034.png), o mesmo nas oito versões;
- Kit de reparo e Célula de energia: os do "Hpbattery" e do "Energybattery" do
  original (SP011 e SP012 no inititemaddmaterial.cfg);
- o número da versão no canto do ícone: item_lv2 a item_lv8 (a V1 não tem, o
  item_lv1 do original é vazio). Esses vêm opacos sobre preto porque o original os
  soma por cima do ícone; aqui o preto vira transparência (alfa = o canal mais
  claro, a cor dividida por ele), que dá o mesmo resultado sobre qualquer fundo.
"""
import json
import os
import shutil
import sys

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONSUMIVEIS = {'sp011': 'Kit de reparo (Hpbattery do original)', 'sp012': 'Célula de energia (Energybattery do original)'}
VERSOES = range(2, 9)


def icones_das_armas():
    dados = json.load(open(os.path.join(RAIZ, 'tools/dados/armas.json'), encoding='utf-8'))
    return {a['modeloArma']['modelo'].lower(): a['nomePt'] for a in dados['armas']}


def icones_dos_equipamentos():
    dados = json.load(open(os.path.join(RAIZ, 'tools/dados/equipamentos.json'), encoding='utf-8'))
    icones = {}
    for e in dados['equipamentos']:
        icones.setdefault(e['icone'], []).append(e['nomePt'])
    return {k: ', '.join(v) for k, v in icones.items()}


def numero_com_alfa(origem, destino):
    im = Image.open(origem).convert('RGB')
    saida = Image.new('RGBA', im.size)
    px = [(0, 0, 0, 0) if max(p) == 0 else (*(min(255, round(c * 255 / max(p))) for c in p), max(p)) for p in im.getdata()]
    saida.putdata(px)
    saida.save(destino, optimize=True)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    pasta = os.path.join(sys.argv[1], 'assets_obb/texture/item')
    saida = sys.argv[2]
    os.makedirs(saida, exist_ok=True)
    grupos = [('Armas', icones_das_armas()), ('Escudos, armaduras e potenciadores', icones_dos_equipamentos()), ('Consumíveis', CONSUMIVEIS)]
    linhas = ['# Ícones dos itens (do AstroN original)', '', 'Gerado por `tools/icones_do_original.py` de `assets_obb/texture/item/` do original: não edite à mão.', '']
    for titulo, icones in grupos:
        linhas += [f'## {titulo}', '', '| arquivo | item |', '|---|---|']
        for nome in sorted(icones):
            origem = os.path.join(pasta, nome + '.pn8')
            if not os.path.exists(origem):
                sys.exit(f'falta o ícone {nome} ({icones[nome]}) em {pasta}')
            shutil.copyfile(origem, os.path.join(saida, nome + '.png'))
            linhas.append(f'| `{nome}.png` | {icones[nome]} |')
        linhas.append('')
    linhas += ['## Número da versão', '', 'No canto do ícone, da V2 à V8 (`item_lv2.png` a `item_lv8.png`), com o preto do original virado transparência.', '']
    for v in VERSOES:
        numero_com_alfa(os.path.join(pasta, f'item_lv{v}.pn8'), os.path.join(saida, f'item_lv{v}.png'))
    open(os.path.join(saida, 'LISTA.md'), 'w', encoding='utf-8').write('\n'.join(linhas))
    total = sum(len(i) for _, i in grupos) + len(VERSOES)
    print(f'{total} ícones em {saida}')


if __name__ == '__main__':
    main()
