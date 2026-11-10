# NFS-e Nacional — mapa de campos

Levantado de **duas notas reais** emitidas pela TALLER no Emissor Nacional em
05/11/2026, mais as três telas do Portal Contribuinte v1.6.0.0.

| | Nota A | Nota B |
|---|---|---|
| Nº NFS-e | 86 | 83 |
| Tomador | ECBR (Brasil) | Bloom Manufacturing (EUA) |
| Valor | R$ 7.200,00 | R$ 175.408,19 |
| Caso | tributada + retenções | exportação de serviço |

---

## 1. Três numerações diferentes

Confundir as três é o erro mais fácil de cometer.

| | Quem gera | Nota A | Nota B |
|---|---|---|---|
| **Nº da NFS-e** | a Receita, ao autorizar | 86 | 83 |
| **Nº da DPS** | **o emitente**, sequencial próprio | 1239 | 40 |
| **Série da DPS** | o emitente, define | 900 | 70000 |

O Forekash controla **DPS e série**. O número da NFS-e só existe depois da
resposta — nunca inventar nem exibir antes.

Nota B usa série 70000 e número 40: séries independentes, cada uma com sua
contagem. Vale ter uma série por origem (manual, Receita, API).

## 2. Chave de acesso — 50 dígitos

`42054072212819834000102000000000008626111066939761`

| Campo | Tam | Nota A |
|---|---|---|
| cMun IBGE do emissor | 7 | `4205407` (Florianópolis) |
| Ambiente | 1 | `2` |
| tpInsc | 1 | `2` (CNPJ) |
| Inscrição federal | 14 | `12819834000102` |
| Nº da NFS-e | 13 | `0000000000086` |
| AAMM | 4 | `2611` |
| Código numérico | 9 | `106693976` |
| DV | 1 | `1` |

**Vem da resposta, não se monta.** Serve pra conferência e pro QR do DANFSe.

## 3. Passo 1 — Pessoas

**Informações gerais**
- Preencher IBS/CBS? → **Sim** (obrigatório p/ competência ≥ 01/01/2026)
- Data de competência — *não* é a data de emissão. Nota B: competência
  31/10, emissão 05/11.
- Série e número da DPS (opcional na tela, obrigatório via API)

**Emitente** — emitir como Prestador / Tomador / Intermediário · Município ·
Indicador Municipal (IM) · CNPJ · Razão Social · Opção no Simples Nacional

**Compras governamentais** — Sim/Não

**Tomador** — e aqui mora a bifurcação:

| | Brasil (A) | Exterior (B) |
|---|---|---|
| Localização | Brasil | **Exterior** |
| Documento | CNPJ `14.238.854/0001-15` | **NIF** `933526202` |
| Município | São Paulo / SP (IBGE 3550308) | **Detroit**, sem UF |
| CEP | 01.332-907 | **48216 (ext)** |
| Endereço | CEP preenche sozinho | digitado livre |

**Destinatário** — "para fins de IBS/CBS, o destinatário é o próprio
adquirente?" Nas duas notas saiu *não identificado*.

**Intermediário** — Brasil / Exterior / não informado.

## 4. Passo 2 — Serviço

- **Local da prestação**: País + Município
- **Código de Tributação Nacional**: `01.01.01` — Análise e desenvolvimento
  de sistemas
- **Imunidade / exportação / não incidência?** → é **aqui** que a nota de
  exportação se separa
- Município de incidência do ISSQN
- **Item da NBS**: `1.1201.31.00`
- **Código indicador da operação**: `100301`
- Descrição do serviço (2000 caracteres)
- Complementares: nº de responsabilidade técnica, documento de referência,
  informações complementares, nº de pedido/OS para B2B

## 5. Passo 3 — Valores

Valor da operação · valor do intermediário · desconto incondicionado ·
desconto condicionado

**Municipal**: tributação do ISSQN · regime especial · exigibilidade suspensa ·
retenção pelo tomador · benefício municipal · dedução/redução de base ·
alíquota · BC · valor

> O portal avisa quando o município parametrizou indicativo de retenção para
> aquele código de tributação. Isso vem da **API de parâmetros municipais** —
> não é chute nosso.

**Federal**: situação tributária PIS/COFINS · BC · alíquotas · débito próprio ·
tipo de retenção PIS/COFINS/CSLL · IRRF · contribuições sociais retidas ·
contribuição previdenciária retida

