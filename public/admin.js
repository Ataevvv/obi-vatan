const PASS = 'obi2025';
let allOrders = [];
let activeFilter = 'all';
let activeTab = 'orders';

const DRIVERS = [
  { name: 'Алишер', icon: '🚗' },
  { name: 'Бахром',  icon: '🚙' },
  { name: 'Санжар',  icon: '🛻' },
  { name: 'Достон',  icon: '🚐' },
];

// ── Auth ──
function selectRole(role) {
  if (role === 'driver') {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('driverSection').style.display = 'block';
    const saved = localStorage.getItem('driverName');
    if (saved) selectDriver(saved);
  } else {
    document.getElementById('roleSelect').style.display = 'none';
    document.getElementById('adminLoginForm').style.display = 'block';
    setTimeout(() => document.getElementById('pwInput').focus(), 80);
  }
}

function exitToRoles() {
  clearInterval(refreshTimer);
  refreshTimer = null;
  currentDriver = null;
  knownOrderIds = new Set();
  document.getElementById('driverSection').style.display = 'none';
  document.getElementById('selectScreen').style.display = 'flex';
  document.getElementById('driverApp').style.display = 'none';
  document.getElementById('driverBtns').style.display = 'flex';
  document.getElementById('pinSection').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('roleSelect').style.display = 'block';
  document.getElementById('adminLoginForm').style.display = 'none';
}

function backToRoles() {
  document.getElementById('roleSelect').style.display = 'block';
  document.getElementById('adminLoginForm').style.display = 'none';
  document.getElementById('loginErr').textContent = '';
}

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
  backToRoles();
}

async function clearAllOrders() {
  if (!confirm('Удалить ВСЕ заказы? Это действие нельзя отменить.')) return;
  try {
    const r = await fetch('/api/orders/all', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'obi2025' })
    });
    if (r.ok) { alert('Все заказы удалены'); await loadData(); }
    else alert('Ошибка удаления');
  } catch { alert('Ошибка сети'); }
}

// ── Init ──
function initAdmin() {
  document.getElementById('aDate').textContent = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  loadData();
  setInterval(loadData, 5000);
}

// ── Tabs ──
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.a-tab').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && tab === 'orders') || (i === 1 && tab === 'dispatch') || (i === 2 && tab === 'archive'));
  });
  document.querySelector('.stats-row').style.display    = tab === 'orders'   ? '' : 'none';
  document.querySelector('.charts-row').style.display   = tab === 'orders'   ? '' : 'none';
  document.getElementById('dispatchPanel').style.display = tab === 'dispatch' ? '' : 'none';
  document.getElementById('archivePanel').style.display  = tab === 'archive'  ? '' : 'none';
  if (tab === 'dispatch') renderDispatcher(allOrders);
  if (tab === 'archive')  { loadData(); }
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
    if (activeTab === 'dispatch') renderDispatcher(allOrders);
    if (activeTab === 'archive')  renderArchive();
    updateDispatchBadge(allOrders);
  } catch {
    console.error('Ошибка загрузки');
  }
}

