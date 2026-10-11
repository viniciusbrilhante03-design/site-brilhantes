// Seed owner user + demo sales for Brilhantes Imóveis
use('test_database');

const uid = 'user_owner_vinicius';
db.users.deleteMany({ email: 'viniciusbrilhante03@gmail.com' });
db.sales.deleteMany({ user_id: uid });
db.user_sessions.deleteMany({ user_id: uid });

db.users.insertOne({
  user_id: uid,
  email: 'viniciusbrilhante03@gmail.com',
  name: 'Vinícius Brilhante',
  picture: null,
  created_at: new Date().toISOString(),
});

// Persistent QA session token
const qaToken = 'qa_session_vinicius_001';
db.user_sessions.insertOne({
  user_id: uid,
  session_token: qaToken,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
});

function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
function sid() { return 'sale_' + Math.random().toString(16).slice(2, 14); }

function makeInstallments(date, remaining, n, receivedCount) {
  const per = Math.round((remaining / n) * 100) / 100;
  const list = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    let value = per;
    if (i === n - 1) value = Math.round((remaining - acc) * 100) / 100;
    acc += per;
    const received = i < receivedCount;
    list.push({
      number: i + 1,
      due_date: addMonths(date, i + 1),
      value: value,
      received: received,
      received_date: received ? addMonths(date, i + 1) : null,
    });
  }
  return list;
}

const brokers = ['Ana Paula Souza', 'Carlos Mendes', 'Juliana Rocha', 'Rafael Lima'];
const imoveis = [
  'Apto 1203 - Ed. Aurora', 'Casa Alphaville Q7', 'Cobertura Vista Mar',
  'Apto 802 - Ed. Solaris', 'Terreno Jardim das Flores', 'Casa Condomínio Verde',
  'Sala Comercial Centro', 'Apto 405 - Ed. Monet', 'Studio Downtown',
  'Casa Praia Grande', 'Apto 1501 - Ed. Horizonte', 'Loft Industrial',
];

const rows = [
  // 2026 June
  { date: '2026-06-03', value: 850000, rate: 5, entrada: 85000, broker: 0, imovel: 0, parc: 4, recv: 2 },
  { date: '2026-06-12', value: 1250000, rate: 4, entrada: 250000, broker: 1, imovel: 1, parc: 6, recv: 1 },
  { date: '2026-06-20', value: 480000, rate: 6, entrada: 480000, broker: 2, imovel: 8, parc: 0, recv: 0 },
  { date: '2026-06-25', value: 2100000, rate: 4.5, entrada: 300000, broker: 0, imovel: 2, parc: 10, recv: 3 },
  // 2026 May
  { date: '2026-05-05', value: 690000, rate: 5, entrada: 69000, broker: 3, imovel: 3, parc: 5, recv: 5 },
  { date: '2026-05-18', value: 320000, rate: 6, entrada: 320000, broker: 1, imovel: 4, parc: 0, recv: 0 },
  { date: '2026-05-28', value: 975000, rate: 5, entrada: 150000, broker: 2, imovel: 5, parc: 6, recv: 2 },
  // 2026 Apr
  { date: '2026-04-10', value: 540000, rate: 5.5, entrada: 54000, broker: 0, imovel: 6, parc: 4, recv: 4 },
  { date: '2026-04-22', value: 1800000, rate: 4, entrada: 400000, broker: 3, imovel: 7, parc: 8, recv: 2 },
  // 2026 Mar
  { date: '2026-03-15', value: 430000, rate: 6, entrada: 430000, broker: 1, imovel: 9, parc: 0, recv: 0 },
  { date: '2026-03-30', value: 1150000, rate: 4.5, entrada: 200000, broker: 2, imovel: 10, parc: 6, recv: 6 },
  // 2026 Feb/Jan
  { date: '2026-02-14', value: 620000, rate: 5, entrada: 62000, broker: 0, imovel: 11, parc: 4, recv: 3 },
  { date: '2026-01-20', value: 890000, rate: 5, entrada: 90000, broker: 3, imovel: 0, parc: 5, recv: 5 },
];

const docs = rows.map((r) => {
  const commission_value = Math.round(r.value * r.rate) / 100;
  const parcelado = r.parc > 0;
  const remaining = r.value - r.entrada;
  const installments = parcelado ? makeInstallments(r.date, remaining, r.parc, r.recv) : [];
  return {
    id: sid(),
    user_id: uid,
    property_name: imoveis[r.imovel],
    client_name: '',
    broker_name: brokers[r.broker],
    sale_date: r.date,
    sale_value: r.value,
    commission_rate: r.rate,
    commission_value: commission_value,
    entrada: r.entrada,
    parcelado: parcelado,
    installments: installments,
    notes: '',
    created_at: new Date().toISOString(),
  };
});

db.sales.insertMany(docs);
print('Seeded ' + docs.length + ' sales. QA token: ' + qaToken);