**IBS/CBS**: CST `000` (tributação integral) · cClassTrib `000001` ·
documentos referenciados

**Valor aproximado dos tributos** (Lei 12.741) — Federal / Estadual /
Municipal em %. Nota A saiu `0,00` em tudo (não configurado); nota B saiu
`7,68%` federal. É configurável e **fica em branco se ninguém preencher**.

## 6. Como os números se calculam

Modelo validado — reproduz as duas notas **à vírgula**:

```
ISS          = exportação ? 0 : valor × alíquota
base IBS/CBS = valor − ISS          ← a base EXCLUI o ISS
IBS estadual = base × 0,10%
IBS municipal= base × 0,00%
CBS          = base × 0,90%
IRRF         = valor × 1,50%        (quando há retenção federal)
soc. retidas = valor × 4,65%        (CSLL 1 + PIS 0,65 + COFINS 3)
líquido      = valor − IRRF − soc. retidas
```

| | Nota A | Nota B |
|---|---|---|
| ISS | 144,00 | — |
| Base IBS/CBS | **7.056,00** | 175.408,19 |
| IBS estadual | 7,06 | 175,41 |
| CBS | 63,50 | 1.578,67 |
| Total IBS/CBS | 70,56 | 1.754,08 |
| IRRF | 108,00 | — |
| Sociais retidas | 334,80 | — |
| **Líquido** | **6.757,20** | **175.408,19** |

**Duas coisas que surpreendem:**

1. **IBS/CBS incide na exportação.** A nota B tem ISS zerado mas paga
   R$ 1.754,08 de IBS/CBS. Não é isenta.
2. **O IBS/CBS não entra no que o cliente paga em 2026.** "Valor líquido da
   NFS-e + IBS/CBS" = R$ 6.757,20, igual ao líquido. É fase de teste.

## 7. Exportação — o que muda

| Campo | Nacional | Exportação |
|---|---|---|
| Tipo de tributação ISSQN | Operação Tributável | **Exportação de Serviço** |
| Município de incidência | Florianópolis/SC | **Nenhum** |
| Alíquota ISS | 2,00% | **0,00%** |
| Retenção PIS/COFINS/CSLL | `3 - Retidos` | **`0 - Não Retidos`** |
| IBGE de incidência IBS/CBS | 3550308 | **9999999 (Exterior)** |
| Documento do tomador | CNPJ | **NIF** |
| CEP | formato BR | **sufixo `(ext)`** |
| Tributos aprox. federais | 0,00% | 7,68% |

## 8. O que o Forekash já tem e o que falta

**Tem:** CNPJ e razão social do emitente, município, IM, item da LC 116,
alíquota ISS, validade do certificado, cliente do cadastro (razão social,
CNPJ, e-mail, endereço), valor, descrição, competência.

**Falta:**
- NBS, código indicador da operação, CST e cClassTrib — hoje só existem na
  config do Granatum, por serviço
- Série e numeração própria de DPS
- Flag de exportação por cliente ou por serviço
- NIF e endereço livre para tomador no exterior
- Percentuais da Lei 12.741
- Regime especial, exigibilidade suspensa, benefício municipal
- Consulta à API de parâmetros municipais (é dela que vem a alíquota e o
  indicativo de retenção — não deve ser digitado)

**Cadastro de serviço, não de nota.** NBS, cIndOp, CST, cClassTrib e alíquota
pertencem ao *serviço*, não a cada nota — é assim que o Granatum faz, e por
isso lá a emissão é curta. O Forekash precisa de um cadastro de serviços
antes de a emissão ficar rápida.

---

# 9. Como falar com a API — provado em 10/11/2026

Testado com o A1 real da TALLER contra **produção restrita**. Nada foi emitido:
todas as tentativas pararam na validação.

## O envelope

```
POST https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse
Content-Type: application/json
mTLS: certificado A1 ICP-Brasil do prestador

{ "dpsXmlGZipB64": "<XML da DPS assinado → gzip → base64>" }
```

Resposta (erro de validação, que prova que o caminho está certo):

```json
{ "tipoAmbiente": 2, "versaoAplicativo": "SefinNacional_1.6.0",
  "dataHoraProcessamento": "...",
  "erros": [{ "Codigo": "E1226", "Descricao": "Estrutura descompactada mal formada." }] }
```

