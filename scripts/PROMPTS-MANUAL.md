# ALMANAQUE · Geração manual de imagens

> Use este doc se você tem **Gemini consumer** (chat) mas **não tem API key**
> com billing habilitado em AI Studio. Aqui é tudo manual: você cola o prompt
> numa ferramenta, baixa a imagem, coloca na pasta certa.

## Onde gerar (do melhor pro mais simples)

### 1ª opção · Whisk · controle de aspect ratio
<https://labs.google/fx/tools/whisk>
- Imagen 3, free com Gemini Advanced
- Permite escolher **16:9** explicitamente
- Permite "remixar" combinando referência de cena + estilo
- Melhor resultado pros prompts deste doc

### 2ª opção · ImageFX
<https://labs.google/fx/tools/image-fx>
- Também Imagen 3, free com Gemini Advanced
- Interface mais simples, sem remix
- Tem "expressive chips" pra refinar tom

### 3ª opção · Gemini chat (gemini.google.com)
- Cola o prompt direto no chat
- **Limitação**: aspect ratio pode sair quadrado
- Adicionar ao final do prompt: *"horizontal cinematic 16:9 widescreen composition"* pra forçar
- Se sair quadrado, dá pra cropar depois

## Como salvar
- Cada prompt abaixo tem um nome de arquivo: `1602-voc.png` (ou `.webp`)
- Baixa a imagem com **exatamente esse nome**
- Coloca em `img/almanaque/`
- O modal do ALMANAQUE detecta automaticamente — se faltar, ele cai elegante pro layout sem imagem

## Workflow recomendado
1. Abre Whisk ou ImageFX
2. Roda 3-4 prompts por sessão (não tudo de uma vez)
3. Revisa cada imagem antes de salvar — Imagen às vezes inventa texto ou alucina rosto
4. Se não gostar, regenera (o prompt te dá ~80% do caminho, os outros 20% é tentativa)
5. Quando tiver várias prontas, commita: `git add img/almanaque/ && git commit -m "ALMANAQUE imgs" && git push`

---

## Os 18 prompts

### 1. VOC · primeira S/A
**Salve como:** `1602-voc.png`

```
A massive Dutch East India Company (VOC) ship docked at Amsterdam harbor at dawn, March 1602. Wooden hull, three tall masts with furled sails, Dutch tricolor flag. Merchants in dark robes and white ruffs on the wooden pier counting silver coins from leather pouches. Background: brick warehouses, canals, atmospheric morning mist over water. Dutch Golden Age oil painting aesthetic, in the style of Hendrick Cornelisz Vroom and Vermeer. Muted browns, deep blues, warm gold accents on coins and lantern light. Cinematic chiaroscuro lighting. Documentary historical realism. Horizontal cinematic 16:9 widescreen composition. No text, no logos, no modern elements, no readable signage.
```

---

### 2. Tulipomania · quebra
**Salve como:** `1637-tulipomania.png`

```
A wooden Dutch trading desk in dim candlelight, February 1637, aftermath of the speculative tulip crash. Wilted Semper Augustus tulip bulbs scattered on parchment contracts, a single dying red-and-white striped tulip lying in foreground, fallen silver florin coins, torn paper contracts with quill ink markings. Background shadow of a despondent merchant in dark robes turning away. Vermeer-style chiaroscuro lighting, dark brown and amber palette with faint cold blue from a small window. Dutch Golden Age still life aesthetic. Photorealistic editorial. Horizontal cinematic 16:9 widescreen composition. No text, no logos, no readable numerals.
```

---

### 3. South Sea Bubble
**Salve como:** `1720-south-sea.png`

```
A panicked crowd outside the Royal Exchange in London, September 1720. Men in tricornes and frock coats throwing paper South Sea Company share certificates into the air, a small bonfire of burning paper in mid-foreground, dramatic stormy gray sky with afternoon light breaking through clouds. Christopher Wren architecture in background. Hogarthian satirical aesthetic with photorealistic detail, in the style of William Hogarth meets historical documentary. Sepia, amber, deep gray-blue palette. Horizontal cinematic 16:9 widescreen composition. No text, no readable signage, no logos.
```

