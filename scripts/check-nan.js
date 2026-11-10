#!/usr/bin/env node
'use strict';
/* CAÇA O MAIS-UNÁRIO QUE VIRA NaN.
 *
 * O montador da DPS é uma cadeia de concatenação em que cada linha começa
 * com `+`. Quando uma linha de continuação também começa com `+`, o
 * JavaScript lê `+ +algo` — e o segundo vira mais-unário, que converte a
 * string para número: `+'<cNBS>112</cNBS>'` é NaN.
 *
 * Não é erro de sintaxe. Passa no `node --check`, passa no editor, e só
 * aparece como um "NaN" no meio do XML — que a Receita recusa com uma
 * mensagem que não tem nada a ver com a causa.
 *
 * Me pegou três vezes no mesmo dia. Agora o deploy pega antes.
 */
const fs = require('fs');
const path = require('path');

const ALVOS = ['src/nfse/dps.js', 'src/nfse/cofre.js', 'src/nfse/servidor.js', 'src/nfse/email.js'];
const raiz = path.join(__dirname, '..');
let problemas = 0;

for(const rel of ALVOS){
  const abs = path.join(raiz, rel);
  if(!fs.existsSync(abs)) continue;
  const linhas = fs.readFileSync(abs, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    /* `+` de concatenação seguido de outro `+` antes de algo que não é
       número: `+ + el(...)`, `+   +'texto'`. Dois `++` colados são
       incremento, não isto. */
    if(/^\s*\+\s+\+\s*(?!\+)[A-Za-z_'"`(]/.test(linha)){
      console.error(`${rel}:${i + 1}  mais-unário vira NaN →${linha.replace(/\s+/g, ' ')}`);
      problemas++;
    }
  });
}

/* Checagem de verdade: monta uma DPS completa e procura NaN no XML.
   A regra acima pega a forma; esta pega o efeito, inclusive de outras
   causas (um número que chegou undefined, por exemplo). */
try {
  const { montaDPS } = require(path.join(raiz, 'src/nfse/dps.js'));
  const { xml } = montaDPS({
    tpAmb: '2', dhEmi: '2026-01-01T00:00:00-03:00', verAplic: 'TESTE',
    serie: '900', nDPS: '1', dCompet: '2026-01-01', cLocEmi: '4205407',
    cLocPrestacao: '4205407', prest: { CNPJ: '00000000000191', IM: '', opSimpNac: '1' },
    toma: { CNPJ: '00000000000191', xNome: 'TESTE', cMun: '4205407', CEP: '88000000',
            xLgr: 'Rua', nro: '1', xBairro: 'Centro' },
    cTribNac: '010101', cNBS: '112013100', xDescServ: 'teste', vServ: 100,
    tribISSQN: '1', cIndOp: '100301', CST: '000', cClassTrib: '000001',
    pPis: 0.65, pCofins: 3, pCsll: 1, pIrrf: 1.5,
    pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0,
  });
  if(/NaN|undefined/.test(xml)){
    console.error('src/nfse/dps.js  a DPS montada contém NaN ou undefined:');
    console.error('  ' + (xml.match(/.{0,60}(NaN|undefined).{0,60}/) || [''])[0]);
    problemas++;
  }
} catch(e) {
  console.error('src/nfse/dps.js  não consegui montar uma DPS de teste: ' + e.message);
  problemas++;
}

if(problemas){
  console.error(`\n${problemas} problema(s) que viram XML inválido sem dar erro de sintaxe.`);
  process.exit(1);
}
console.log('OK · nenhum NaN escondido na DPS');