`E1226` quer dizer que ele **descompactou** o gzip e achou o XML malformado —
ou seja, content-type, nome do campo e compactação estão corretos.

`application/xml` devolve **415**. O corpo é JSON, não XML cru.

## O runtime NÃO pode ser Deno — e isso fecha a arquitetura

| Cliente | TLS | Resultado |
|---|---|---|
| curl (OpenSSL) | 1.2 | **HTTP 200** |
| **Node (OpenSSL)** | 1.2 | **POST chega na aplicação (415/400)** |
| Deno (rustls), HTTP/2 | 1.2 | `endpoint requires HTTP/1.1` |
| Deno (rustls), HTTP/1.1 | 1.2 | `Connection reset by peer` |

`Deno.createHttpClient({cert,key})` **funciona** — contra `example.com` deu
200 com o certificado. O problema é este servidor: IIS, **TLS 1.2 apenas**
(1.3 é recusado), e o rustls não fecha handshake com ele.

**Consequência:** Supabase Edge Functions (Deno/rustls) está fora, assim como
o Worker da Cloudflare. A perna que fala com a Receita precisa de runtime
**OpenSSL** — Node num container.

Isso não derruba o resto do desenho: o Worker continua orquestrando, o
container só assina e entrega.

---

# 10. Emissão funcionando — 10/11/2026

**NFS-e geradas em produção restrita.** Pipeline completo: montar XML →
assinar XMLDSig → gzip → base64 → POST com mTLS → `HTTP 201`.

Código em `src/nfse/dps.js` (Node; depende de `xml-crypto`).

## A assinatura que funcionou

```
SignatureMethod        rsa-sha256
CanonicalizationMethod http://www.w3.org/TR/2001/REC-xml-c14n-20010315
DigestMethod           sha256
Reference URI          #<Id do infDPS>
Transforms             enveloped-signature → c14n
Posição                <Signature> irmã de <infDPS>, dentro de <DPS>
```

Não precisou de canonicalização exclusiva nem de truque nenhum. `xml-crypto`
resolve; o que custa é acertar o XML, não a cripto.

## Resposta de sucesso

```json
{ "tipoAmbiente": 2, "versaoAplicativo": "SefinNacional_1.6.0",
  "chaveAcesso": "42054072212819834000102000000000000326113941057315",
  "nfseXmlGZipB64": "...", "alertas": null }
```

`nfseXmlGZipB64` descompactado é a **NFS-e autorizada** (~10 KB) com o número
definitivo. É esse XML que vira o DANFSe e o anexo do lançamento.

## A escada de erros — o caminho inteiro

Cada erro da API é preciso e aponta o campo. Valeu mais que o manual:

| Código | O que era |
|---|---|
| `E1229` | faltava `<?xml ... encoding="UTF-8"?>` |
| `E1235` serie | `99999` recusado; `900`, `1`, `00900`, `12345` passam |
| `E1235` cLocEmi | **`finNFSe` vai depois de `tpEmit`**, não dentro de `IBSCBS` |
| `E1235` cNBS | `cNBS` vem **antes** de `xDescServ` |
| `E1235` gIBSCBS | não existe: `CST` e `cClassTrib` vão direto em `valores/trib` |
| `E0120` | **não informar IM** — Florianópolis não tem complemento no CNC |
| `E0312` | `010101` não está administrado na produção restrita; `010201` e `010501` estão |
| `E0617` | **não informar `pAliq`** se o prestador não é optante do Simples |
| `E0713` | `indTotTrib` e `pTotTribSN` proibidos p/ não optante → usar `pTotTrib` |

**⚠ O esquema do servidor está à frente do XSD publicado.** Os três erros de
ordem (`finNFSe`, `cNBS`, `gIBSCBS`) contradizem o pacote
`NFSe-ESQUEMAS_XSD-v1.01-20260209`. Validar contra o XSD baixado dá falso
positivo — **a API é a fonte da verdade**.

## Duas regras que mudam o desenho do app

1. **Alíquota não se informa.** Para não optante do Simples, quem define é o
   município pela parametrização nacional. O campo "Alíquota ISS" na config
   só serve para optante do Simples — para o resto é informação morta.
2. **Os percentuais da Lei 12.741 são obrigatórios** para não optante, e são
   uma *escolha*: ou os três valores, ou os três percentuais. Não dá pra
   omitir com `indTotTrib`.

---

# 11. Retenção e IBS/CBS — medido, não deduzido (10/11/2026)