---

### 4. Adam Smith · Riqueza das Nações
**Salve como:** `1776-smith-wealth-of-nations.png`

```
An antique leather-bound book lying open on a polished mahogany Scottish writing desk, 1776 Edinburgh study at dusk. Brass-tipped quill resting in an inkwell, beeswax candle with flame casting warm orange light, an unrolled parchment map of Britain. Background: leather-bound volumes filling oak shelves, blue Scottish tartan throw on a wooden chair, gentle dust particles drifting through warm shafts of light. Vermeer-meets-Rembrandt lighting, deep brown and warm gold palette with subtle Edinburgh blue accents. Photorealistic editorial book photography aesthetic. Horizontal cinematic 16:9 widescreen composition. No readable text on the book or map, no logos, no titles.
```

---

### 5. Marx · Das Kapital
**Salve como:** `1867-marx-das-kapital.png`

```
A 19th-century industrial factory district in Manchester at dusk, September 1867. Massive black smokestacks silhouetted against a deep red and orange sunset sky thick with coal smoke. Soot-blackened brick factory walls, wet cobblestones reflecting gaslight glow. Exhausted factory workers in worn dark clothes leaving shift with slumped shoulders, lunch pails in hand. Background: tight rows of terraced houses with smoking chimneys, dense smog hanging low over the river. Gritty social realist aesthetic in the style of Gustave Doré and Ford Madox Brown. Deep crimson, charcoal, ash gray palette. Cinematic somber atmosphere. Horizontal cinematic 16:9 widescreen composition. No text, no signs, no modern elements.
```

---

### 6. Pânico de 1907
**Salve como:** `1907-panic.png`

```
A chaotic line of anxious depositors outside the Knickerbocker Trust Company on Fifth Avenue, New York City, late October 1907. Men and women in heavy winter overcoats and bowler hats, breath visible in cold air, distressed faces. A newspaper boy in cap waving folded newspapers in foreground. Edwardian neoclassical bank facade with columns. Black and white photojournalism aesthetic with subtle warm sepia undertones, in the style of Jacob Riis and Alfred Stieglitz. Gaslight glowing against late autumn afternoon gloom. Documentary historical realism. Horizontal cinematic 16:9 widescreen composition. No readable text or signage.
```

---

### 7. Federal Reserve Act
**Salve como:** `1913-federal-reserve-act.png`

```
The Oval Office of the White House on Christmas Eve, December 23 1913, late evening. President Woodrow Wilson seated at his oak Resolute Desk signing a thick legal document, single brass banker's lamp casting warm golden pool of light across the green felt blotter. A small Christmas tree silhouetted in the corner. Heavy velvet curtains, framed portraits of presidents on the walls, American flag in soft focus. Quietly momentous atmosphere. Sepia-toned archival photograph aesthetic, warm amber and deep forest green palette. Documentary historical photography style. Horizontal cinematic 16:9 widescreen composition. No readable text on documents, no readable nameplates, no logos.
```

---

### 8. Hiperinflação Weimar
**Salve como:** `1923-weimar-hyperinflation.png`

```
A bleak Berlin street market in November 1923, peak of Weimar hyperinflation. A weary woman in a dark winter coat pushing a wooden wheelbarrow overflowing with bundled stacks of Reichsmark banknotes to buy a single loaf of bread. Background: a baker's shop window with hand-chalked prices in the millions, men in worn suits looking exhausted, a small boy in the foreground folding paper money into a kite. Bleak overcast winter daylight, muted gray-brown palette with the dull pastel color of old banknotes. Documentary photojournalism aesthetic in the style of August Sander. Deep social realism. Horizontal cinematic 16:9 widescreen composition. No readable numerals or text on banknotes.
```

