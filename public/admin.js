const PASS = 'obi2025';
let allOrders = [];
let activeFilter = 'all';

// ── Auth ──
function doLogin() {
  if (document.getElementById('pwInput').value === PASS) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'flex';
    initAdmin();
  } else {
    document.getElementById('loginErr').textContent = 'Неверный пароль';
  }
}
document.getElementById('pwInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
function doLogout() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('pwInput').value = '';
}

// ── Init ──
function initAdmin() {
  document.getElementById('aDate').textContent = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  loadData();
  setInterval(loadData, 5000);
}

// ── Load ──
async function loadData() {
  try {
    const [ordersRes, clientsRes] = await Promise.all([fetch('/api/orders'), fetch('/api/clients')]);
    allOrders = await ordersRes.json();
    const clients = await clientsRes.json();
    renderStats(allOrders);
    renderOrders(allOrders);
    renderWeekStats(allOrders);
    renderProductStats(allOrders);
    renderDriverStats(allOrders);
    renderClientsStats(clients);
  } catch {
    console.error('Ошибка загрузки');
  }
}

// ── Stats ──
function renderStats(orders) {
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === today);
  const newOrders = orders.filter(o => o.status === 'new');
  const onWay = orders.filter(o => o.status === 'delivering');
  const delivered = todayOrders.filter(o => o.status === 'delivered');
  const revenue = delivered.reduce((s, o) => s + o.total, 0);

  document.getElementById('sTotal').textContent = orders.length;
  document.getElementById('sNew').textContent = newOrders.length;
  document.getElementById('sOnWay').textContent = onWay.length;
  document.getElementById('sDelivered').textContent = delivered.length;
  document.getElementById('sRevenue').textContent = revenue + ' сомон';

  document.getElementById('sNew').closest('.stat-box')
    .classList.toggle('has-new', newOrders.length > 0);
}

// ── Фильтр ──
function filterBy(status) {
  activeFilter = status;
  document.querySelectorAll('.stat-box').forEach(b => b.classList.remove('active-filter'));
  const boxes = document.querySelectorAll('.stat-box');
  if (status === 'all') boxes[0].classList.add('active-filter');
  else if (status === 'new') boxes[1].classList.add('active-filter');
  else if (status === 'delivering') boxes[2].classList.add('active-filter');
  else if (status === 'delivered') boxes[3].classList.add('active-filter');
  renderOrders(allOrders);
}

// ── Render orders ──
function renderOrders(orders) {
  const today = new Date().toDateString();
  let filtered = orders.filter(o => new Date(o.createdAt).toDateString() === today);

  const filterLabel = { all: 'Заказы за сегодня', new: 'Новые заказы', delivering: 'В пути', delivered: 'Доставлено сегодня' };
  const h3 = document.querySelector('#ordersPanel h3 span');
  if (h3) h3.textContent = filterLabel[activeFilter] || 'Заказы за сегодня';

  if (activeFilter !== 'all') filtered = filtered.filter(o => o.status === activeFilter);
  filtered = filtered.reverse();

  const el = document.getElementById('todayOrders');
  if (filtered.length === 0) {
    el.innerHTML = `<div class="empty-msg"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><p>Нет заказов</p></div>`;
    return;
  }

  const statusMap = {
    new: ['s-new','🆕 Новый'],
    delivering: ['s-delivering','🚚 В пути'],
    delivered: ['s-delivered','✅ Доставлен'],
    cancelled: ['s-cancelled','❌ Отменён']
  };

  el.innerHTML = filtered.map(o => {
    const bottles = [];
    if (o.qty6 > 0) bottles.push(`${o.qty6}×6Л`);
    if (o.qty16 > 0) bottles.push(`${o.qty16}×16Л`);
    const [cls, label] = statusMap[o.status] || ['s-new', o.status];
    const time = new Date(o.createdAt).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
    const ratingHtml = o.rating ? '⭐'.repeat(o.rating) : '';
    const driverHtml = o.driverName
      ? `<span class="oc-driver"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>${o.driverName}${ratingHtml ? ' ' + ratingHtml : ''}</span>`
      : `<span class="oc-driver no-driver">Ожидает водителя</span>`;

    return `<div class="order-card ${cls}">
      <div class="oc-left">
        <div class="oc-name">${o.name}</div>
        <div class="oc-addr"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${o.address}</span></div>
        <div class="oc-meta"><span class="oc-bottles"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/></svg>${bottles.join(' + ')}</span>${driverHtml}</div>
      </div>
      <div class="oc-right"><span class="sbadge ${cls}">${label}</span><div class="oc-sum">${o.total} сом</div><div class="oc-time">${time}</div></div>
    </div>`;
  }).join('');
}