Emiti em produção restrita e **li o que a Receita devolve**. Reproduz a
NFS-e 86 à vírgula: retenção 442,80 · líquido 6.757,20 · IBS 7,06 · CBS 63,50.

## As alíquotas de IBS/CBS não se informam

Vêm calculadas na resposta:

```
pIBSUF = 0.10    pAliqEfetUF  = 0.10
pIBSMun = 0.00   pAliqEfetMun = 0.00
pCBS = 0.90      pAliqEfetCBS = 0.90
```

Nunca mandei nenhuma delas. Quem calcula é a Receita, a partir de CST +
cClassTrib. É por isso que no Granatum esses campos aparecem bloqueados.

## O mapeamento da retenção é contraintuitivo

`vPis` e `vCofins` dentro de `piscofins` são **débito de apuração própria**,
não retenção. Mandando os valores ali:

| | com vPis/vCofins | só com tpRet |
|---|---|---|
| vTotalRet | 180,00 ❌ | **442,80** ✓ |
| base IBS/CBS | 6.793,20 ❌ | **7.056,00** ✓ |

O jeito certo:

```xml
<tribFed>
  <piscofins><CST>08</CST><tpRetPisCofins>3</tpRetPisCofins></piscofins>
  <vRetIRRF>108.00</vRetIRRF>
  <vRetCSLL>334.80</vRetCSLL>   <!-- PIS + COFINS + CSLL, somados -->
</tribFed>
```

`vRetCSLL` carrega o **total das três** contribuições retidas. O DANFSe
chama isso de "Contribuições Sociais - Retidas", e `tpRetPisCofins=3` é o
que diz quais estão incluídas.

## Ordem no XSD não é sugestão

`trib` é `tribMun → tribFed → totTrib`. Pus `tribFed` antes e levei E1235.
Campo certo na posição errada é campo inválido.

## E a base do IBS/CBS

Confirmado: exclui o ISS (7.200 − 144 = 7.056). E exclui também PIS/COFINS
**quando são débito próprio** — que é justamente o caso que não é o nosso.

---

# 12. Exportação — o que já está certo e o que ficou aberto

Testado em produção restrita, 10/11/2026.

## Resolvido

| Campo | Papel |
|---|---|
| `tribISSQN = 3` | exportação de serviço — zera o ISS |
| **`cPaisResult`** | país onde o RESULTADO se verificou (`US`) |
| `endExt/xEstProvReg` | **obrigatório** — estado/província do tomador |
| `indDest = 1` | na exportação o destinatário não é o adquirente |

O `cPaisResult` é o que sustenta a isenção: o ISSQN não incide porque o
resultado se verificou fora do Brasil. Sem ele, "exportação" fica sem o fato
que a justifica — e é prova que o Fisco pode cobrar depois.

## Aberto: a incidência do IBS/CBS

Com tomador no exterior, a Receita recusa:

> O tomador/adquirente deve ser obrigatoriamente identificado por CNPJ ou
> CPF e seu endereço nacional informado, se houver tributação do IBS/CBS, a
> incidência ocorrer no município do seu endereço no Brasil.

Testado com `cIndOp` 100301 e 100302, `indDest` 0 e 1 — todos recusados.

**A NFS-e 83 real (Bloom, 05/11/2026) usou `cIndOp 100301` e foi aceita**,
voltando com IBGE de incidência 9999999 (Exterior). Então ou uma regra
mudou entre 05/11 e 10/11, ou o portal envia algo a mais que o XSD não
mostra.

**Não resolver por tentativa.** Errar aqui significa pagar ISS que não é
devido, ou emitir exportação inválida. Caminhos: perguntar ao suporte da
NFS-e (atendimento.nfs-e@rfb.gov.br) com a chave da NFS-e 83 como exemplo,
ou emitir a próxima exportação pelo portal e comparar o XML autorizado
campo a campo com o nosso.

**O caso nacional não regrediu:** retenção 442,80 · líquido 6.757,20 ·
IBS 7,06 · CBS 63,50, idêntico à NFS-e 86.

---

# 13. PDF e e-mail — o que falta (10/11/2026)

## A Receita não gera o PDF

Testado com certificado em produção restrita:

| rota | resposta |
|---|---|
| `adn/danfse/{chave}` | 404 |
| **`SefinNacional/danfse/{chave}`** | **501 Not Implemented** |