function updateDispatchBadge(orders) {
  const unassigned = orders.filter(o => o.status === 'new' && !o.assignedDriver).length;
  const badge = document.getElementById('dispatchBadge');
  if (unassigned > 0) {
    badge.textContent = unassigned;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
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

// ── Dispatcher ──
let dispatchMap = null;
let archivePeriod = 'today';

function renderDispatcher(orders) {
  const unassigned = orders.filter(o => o.status === 'new' && !o.assignedDriver);
  const inProgress = orders.filter(o => (o.status === 'new' && o.assignedDriver) || o.status === 'delivering');

  document.getElementById('unassignedCount').textContent = unassigned.length;
  document.getElementById('inProgressCount').textContent = inProgress.length;

  renderDispatchGrid('dispatchGrid', unassigned, false);
  renderDispatchGrid('inProgressGrid', inProgress, true);
  renderDispatchMap([...unassigned, ...inProgress]);
}

function renderDispatchGrid(elId, orders, isInProgress) {
  const el = document.getElementById(elId);
  if (!el) return;

  if (orders.length === 0) {
    el.innerHTML = `<div class="dc-empty"><p>${isInProgress ? 'Нет заказов в работе' : 'Все заказы распределены'}</p></div>`;
    return;
  }

  el.innerHTML = orders.map(o => {
    const bottles = [];
    if (o.qty6  > 0) bottles.push(`${o.qty6}×6Л`);
    if (o.qty16 > 0) bottles.push(`${o.qty16}×19Л`);
    const time = new Date(o.createdAt).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
    const mapsLink = `https://maps.google.com/?q=${encodeURIComponent(o.address)}`;

    const actions = isInProgress
      ? `<div class="dc-inprog">
          <span class="dc-drv-name">🚗 ${o.assignedDriver || 'В пути'}</span>
          <div class="dc-inprog-btns">
            <button class="dc-change-btn" onclick="showChangeDriver('${o.id}')">Изменить</button>
            <button class="dc-cancel-btn" onclick="cancelOrder('${o.id}')">Отменить</button>
          </div>
        </div>
        <div class="dc-change-drivers" id="chg-${o.id}" style="display:none">
          ${DRIVERS.map(d => `<button class="dc-driver-btn" onclick="assignOrder('${o.id}','${d.name}')">${d.icon} ${d.name}</button>`).join('')}
        </div>`
      : `<div class="dc-drivers">
          ${DRIVERS.map(d => `
            <button class="dc-driver-btn" onclick="assignOrder('${o.id}','${d.name}')">
              <span class="d-icon">${d.icon}</span>
              <span class="d-name">${d.name}</span>
            </button>`).join('')}
        </div>`;

    return `<div class="dc-card ${isInProgress ? 'in-progress' : ''}" id="dc-${o.id}">
      <div class="dc-top">
        <div class="dc-name">${o.name}</div>
        <div class="dc-time">${time}</div>
      </div>
      <div class="dc-addr"><a href="${mapsLink}" target="_blank" style="color:inherit;text-decoration:none">📍 ${o.address}</a></div>
      <div class="dc-row">
        <span class="dc-bottles">💧 ${bottles.join(' + ')}</span>
        <span class="dc-total">${o.total} сом</span>
      </div>
      ${o.notes ? `<div class="dc-notes">💬 ${o.notes}</div>` : ''}
      ${actions}
    </div>`;
  }).join('');
}

function showChangeDriver(orderId) {
  const el = document.getElementById(`chg-${orderId}`);
  if (el) el.style.display = el.style.display === 'none' ? 'grid' : 'none';
}

async function assignOrder(orderId, driverName) {
  try {
    await fetch(`/api/orders/${orderId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver: driverName })
    });
    await loadData();
  } catch { alert('Ошибка назначения'); }
}

async function unassignOrder(orderId) {
  try {
    await fetch(`/api/orders/${orderId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver: null })
    });
    await loadData();
  } catch { alert('Ошибка'); }
}

async function cancelOrder(orderId) {
  if (!confirm('Отменить этот заказ?')) return;
  try {
    await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' })
    });
    await loadData();
  } catch { alert('Ошибка отмены'); }
}