---

### 9. Quinta-feira Negra · 1929
**Salve como:** `1929-wall-street-crash.png`

```
The shocked crowd outside the New York Stock Exchange on Black Thursday, October 24 1929. Hundreds of men in dark suits, fedoras, and overcoats gathered in stunned clusters on Wall Street, ticker tape and torn paper scattered across the cobblestones, two mounted policemen in the background trying to maintain order. Distraught faces show disbelief. The neoclassical NYSE facade with Corinthian columns looms imposingly overhead. Black and white documentary photojournalism aesthetic with very subtle warm sepia undertones, dramatic afternoon shadow play in the style of Margaret Bourke-White. Horizontal cinematic 16:9 widescreen composition. No readable signs, no readable text.
```

---

### 10. Bretton Woods
**Salve como:** `1944-bretton-woods.png`

```
The grand wood-paneled gold ballroom of the Mount Washington Hotel in Bretton Woods, New Hampshire, July 1944. Dignitaries in dark suits and military uniforms seated at a long polished mahogany table, two central figures (representing Keynes and White) in animated discussion, ornate gilded chandeliers casting amber light, tall arched windows showing snow-capped White Mountains in afternoon golden hour. Warm interior lighting, sepia-toned archival photograph aesthetic. Formal historical documentary style. Deep amber, mahogany brown, soft gold palette. Horizontal cinematic 16:9 widescreen composition. No readable papers, no logos, no nameplates.
```

---

### 11. Tratado de Roma · CEE
**Salve como:** `1957-treaty-of-rome.png`

```
The Sala degli Orazi e Curiazi of Palazzo dei Conservatori on the Capitoline Hill, Rome, March 25 1957. Six European statesmen in formal dark suits signing parchment treaties at a long ornate Renaissance table draped in green velvet. Walls and ceiling covered in Cavalier d'Arpino frescoes of ancient Roman scenes, golden filtered afternoon light streaming through tall arched windows, a few photographers in background silhouette. Quietly historic atmosphere. Warm marble whites, deep classical reds, antique gold palette. Cinematic documentary aesthetic. Horizontal cinematic 16:9 widescreen composition. No readable text, no logos, no modern elements.
```

---

### 12. Friedman · Capitalismo e Liberdade
**Salve como:** `1962-friedman-capitalism-freedom.png`

```
An empty University of Chicago lecture hall at dusk, late 1962. Empty wooden tiered lecture seats, a single open hardcover book on a chalkboard-backed lectern, an unfinished cup of coffee, chalk dust visible in horizontal beams of warm afternoon light pouring through tall windows. Background blackboard with faint geometric economics curves erased but still visible. American midcentury academic aesthetic, warm walnut wood and amber palette with cool blue tones from the chalkboard. Photorealistic editorial book photography style. Horizontal cinematic 16:9 widescreen composition. No readable text on book or board, no logos.
```

---

### 13. Nixon Shock · fim do padrão-ouro
**Salve como:** `1971-nixon-shock.png`

```
The closed gold vault of the New York Federal Reserve Bank, late evening August 15 1971. Stacked gold bars on metal pallets in dim industrial lighting, a heavy circular steel vault door half-closed in foreground, the elongated shadow of a single uniformed guard on the distant concrete wall. Cold blue-steel and warm gold palette in stark contrast. Cinematic documentary aesthetic, slight desaturation, sense of finality and weight. Style of mid-70s political thrillers. Horizontal cinematic 16:9 widescreen composition. No readable text, no logos, no modern equipment, no people in focus.
```

---

### 14. Black Monday · 1987
**Salve como:** `1987-black-monday.png`