O 501 é a resposta honesta: a rota existe e está desligada — é a suspensão
do DANFSe pela NT 008 (03/08/2026).

**Consequência:** para anexar PDF, o Forekash precisa desenhar o DANFSe a
partir do XML autorizado. O leiaute está na NT 008, e há dois DANFSe reais
da TALLER como referência (NFS-e 83 e 86).

## O XML, esse temos

Vem na resposta da emissão em `nfseXmlGZipB64`. É guardado na nota e dá pra
baixar pela ficha. **O XML é o documento fiscal; o PDF é representação.**

## Enviar por e-mail

Três pedaços, em ordem de dependência:

1. **Registrar o e-mail na nota** — feito: `toma/email` vai na DPS quando
   preenchido, e some quando vazio (elemento vazio é recusado).
2. **Gerar o PDF** — acima.
3. **Remetente** — o Forekash não tem. Candidato natural é o Cloudflare
   Email Service pelo Worker, já que a infra está lá; exige verificar o
   domínio. A alternativa é SMTP no serviço `src/nfse`.

Enquanto 2 e 3 não existirem, o e-mail preenchido serve para constar na
NFS-e — o que não é pouco: é por ele que o tomador aparece identificado.


## 14. O DANFSe — por que o Forekash desenha, e por que sem a nossa cara

`GET SefinNacional/danfse/{chave}` responde **501 Not Implemented**. A NT 008
suspendeu o serviço: quem emite passou a ser responsável por imprimir. Não
existe PDF pronto para baixar em lugar nenhum — o que os sistemas de mercado
mostram é o modelo oficial desenhado por eles.

**O modelo é fechado.** Item 2.2.4: *"Deverá ser utilizado o modelo de DANFSe
conforme Anexo I, devendo a disposição de campos obrigatoriamente obedecer ao
disposto no respectivo anexo."* E item 2.1: *"Não poderão ser impressas
informações que não constem do arquivo da NFS-e."*

Disso decorre, sem margem: **a logo do emitente não entra**. Ela não está no
XML. O cabeçalho é definido campo a campo no item 2.4.3 — logomarca da NFS-e à
esquerda, "DANFSe v2.0" ao centro em Arial 9pt negrito, município / ambiente
gerador / tipo de ambiente à direita. Não sobra espaço para marca de ninguém.

O que a NT deixa escolher é pouco e está no item 2.3: suprimir blocos de
tomador, destinatário, intermediário e ISSQN quando não se aplicam (trocando-os
pela frase "… NÃO IDENTIFICADO NA NFS-e"), e dispensar o bloco "Canhoto". Os
tamanhos em centímetros do item 2.4.5 são sugestão; **as fontes do item 2.4 e a
disposição do Anexo I não são**.

### O que é obrigatório e está implementado

| Exigência | Onde | Como |
|---|---|---|
| Página única, retrato, mínimo A4 | 2.2 / 2.2.1 | `@page{size:A4 portrait}`; o documento fecha em 21,73cm de 29,7cm |
| Largura 20,40cm | 2.4.5 | grade de 4 colunas de 5,09cm |
| Arial nos rótulos, Microsoft Sans Serif no conteúdo, K100 | 2.4 | `NF_DANFSE_CSS` |
| Título de bloco 7pt negrito caixa alta | 2.4.1 | `.df-tt` |
| Rótulo de campo 6pt negrito | 2.4.2 | `.df-lb` |
| Conteúdo 7pt normal | 2.4.4 | `.df-vl` |
| Logomarca da NFS-e à esquerda | 2.4.3 | PNG oficial embutido em `NF_DANFSE_LOGO` |
| QR mínimo 1,52cm apontando para a consulta pública | 2.4.3 | `_qrSvg` + `NF_DANFSE_CONSULTA` |
| Frase de autenticidade em 3 linhas, 6pt | 2.4.3 | `.df-qr .nota` |
| "NFS-e SEM VALIDADE JURÍDICA" em vermelho quando `tpAmb`=2 | 2.4.3 obs. | `.df-cab .c .av` |
| Campo sem informação sai com traço | Nota 12 | `_dfOuTraco` |
| Totais aproximados de tributos (Lei 12.741) | Nota 10 | bloco de informações complementares |
| Descrição dos códigos, não o número | 2.4.5 | `NF_DF_COD` |

### O QR