// ── Карта диспетчера (Яндекс) ──
function renderDispatchMap(orders) {
  const withCoords = orders.filter(o => o.lat && o.lng);
  const wrap = document.getElementById('dispatchMapWrap');
  if (!wrap) return;

  if (withCoords.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  ymaps.ready(function () {
    if (!dispatchMap) {
      dispatchMap = new ymaps.Map('dispatchMap', {
        center: [40.2833, 69.6333],
        zoom: 14,
        controls: ['zoomControl']
      });
    } else {
      dispatchMap.geoObjects.removeAll();
    }

    const BlueFlag = ymaps.templateLayoutFactory.createClass(
      '<div style="position:relative;width:24px;height:30px;cursor:pointer">' +
      '<div style="position:absolute;left:4px;bottom:0;width:3px;height:22px;background:#1a78c2;border-radius:1px 1px 0 0;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>' +
      '<div style="position:absolute;left:4px;top:0;width:18px;height:12px;background:#1a78c2;clip-path:polygon(0 0,100% 25%,100% 75%,0 100%);border-radius:0 3px 3px 0;filter:drop-shadow(0 2px 4px rgba(0,0,0,.2))"></div>' +
      '</div>'
    );

    const OrangeFlag = ymaps.templateLayoutFactory.createClass(
      '<div style="position:relative;width:24px;height:30px;cursor:pointer">' +
      '<div style="position:absolute;left:4px;bottom:0;width:3px;height:22px;background:#f97316;border-radius:1px 1px 0 0;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>' +
      '<div style="position:absolute;left:4px;top:0;width:18px;height:12px;background:#f97316;clip-path:polygon(0 0,100% 25%,100% 75%,0 100%);border-radius:0 3px 3px 0;filter:drop-shadow(0 2px 4px rgba(0,0,0,.2))"></div>' +
      '</div>'
    );

    const bounds = [];

    withCoords.forEach(function (o) {
      const isAssigned = !!o.assignedDriver;
      const mark = new ymaps.Placemark(
        [o.lat, o.lng],
        {
          balloonContent: `<b>${o.name}</b><br><span style="font-size:.8rem">${o.address}</span><br><b>${o.total} сом</b>${isAssigned ? `<br>🚗 ${o.assignedDriver}` : '<br>⏳ Ожидает назначения'}`
        },
        {
          iconLayout: isAssigned ? OrangeFlag : BlueFlag,
          iconShape: { type: 'Rectangle', coordinates: [[-2, -30], [22, 0]] }
        }
      );
      dispatchMap.geoObjects.add(mark);
      bounds.push([o.lat, o.lng]);
    });

    if (bounds.length === 1) {
      dispatchMap.setCenter(bounds[0], 16, { duration: 300 });
    } else if (bounds.length > 1) {
      dispatchMap.setBounds(ymaps.util.bounds.fromPoints(bounds), { checkZoomRange: true, zoomMargin: 60 });
    }
  });
}

// ── Архив ──
function setArchivePeriod(period, btn) {
  archivePeriod = period;
  document.querySelectorAll('.af-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderArchive();
}

function renderArchive() {
  const driverFilter = document.getElementById('afDriver')?.value || '';
  const statusFilter = document.getElementById('afStatus')?.value || '';

  const now = new Date();
  let from = null;
  if (archivePeriod === 'today') { from = new Date(now); from.setHours(0,0,0,0); }
  else if (archivePeriod === 'week') { from = new Date(now); from.setDate(now.getDate()-6); from.setHours(0,0,0,0); }
  else if (archivePeriod === 'month') { from = new Date(now); from.setDate(1); from.setHours(0,0,0,0); }

  let orders = [...allOrders].reverse();
  if (from) orders = orders.filter(o => new Date(o.createdAt) >= from);
  if (driverFilter) orders = orders.filter(o => o.assignedDriver === driverFilter);
  if (statusFilter) orders = orders.filter(o => o.status === statusFilter);

  const revenue = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
  const delivered = orders.filter(o => o.status === 'delivered').length;

  document.getElementById('archiveStats').innerHTML = `
    <div class="ar-stat"><div class="ars-val">${orders.length}</div><div class="ars-name">Всего заказов</div></div>
    <div class="ar-stat"><div class="ars-val green">${delivered}</div><div class="ars-name">Доставлено</div></div>
    <div class="ar-stat"><div class="ars-val blue">${revenue} сом</div><div class="ars-name">Выручка</div></div>
    <div class="ar-stat"><div class="ars-val">${orders.filter(o=>o.status==='cancelled').length}</div><div class="ars-name">Отменено</div></div>
  `;

  const statusMap = { new:'🆕 Новый', delivering:'🚚 В пути', delivered:'✅ Доставлен', cancelled:'❌ Отменён' };
  const statusCls = { new:'s-new', delivering:'s-delivering', delivered:'s-delivered', cancelled:'s-cancelled' };

  const el = document.getElementById('archiveList');
  if (orders.length === 0) {
    el.innerHTML = `<div class="empty-msg"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/></svg><p>Нет заказов за этот период</p></div>`;
    return;
  }

  el.innerHTML = orders.map(o => {
    const bottles = [];
    if (o.qty6  > 0) bottles.push(`${o.qty6}×6Л`);
    if (o.qty16 > 0) bottles.push(`${o.qty16}×19Л`);
    const dt = new Date(o.createdAt).toLocaleDateString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const cls = statusCls[o.status] || 's-new';
    const label = statusMap[o.status] || o.status;
    return `<div class="order-card ${cls}">
      <div class="oc-left">
        <div class="oc-name">${o.name} <span class="oc-phone">${o.phone}</span></div>
        <div class="oc-addr"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${o.address}</span></div>
        <div class="oc-meta">
          <span class="oc-bottles">💧 ${bottles.join(' + ')}</span>
          ${o.assignedDriver ? `<span class="oc-driver">🚗 ${o.assignedDriver}</span>` : ''}
        </div>
      </div>
      <div class="oc-right"><span class="sbadge ${cls}">${label}</span><div class="oc-sum">${o.total} сом</div><div class="oc-time">${dt}</div></div>
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