// ── Week stats ──
function renderWeekStats(orders) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toDateString();
    const dayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === dateStr);
    const revenue = dayOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
    days.push({ label: d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' }), count: dayOrders.length, revenue });
  }
  document.getElementById('weekStats').innerHTML = days.map(d => `
    <div class="week-row">
      <span class="w-day">${d.label}</span>
      <span class="w-count">${d.count} зак.</span>
      <span class="w-sum">${d.revenue} сом</span>
    </div>`).join('');
}

// ── Product stats ──
function renderProductStats(orders) {
  const total6 = orders.reduce((s, o) => s + (o.qty6 || 0), 0);
  const total16 = orders.reduce((s, o) => s + (o.qty16 || 0), 0);
  const maxVal = Math.max(total6, total16, 1);
  document.getElementById('productStats').innerHTML = `
    <div class="prod-bars">
      <div class="pb-item">
        <div class="pb-top"><span>6-литровая</span><span>${total6} шт · ${total6 * 7} сом</span></div>
        <div class="pb-track"><div class="pb-fill" style="width:${(total6/maxVal*100).toFixed(0)}%"></div></div>
      </div>
      <div class="pb-item">
        <div class="pb-top"><span>16-литровая</span><span>${total16} шт · ${total16 * 25} сом</span></div>
        <div class="pb-track"><div class="pb-fill" style="width:${(total16/maxVal*100).toFixed(0)}%"></div></div>
      </div>
    </div>`;
}

// ── Driver stats с оценками ──
function renderDriverStats(orders) {
  const today = new Date().toDateString();
  const driverMap = {};
  orders.forEach(o => {
    if (!o.driverName) return;
    if (!driverMap[o.driverName]) driverMap[o.driverName] = { name: o.driverName, total: 0, today: 0, revenue: 0, ratings: [] };
    driverMap[o.driverName].total++;
    if (o.rating) driverMap[o.driverName].ratings.push(o.rating);
    if (new Date(o.createdAt).toDateString() === today && o.status === 'delivered') {
      driverMap[o.driverName].today++;
      driverMap[o.driverName].revenue += o.total;
    }
  });

  const drivers = Object.values(driverMap).sort((a, b) => b.today - a.today);
  const el = document.getElementById('driverStats');
  if (!el) return;
  if (drivers.length === 0) { el.innerHTML = '<div class="empty-msg" style="padding:16px"><p>Нет данных</p></div>'; return; }

  el.innerHTML = drivers.map((d, i) => {
    const avgRating = d.ratings.length ? (d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length).toFixed(1) : null;
    const stars = avgRating ? '⭐ ' + avgRating : '';
    return `<div class="driver-row">
      <div class="dr-rank">${i + 1}</div>
      <div class="dr-info">
        <div class="dr-name">${d.name} ${stars}</div>
        <div class="dr-meta">Сегодня: ${d.today} дост. · ${d.revenue} сом</div>
      </div>
      <div class="dr-badge">${d.total} всего</div>
    </div>`;
  }).join('');
}

// ── Clients stats ──
function renderClientsStats(clients) {
  const el = document.getElementById('clientsStats');
  if (!el) return;
  if (clients.length === 0) { el.innerHTML = '<div class="empty-msg" style="padding:16px"><p>Нет клиентов</p></div>'; return; }

  const sorted = [...clients].sort((a, b) => b.orderCount - a.orderCount);
  el.innerHTML = sorted.map(c => `
    <div class="driver-row">
      <div class="dr-rank">${c.orderCount}</div>
      <div class="dr-info">
        <div class="dr-name">${c.name}</div>
        <div class="dr-meta">${c.phone} · ${c.address}</div>
      </div>
    </div>`).join('');
}