Não havia gerador no app e nenhuma biblioteca carregada serve — então tem um,
escrito à mão: modo byte, correção M, versões 1 a 9, seleção de máscara pelas
quatro regras de penalidade do padrão. Foi conferido de duas formas: matriz
idêntica à de uma implementação de referência (segno) nas nove versões, e
decodificação correta pelo detector do OpenCV, inclusive para a chave real da
nota 86.

Dois erros apareceram nessa conferência e valem registro: a segunda cópia dos
bits de formato estava incompleta (faltavam os bits 7 e 8), e o polinômio
gerador de Reed-Solomon estava montado com o grau mais baixo primeiro enquanto
a divisão o lia ao contrário. Nenhum dos dois aparece como erro de execução —
só como um QR que não lê.

### Onde fica

`nfDanfseHtml(id)` devolve o documento; `nfDanfseImprimir(id)` abre o diálogo
do navegador, onde "Salvar como PDF" gera o arquivo. O modal da nota mostra a
pré-visualização num iframe, ao lado dos dados — e o botão do XML ao lado,
porque **o documento fiscal é o XML**; o DANFSe é a representação dele.

O município vem no XML como código IBGE e a NT manda imprimir o nome: a
resolução passa pela API do IBGE com cache em `fk_ibge_municipios`, e sem rede
cai no próprio código.

## 15. Exportação — o que faltava era o grupo de comércio exterior

As duas NFS-e autorizadas pelo portal em 05/11 — a 84 (STRV s.r.o., República
Tcheca) e a 85 (DOT Digital Group, nacional) — resolveram a recusa que vinha
aparecendo como erro de indicador de operação.

### O bloco que faltava

Dentro de `<serv>`, logo depois de `<cServ>`, a nota de exportação traz:

```xml
<comExt>
  <mdPrestacao>4</mdPrestacao>   <vincPrest>0</vincPrest>
  <tpMoeda>220</tpMoeda>         <vServMoeda>11440.00</vServMoeda>
  <mecAFComexP>01</mecAFComexP>  <mecAFComexT>01</mecAFComexT>
  <movTempBens>1</movTempBens>   <mdic>1</mdic>
</comExt>
```

Oito campos, **todos obrigatórios** pelo XSD (`TCComExterior`). Não era palpite:
o **Anexo VI**, aba `EXPORTACAO_EMISSÃO_NFS-e`, traz a matriz de 117 cenários,
e a **linha 58** é exatamente o caso da TALLER — tomador no exterior,
intermediário no Brasil, prestação no Brasil, subitem que incide no
estabelecimento prestador, tributação "Exportação de Serviço". Nela:

| coluna | valor |
|---|---|
| Exibe erro? | — (nenhum) |
| Local de incidência do ISSQN | — (nenhum) |
| **NBS** | SIM |
| **País Resultado** | SIM |
| **Grupo Comex** | SIM |

A recusa nunca falou em comércio exterior. Falou do `cIndOp`, que é onde o erro
aparece — não onde ele está. Foi o que custou tempo.

### E duas deduções minhas que estavam erradas

**`indDest` na exportação é 0, não 1.** Eu tinha raciocinado que exportação
exigia `indDest = 1` com um bloco `<dest>` separado. As duas notas do portal, a
nacional e a de exportação, mandam `indDest = 0` e nenhum `<dest>`. O
destinatário é o próprio adquirente nos dois casos.

**`tpMoeda` 220 é dólar, não euro.** Pela tabela do BACEN: 220 = DOLAR DOS EUA,
978 = EURO, 540 = LIBRA ESTERLINA, 075 = COROA TCHECA. A nota 84 foi faturada
em USD 11.440,00 → R$ 60.924,89 (5,3256).

### Diferenças que o servidor aceita das duas formas

Vale registrar para não "consertar" o que funciona:

| | portal | Forekash | situação |
|---|---|---|---|
| `finNFSe` / `indFinal` | dentro de `IBSCBS` | depois de `tpEmit` | as duas autorizadas |
| `CST`/`cClassTrib` | dentro de `gIBSCBS` | direto em `valores/trib` | as duas autorizadas |
| `totTrib` nacional | `vTotTrib` zerado | `pTotTrib` com percentuais | as duas autorizadas |
| C14N da assinatura | exclusiva WithComments | inclusiva | as duas autorizadas |

### Confirmação da retenção federal