```
A New York Stock Exchange trading pit on Black Monday, October 19 1987, captured mid-chaos. Traders in colored jackets clutching crumpled paper order slips, hands gripping foreheads in disbelief, motion blur on figures shouting and gesturing. Background: 1980s CRT monitor walls showing fragmented red plunging numbers in motion blur, telephones dangling off hooks. Harsh overhead fluorescent lighting. Retro 80s technology and fashion aesthetic, in the style of Sebastião Salgado documentary photography. Red, amber, deep gray palette with neon red CRT screen glow. Cinematic chaos. Horizontal cinematic 16:9 widescreen composition. No readable text or numbers.
```

---

### 15. Plano Real · 1994
**Salve como:** `1994-plano-real.png`

```
A vibrant São Paulo open street market in early July 1994, warm morning sunlight. Brazilian street vendors of various ages examining the new colorful Real banknotes for the first time with cautious wonder and hope, fresh tropical fruits (mangoes, papayas, bananas) and vegetables in foreground straw baskets. Cobblestone street with faded pastel colonial facades, a jacaranda tree with purple blossoms in background. Hopeful, warm, photojournalism documentary style in the style of Sebastião Salgado. Tropical green, golden yellow, sky blue palette. Horizontal cinematic 16:9 widescreen composition. No readable text on banknotes or shop signs, no logos.
```

---

### 16. Lehman Brothers · quebra
**Salve como:** `2008-lehman-brothers.png`

```
The Lehman Brothers headquarters at 745 Seventh Avenue, Manhattan, late night September 15 2008. Former employees in business attire carrying cardboard boxes of personal belongings out into light rain, silhouettes of news photographers and camera crews in the middle distance, reflective wet pavement catching streetlight. The corporate tower's facade in shadow with several windows still lit. Cinematic noir lighting, deep blues and cold whites with single warm streetlight in foreground. Somber documentary photojournalism aesthetic in the style of Alec Soth. Horizontal cinematic 16:9 widescreen composition. No readable signs, no readable text, no logos.
```

---

### 17. Draghi · "whatever it takes"
**Salve como:** `2012-draghi-whatever-it-takes.png`

```
An empty press conference podium at the Global Investment Conference in London, July 26 2012, afternoon. Solid wooden podium with single microphone, deep blue conference backdrop with subtle European starfield pattern (no specific identifiable logos), bright press camera flashes frozen mid-motion in the background, ECB-inspired blue and gold accents on the podium edge. Conference hall in mid-distance with empty rows of chairs. Diplomatic, momentous quietude, sense of words about to change history. Deep blue, gold, neutral gray palette. Documentary editorial photography style. Horizontal cinematic 16:9 widescreen composition. No readable text or specific organization logos.
```

---

### 18. COVID · Circuit Breaker
**Salve como:** `2020-covid-crash.png`

```
An empty New York Stock Exchange trading floor during the COVID-19 lockdown, March 23 2020. Abandoned wooden trading stations with screens still displaying static red plunging graphs, a single fluorescent ceiling light hanging slightly askew, deserted polished hardwood floor reflecting an eerie blue glow from screens, the iconic NYSE bell visible silent in background. Pandemic ghost-town atmosphere, slightly desaturated palette with deep red and cold blue accents. Cinematic eerie documentary aesthetic in the style of Andrew Moore. Horizontal cinematic 16:9 widescreen composition. No readable text, no logos, no people.
```

---

## Depois de gerar tudo

```sh
# A pasta img/almanaque/ deve ter as 18 .png agora
ls img/almanaque/*.png | wc -l   # → 18

# (opcional) converter pra WebP, deixa o repo ~70% menor
sips -s format webp img/almanaque/*.png --out img/almanaque/

# Se converteu pra WebP, troca .png por .webp nos eventos:
sed -i.bak "s/\.png',/.webp',/g" index.html  # ⚠ veja diff antes de manter
rm index.html.bak

# Commit + push
git add img/almanaque/ && git commit -m "ALMANAQUE: 18 imagens" && git push
```

Cloudflare Pages deploya em ~1min, e o modal vai aparecer com hero image no topo.
