# Emissão de NFS-e — Emissor Nacional

Assina a DPS e entrega na Sefin Nacional. **Roda em container**, não no
Worker nem em Edge Function.

## Por que container

A Sefin Nacional é IIS, TLS 1.2, e exige **mTLS**. O rustls — base do Deno e
dos Cloudflare Workers — não fecha handshake com ela. Testado em 10/11/2026:

| Cliente | Resultado |
|---|---|
| curl / Node (OpenSSL) | passa |
| Deno, HTTP/2 | `endpoint requires HTTP/1.1` |
| Deno, HTTP/1.1 | `Connection reset by peer` |

O Worker continua orquestrando. Este serviço só assina e entrega.

## Arquivos

| | |
|---|---|
| `dps.js` | monta o XML, assina (XMLDSig) e envia |
| `cofre.js` | guarda o certificado cifrado |
| `servidor.js` | HTTP: `/cofre`, `/emitir`, `/saude` |

## Variáveis

```
FK_NFSE_MASTER_KEY   chave-mestra da custódia (mín. 32 chars) — NUNCA no banco
FK_NFSE_TOKEN        token que o app apresenta
FK_NFSE_ORIGENS      origens permitidas no CORS, separadas por vírgula
                     ex.: https://forekash.com.br
PORT                 8080
```

O `.pfx` sobe do navegador direto para este serviço — um salto a menos para
a chave privada. Por isso o CORS, e por isso a origem é declarada: aceitar
qualquer site convidaria outro a mandar `.pfx` em nome do usuário.

**A chave-mestra não pode viver no mesmo lugar que os pacotes cifrados.** O
banco guarda o pacote; a chave mora só no ambiente deste serviço. Quem tiver
um dos dois não abre nada.

## Uso

**Guardar o certificado (uma vez por empresa):**
```
POST /cofre   { orgId, pfxBase64, senha }
→ { pacote, titular, validade }
```
O `.pfx` em claro não volta e não fica. Guarde `pacote` no banco.

A senha é conferida na hora: senha errada falha aqui, com a pessoa na tela,
não no dia da primeira emissão.

**Emitir:**
```
POST /emitir  { pacote, dps, ambiente: "restrita" | "producao" }
→ 201 { chaveAcesso, nfseXmlGZipB64 }   nota gerada
→ 400 { erros: [{ Codigo, Descricao }] } rejeição da Receita, repassada
```

`ambiente` é obrigatório. Sem ele vai para **produção restrita** — errar
isso na direção contrária emitiria nota fiscal de verdade achando que era
teste.

## Custódia — o que este desenho resolve e o que não

**Resolve:** nada em claro no banco; chave por organização (vazar uma não
entrega as outras); AES-256-GCM rejeita pacote adulterado; o `.pfx` nunca
toca o disco — PKCS#12 é aberto em memória com node-forge, e não via
`openssl` em arquivo temporário.

**Não resolve:** quem tiver acesso ao ambiente deste serviço abre tudo.
Separar de verdade exige KMS/HSM. É o degrau seguinte.

## Rodar local

```
npm install
FK_NFSE_MASTER_KEY=... FK_NFSE_TOKEN=... node servidor.js
```