A nota 85 fecha a medição que já tinha sido feita por tentativa: `vServ`
36.000,00 com `vRetIRRF` 540,00 (1,5%) e `vRetCSLL` 1.674,00 — que é 4,65% =
PIS 0,65% + COFINS 3% + CSLL 1%. O campo `vRetCSLL` carrega mesmo o **somatório
das três**, com `tpRetPisCofins = 3`. A NT 008 diz isso por escrito na
descrição do campo "Contribuições Sociais - Retidas".

Na exportação não há retenção: `tpRetPisCofins = 0`, sem `vRetIRRF` nem
`vRetCSLL`, e `pTotTribFed` 7,68%.

### Na tela

O bloco "Comércio exterior" aparece só quando o cliente é estrangeiro. Dos oito
campos, seis são fixos para quem presta serviço remoto (sem vínculo, sem
mecanismo de fomento dos dois lados, sem movimentação de bens, compartilha com
o MDIC). Os três que ficam à vista são moeda, valor na moeda e **modo de
prestação**.

O modo de prestação é classificação, e por isso não fica escondido. O padrão do
Forekash é **1 — Transfronteiriço** (o serviço cruza a fronteira, as pessoas
não), que é o enquadramento de software entregue remotamente. A nota 84 saiu do
portal como **4 — Movimento Temporário de Pessoas Físicas**. São coisas
diferentes e vale conferir com a contabilidade qual descreve a operação.

### CST do PIS/COFINS: 00 na nacional, 08 na exportação

Pela tabela do leiaute (`TSTipoCST`): **00 = Nenhum**, **08 = Operação sem
Incidência da Contribuição**.

Eu mandava 08 nos dois casos, e na nota nacional isso era errado de conteúdo:
a contribuição **incide**, ela só é retida na fonte. As notas autorizadas
separam — 85 (nacional) manda `00`, 84 (exportação) manda `08`, que é o que a
exportação de fato é.

Outra correção: na exportação o bloco `<tribFed>` **existe**, só que vazio de
valores — `<piscofins><CST>08</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins>`.
Antes o Forekash omitia o bloco inteiro.

Com isso o `tribFed` gerado passou a bater caractere por caractere com as duas
notas autorizadas, nos dois cenários.

### Série separada para produção restrita

Testar em produção restrita gastava número da série de produção — e número
gasto não volta, fica buraco na sequência. Agora há `serieDpsTeste` /
`proxDpsTeste`, usados só quando o ambiente é `restrita`, com padrão série 901
a partir do 1. O portal faz o mesmo: emite as dele em série 70000 e deixa a 900
para quem emite de fora.

## 16. O PDF como arquivo, e o envio para o tomador

### Por que o DANFSe virou PDF de verdade

A pré-visualização em HTML resolvia olhar, não anexar: o navegador só
transforma HTML em PDF quando alguém clica em "Salvar como PDF", e e-mail
automático não espera clique. Então o DANFSe passou a ter um gerador de PDF
próprio, escrito à mão.

Sem biblioteca: o DANFSe é uma grade de retângulos e textos curtos, que é
exatamente o que o formato PDF faz nativamente. Sai **vetorial** — o texto
continua texto, selecionável e pesquisável, e o `pdftotext` lê a nota inteira.
O QR também é vetor. A logomarca oficial é embutida sem recodificar: o PDF
aceita o fluxo do PNG como está, com `/Predictor 15`, que é o mesmo esquema de
filtro por linha que o PNG usa.

Sobre a fonte: a NT pede Arial nos rótulos e Microsoft Sans Serif no conteúdo.
Nenhuma das duas pode ser embutida sem licença, e as duas são metricamente
equivalentes à Helvetica, uma das 14 fontes que todo leitor de PDF tem.

### Um modelo, dois desenhistas

O leiaute morava dentro do gerador de HTML. Com um segundo formato, duas
descrições do mesmo leiaute divergiriam na primeira alteração. Agora
`_danfseModelo(xml, mun)` lê o XML e devolve o documento como **dados** —
blocos, linhas, células — e `_danfseParaHtml` e `_danfsePdf` leem esses dados.
O que a NT fixa mora num lugar só.

### Verificação

- `pdfinfo`: 1 página, 595,28 × 841,89 pt (A4)
- `pdftotext -layout`: o conteúdo sai como texto, bloco por bloco
- QR lido do PDF renderizado a 300 dpi pelo OpenCV: devolve exatamente
  `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=` + a chave

