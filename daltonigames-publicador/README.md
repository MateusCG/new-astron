# Publicador do DaltoniGames

Corta o Short em pé (1080 × 1920) de uma gravação e envia para o **YouTube** e o **TikTok** pelas APIs oficiais, sem abrir os sites. Node 20+, sem dependências; o corte usa o `ffmpeg`.

> Provisório: está numa pasta do `new-astron` porque esta sessão só alcança esse repositório. Quando existir `MateusCG/daltonigames-publicador`, ele muda para lá.

## O que precisa estar no computador

- **Node 20 ou mais** e **ffmpeg** (`sudo apt install ffmpeg`, `brew install ffmpeg` ou `winget install ffmpeg`).
- Esta pasta (clone a branch `ccr-f56c5034-x3yznj` e entre em `daltonigames-publicador/`).
- As chaves em `~/.daltonigames/` (fora do repositório; mude com `DALTONI_DIR`).

Roda no computador onde estão as gravações: o corte precisa do vídeo, e as chaves ficam só ali.

## YouTube: configurar uma vez

1. **Projeto no Google Cloud.** Em [console.cloud.google.com](https://console.cloud.google.com), entre com a **conta Google dona do canal** (ou uma conta gerente dele) e crie o projeto `DaltoniGames Publicador`.
2. **Ligar a API.** *APIs e serviços → Biblioteca → YouTube Data API v3 → Ativar.*
3. **Tela de permissão (Google Auth Platform).** *Começar*: nome do app `DaltoniGames Publicador`, seu e-mail de suporte, público **Externo**, e-mail de contato. Em *Público*, adicione a conta do canal como **usuário de teste**.
4. **Cliente OAuth.** *Clientes → Criar cliente → tipo "App para computador"* → Criar → **Baixar JSON**. Salve o arquivo como `~/.daltonigames/google-cliente.json`.
5. **Não deixar o login vencer.** Com o app em "Teste", o Google derruba a autorização a cada **7 dias**. Em *Público*, clique em **Publicar app** ("Em produção"). Na hora de autorizar vai aparecer "O Google não verificou este app": clique em *Avançado → Acessar DaltoniGames Publicador* (é o seu próprio app). Se mesmo assim a autorização cair toda semana, é o Google pedindo verificação do escopo de envio: rode `autorizar youtube` de novo (1 minuto) até a verificação sair.
6. **Auditoria da API do YouTube (a que libera vídeo público).** Vídeo enviado por um projeto de API sem auditoria fica **travado como privado e não dá para tornar público depois**: é preciso reenviar. Peça a auditoria no formulário *YouTube API Services – Audit and Quota Extension Form*, descrevendo o uso: ferramenta interna, um canal só (o seu), envia só conteúdo próprio, sem acesso a dados de outros usuários. Quando aprovar, crie `~/.daltonigames/config.json` com `{"youtubeAuditado": true}`.
7. **Canal verificado por telefone** em [youtube.com/verify](https://www.youtube.com/verify): libera vídeo de mais de 15 minutos e miniatura personalizada.
8. **Autorizar:**
   ```sh
   node publicar.mjs autorizar youtube   # abre o navegador; entre com a conta do canal
   node publicar.mjs conta               # deve mostrar DaltoniGames @DaltoniGames
   ```

## TikTok: configurar uma vez

1. Conta em [developers.tiktok.com](https://developers.tiktok.com) e um app novo.
2. Produtos: **Login Kit** e **Content Posting API**. Escopos: `user.info.basic` e `video.upload` (rascunho); `video.publish` só depois, para publicar direto.
3. Redirect URI de computador: `http://127.0.0.1:8723/callback/` (se o portal recusar, me avise: troco por uma página https).
4. Salve `~/.daltonigames/tiktok-cliente.json`:
   ```json
   { "client_key": "...", "client_secret": "...", "redirect_uri": "http://127.0.0.1:8723/callback/" }
   ```
5. Mande o app para revisão. Sem a auditoria do Content Posting API, publicar direto só sai como **privado** (SELF_ONLY) e numa conta privada; o modo **rascunho** manda o vídeo para a caixa de entrada do app do TikTok e você publica de lá.
6. `node publicar.mjs autorizar tiktok`

## Uso

```sh
# 1. Corta o Short (a câmera é o retângulo dela na gravação: x,y,largura,altura)
node publicar.mjs cortar gravacao.mp4 --inicio 12:30 --fim 13:05 \
  --camera 1500,40,380,300 --titulo "Escapei do Ciclope com 6 de vida"

# 2. Ensaio: mostra o que iria para cada plataforma e não envia nada
node publicar.mjs enviar gravacao-short-750s.mp4 \
  --titulo "Hades II pelos olhos de um daltônico" \
  --descricao @descricao.txt --tags "hades 2,daltonismo,daltonico,acessibilidade"

# 3. Publica de verdade
node publicar.mjs enviar ... --confirmar
```

Opções do `enviar`: `--onde youtube,tiktok` · `--privacidade privado|naoListado|publico` (YouTube) · `--agendar 2026-11-20T18:00:00-03:00` · `--longo` (vídeo normal, não Short) · `--tiktok rascunho|direto` · `--privacidade-tiktok privado|amigos|seguidores|publico` · `--legenda-tiktok "..."` · `--ia` (marca conteúdo sintético nas duas plataformas, para voz ou imagem realista feita por IA).

Cada envio fica anotado em `~/.daltonigames/historico.jsonl`.

## Testes

`npm test`: textos e limites de cada plataforma, os envios com a rede de mentira (ordem dos pedidos, cabeçalhos, pedaços do TikTok, erros explicados), o ensaio que não toca a rede e um corte de verdade com o ffmpeg (1080 × 1920, 30 fps, com áudio).
