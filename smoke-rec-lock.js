// Receita lock smoke test
const receita = {
  years: {
    "2026": {
      clients: [{ id: 1, meses: {} }],
      leads: []
    }
  }
};
let recActiveYear = "2026";
function receitaSave(){}
function updateRecRowTotal(){}
function updateRecTotals(){}
function parseBR(v){
  if(v === '' || v == null) return '';
  const s = String(v).replace(/\./g,'').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? '' : n;
}
let _notifiedLocked = 0;
function notifyLocked(){ _notifiedLocked++; }
const document_ = { querySelector: () => null };

function saveRecMes(type, id, mes, rawVal){
  const d = receita.years[recActiveYear];
  const list = type==='lead' ? d.leads : d.clients;
  const row = list.find(r=>r.id===id); if(!row) return;
  const cur = row.meses && row.meses[mes];
  if(cur && cur.status === 'recebido' && cur.valor !== '' && cur.valor != null && cur.valor !== 0){
    notifyLocked();
    return;
  }
  const n = parseBR(rawVal);
  if(!row.meses[mes]) row.meses[mes] = {valor:'', status:'aberto'};
  row.meses[mes].valor = (n !== '' && n !== 0) ? n : '';
  receitaSave();
  updateRecRowTotal();
  updateRecTotals();
}

// Test 1: normal write
saveRecMes('client', 1, 'jan', '5000');
console.assert(receita.years["2026"].clients[0].meses.jan.valor === 5000, 'REC normal failed');

// Test 2: mark as recebido, try to edit → locked
receita.years["2026"].clients[0].meses.jan.status = 'recebido';
saveRecMes('client', 1, 'jan', '9999');
console.assert(receita.years["2026"].clients[0].meses.jan.valor === 5000, 'REC lock failed');
console.assert(_notifiedLocked === 1, 'REC notify not called');

// Test 3: unlock (back to aberto) and edit
receita.years["2026"].clients[0].meses.jan.status = 'aberto';
saveRecMes('client', 1, 'jan', '7000');
console.assert(receita.years["2026"].clients[0].meses.jan.valor === 7000, 'REC unlock failed');

console.log('REC LOCK TESTS PASSED — notify called ' + _notifiedLocked + ' time(s)');