Um erro apareceu e vale registrar: eu descontava a altura da fonte ao
posicionar cada texto, tratando a coordenada como topo quando o PDF a trata
como linha de base. O efeito era a régua da grade passar por cima de cada
valor — um documento inteiro riscado.

### O envio

O Emissor Nacional não avisa o tomador; a entrega é de quem emite. O envio vai
por SMTP **no serviço**, não no navegador, pelo mesmo motivo da assinatura: a
credencial não pode passar pelo cliente.

- `src/nfse/email.js` — monta e envia (nodemailer, sem subdependências)
- `POST /email` — recebe destinatário, assunto, corpo e anexos prontos
- `GET /email/teste` — conecta e autentica sem mandar nada
- `GET /saude` — passou a dizer se há remetente, para a tela não prometer o
  que o serviço não faz

Configuração, no `.env` do serviço: `FK_SMTP_HOST`, `FK_SMTP_PORT`,
`FK_SMTP_USER`, `FK_SMTP_PASS`, `FK_SMTP_FROM` e `FK_SMTP_NOME`.

O PDF e o XML são montados no navegador e sobem em base64 — gerar o DANFSe de
novo no servidor seria, outra vez, ter dois leiautes. O `replyTo` é o e-mail da
empresa emitente: quem recebe responde para quem emitiu, não para o serviço.

Na nota ficam `emailEnviadoEm`, `emailPara` e `emailErro`. O erro **não some da
tela** — é por ele que se descobre que o cliente nunca recebeu.

## 17. Pessoa física, e o endereço que não tinha onde ser digitado

A NFS-e 80, emitida para um CPF, fechou três lacunas de uma vez.

### O endereço é exigido também para CPF

A nota 80 traz o tomador pessoa física com município, código IBGE (3144805),
CEP, logradouro, número e bairro — tudo. Não há exceção para CPF.

E não havia onde digitar isso: a ficha do cliente guardava nome e documento.
Para CNPJ dava para puxar da Receita; para CPF não existe consulta pública,
então a emissão simplesmente parava.

Agora a ficha tem uma seção **Endereço**, nos três tipos:

| tipo | campos |
|---|---|
| PJ e PF | CEP (com busca), código IBGE, logradouro, número, complemento, bairro, município, UF |
| Estrangeiro | cidade, estado/província, país, código postal, logradouro, número |

A busca por CEP usa o **ViaCEP**, que devolve o código IBGE do município junto —
é o campo que ninguém sabe de cor e o que a DPS exige. Conferido com o CEP da
nota 80: devolve Rua Major Felizardo, Bonfim, Nova Lima/MG, IBGE 3144805,
exatamente o que está na nota.

E o `lookupCNPJ` passou a aproveitar o endereço que a BrasilAPI já devolvia e
era descartado — depois a emissão parava pedindo campos que já tinham chegado.
O que o usuário digitou prevalece: só preenche o que está vazio.

### CPF e CNPJ são elementos diferentes

O código montava sempre `<CNPJ>`, inclusive com 11 dígitos. Teria sido recusado
na validação do schema. Agora `_docEl()` escolhe pelo número de dígitos — 11 vira
`<CPF>`, 14 vira `<CNPJ>` — e isso vale para o prestador também, que pode ser
autônomo em outra empresa que use o Forekash.

### Pessoa física não retém

A retenção de IRRF, PIS, COFINS e CSLL na fonte é obrigação de quem paga, e só
quando quem paga é pessoa jurídica. Os percentuais ficam no cadastro do serviço
porque valem para a maioria das notas, mas quem decide se incidem é o tomador
daquela nota.

A nota 80 confirma: as quatro retenções zeradas e "PIS/COFINS/CSLL Não Retidos".
Importante — **sem retenção não é sem bloco**: o `<tribFed>` continua, com
`tpRetPisCofins = 0` declarado. Ausência de declaração é outra coisa.

### A lista de pendências mentia

"Falta para emitir" era calculada a partir de `NF_DRAFT`, que só era preenchido
no instante de emitir. A tela pedia valor, descrição, nome e documento do
tomador com os quatro preenchidos na frente do usuário.

Agora `_nfDraftDaTela()` lê os campos antes de calcular, e os campos avisam
quando mudam. Um aviso que mente sobre o que está na tela é pior que aviso
nenhum: ensina a ignorar a lista inteira — inclusive os itens verdadeiros.
