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
