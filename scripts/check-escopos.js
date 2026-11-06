#!/usr/bin/env node
/* Compara a FONTE ÚNICA de permissões do Slack (src/worker.js) com os dois
 * manifests. Eles não podem ser gerados automaticamente — o formato é do
 * Slack e o arquivo é colado no painel deles — mas podem ser conferidos.
 *
 * Existe porque a lista morava em quatro lugares e uma delas já estava
 * errada: o diagnóstico não conferia `im:read`, `im:write` nem `im:history`,
 * então o app podia estar sem eles e a tela dizia "ok". */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

const worker = fs.readFileSync(path.join(raiz, 'src/worker.js'), 'utf8');
const bloco = worker.match(/const SLACK_PERMISSOES = \[([\s\S]*?)\n\];/);
if(!bloco){ console.error('✗ não achei SLACK_PERMISSOES em src/worker.js'); process.exit(1); }
const canonico = [...bloco[1].matchAll(/escopo:\s*'([^']+)'/g)].map(m => m[1]);

const json = JSON.parse(fs.readFileSync(path.join(raiz, 'src/slack-manifest.json'), 'utf8'));
const doJson = json.oauth_config.scopes.bot;

const yaml = fs.readFileSync(path.join(raiz, 'src/slack-manifest.yaml'), 'utf8');
/* `commands` não tem dois-pontos — um regex exigindo `x:y` o perdia e o
   checador acusava divergência que não existia. Escopo do Slack é um token
   com ou sem `:`. */
const doYaml = [...yaml.matchAll(/^\s*-\s*([a-z_]+(?::[a-z_.]+)?)\s*(?:#|$)/gm)].map(m => m[1]);

const falhas = [];
const comparar = (nome, lista) => {
  const faltando = canonico.filter(x => !lista.includes(x));
  const sobrando = lista.filter(x => !canonico.includes(x));
  if(faltando.length) falhas.push(nome + ' NÃO pede: ' + faltando.join(', '));
  if(sobrando.length) falhas.push(nome + ' pede a mais: ' + sobrando.join(', '));
};
comparar('slack-manifest.json', doJson);
comparar('slack-manifest.yaml', doYaml);

/* Toda permissão precisa das DUAS explicações: a da tela do Forekash e a
   justificativa que o painel do Slack exige. Faltar uma é descobrir tarde. */
const semPra   = [...bloco[1].matchAll(/escopo:\s*'([^']+)'[\s\S]*?(?=\{ escopo|$)/g)]
  .filter(m => !/pra:\s*'[^']+'/.test(m[0])).map(m => m[1]);
const semSlack = [...bloco[1].matchAll(/escopo:\s*'([^']+)'[\s\S]*?(?=\{ escopo|$)/g)]
  .filter(m => !/slack:\s*'[^']+'/.test(m[0])).map(m => m[1]);
if(semPra.length)   falhas.push('sem texto de tela (`pra`): ' + semPra.join(', '));
if(semSlack.length) falhas.push('sem justificativa pro Slack (`slack`): ' + semSlack.join(', '));

if(falhas.length){
  console.error('\n✗ escopos do Slack fora de sincronia:');
  for(const f of falhas) console.error('    ' + f);
  console.error('\n  A fonte única é SLACK_PERMISSOES em src/worker.js.\n');
  process.exit(1);
}
console.log('OK · ' + canonico.length + ' escopos iguais na fonte e nos 2 manifests');
