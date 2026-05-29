# scripts/

Scripts utilitários do Forekash. Nada aqui roda em produção — são tarefas
de manutenção/build executadas localmente.

## generate-almanaque-images.mjs

Gera as imagens do **ALMANAQUE** (sala da KASH SOCIETY) chamando o
[Imagen 3](https://ai.google.dev/gemini-api/docs/imagen) da Gemini API.

### Setup (uma vez)
1. Node 18+ instalado (`node --version` precisa ≥ 18)
2. Pega API key em <https://aistudio.google.com/apikey>
3. Exporta a key:
   ```sh
   export GEMINI_API_KEY="sua_key_aqui"
   ```

### Rodar
```sh
node scripts/generate-almanaque-images.mjs
```

### Flags
- `--dry-run` mostra os prompts sem chamar a API (zero custo)
- `--force` regenera imagens que já existem
- `--only=slug1,slug2` roda só os slugs específicos
  ```sh
  node scripts/generate-almanaque-images.mjs --only=1929-wall-street-crash,2008-lehman-brothers
  ```

### Custo
~**$0.04 por imagem** (Imagen 3 standard). As **18 imagens curadas custam ~$0.72** no total.

### Saída
- `img/almanaque/{slug}.png` · proporção 16:9 · ~1-3 MB cada
- Total: ~30-50 MB de imagens no repo

### Pós-geração (opcional)
Converter PNG → WebP pra economizar banda (60-80% menor):
```sh
# macOS (built-in)
sips -s format webp img/almanaque/*.png --out img/almanaque/

# Linux / qualquer (precisa imagemagick)
for f in img/almanaque/*.png; do
  cwebp -q 85 "$f" -o "${f%.png}.webp"
done
```

Se converter pra WebP, ajustar o campo `img:` nos eventos de `'.png'` pra `'.webp'`.

### Como o modal usa as imagens
O modal de detalhe do evento (`window.ksAlmDetailOpen`) renderiza:
```html
<img src="img/almanaque/${e.img}" onerror="this.parentElement.style.display='none'">
```

→ **Se a imagem ainda não foi gerada**, o modal cai elegantemente pro layout sem imagem.
Por isso pode commitar a referência `img:` antes de rodar o script.

### Prompts
Editáveis em [`almanaque-prompts.json`](./almanaque-prompts.json). Cada entrada tem:
- `slug` — nome do arquivo (sem extensão)
- `decade` — década (pra documentação)
- `year`, `d`, `evento` — match com o evento em `KS_ALM_EVENTS`
- `prompt` — texto enviado pro Imagen 3

Os prompts seguem padrão **editorial documentary photojournalism**:
referências a pintores/fotógrafos da época (Vermeer, Sander, Bourke-White,
Sebastião Salgado, etc) + paleta de cor específica + iluminação cinemática
+ instrução explícita "no text, no logos" (Imagen tende a inventar texto).
