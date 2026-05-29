# scripts/

Scripts utilitários do Forekash. Nada aqui roda em produção — são tarefas
de manutenção/build executadas localmente.

## generate-almanaque-images.mjs

Gera as imagens do **ALMANAQUE** (sala da KASH SOCIETY) chamando a
[Gemini API](https://ai.google.dev/gemini-api/docs).

Por padrão usa **Gemini 2.5 Flash Image** ("Nano Banana"), o modelo nativo
de geração de imagem da família Gemini.

### Setup (uma vez)

1. **Node 18+** instalado (`node --version` precisa ≥ 18)
2. **API key do AI Studio** (não confunde com Gemini Advanced/Pro!):

   | Você tem | Funciona? |
   |---|---|
   | Gemini Advanced (chat $20/mês) | ❌ Não — só vale pro chat browser |
   | Gemini API key sem billing | ❌ Imagem requer billing |
   | **AI Studio com billing habilitado** | ✅ É isso |
   | Vertex AI (GCP enterprise) | ⚠ Funciona mas precisa de outra auth |

   Pega a key em <https://aistudio.google.com/apikey> — logado com a
   conta que tem billing (`anderson@taller.net.br` no seu caso).

3. **Exporta a key**:
   ```sh
   export GEMINI_API_KEY="sua_key_aqui"
   ```

### Rodar

```sh
# Padrão: Gemini 2.5 Flash Image (Nano Banana)
node scripts/generate-almanaque-images.mjs

# Alternativa: Imagen 3 (qualidade um pouco maior, custo similar)
node scripts/generate-almanaque-images.mjs --model=imagen-3.0-generate-002
```

### Flags

- `--model=<id>` escolhe modelo · default `gemini-2.5-flash-image`
- `--dry-run` mostra os prompts sem chamar a API (zero custo)
- `--force` regenera imagens que já existem
- `--only=slug1,slug2` roda só os slugs específicos
  ```sh
  node scripts/generate-almanaque-images.mjs --only=1929-wall-street-crash,2008-lehman-brothers
  ```

### Custo

| Modelo | Por imagem | 18 imagens |
|---|---|---|
| `gemini-2.5-flash-image` | ~$0.039 (1290 tokens × $30/M) | ~$0.70 |
| `imagen-3.0-generate-002` | ~$0.04 | ~$0.72 |

Cobrado em **Google Cloud Billing** vinculado ao projeto AI Studio.

### Saída

- `img/almanaque/{slug}.png` · proporção 16:9 · ~1-3 MB cada
- Total: ~30-50 MB de imagens no repo

### Pós-geração (opcional)

Converter PNG → WebP pra economizar banda (60-80% menor):
```sh
# macOS (built-in)
sips -s format webp img/almanaque/*.png --out img/almanaque/

# Linux (precisa imagemagick ou cwebp)
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
- `prompt` — texto enviado pra API

Os prompts seguem padrão **editorial documentary photojournalism**:
referências a pintores/fotógrafos da época (Vermeer, Sander, Bourke-White,
Sebastião Salgado, etc) + paleta de cor específica + iluminação cinemática
+ instrução explícita "no text, no logos" — modelos de imagem tendem a
inventar texto se não bloqueado.

### Trocar de modelo

Se uma imagem não ficou boa no Gemini 2.5 Flash, pode regerar só ela com Imagen 3:

```sh
node scripts/generate-almanaque-images.mjs \
  --model=imagen-3.0-generate-002 \
  --only=1867-marx-das-kapital \
  --force
```
