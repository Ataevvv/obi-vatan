// PIN каждого водителя — поменяйте по своему усмотрению
const DRIVER_PINS = {
  'Алишер': '1111',
  'Бахром':  '2222',
  'Санжар':  '3333',
  'Достон':  '4444',
};

let currentDriver = null;
let pendingDriver = null;
let knownOrderIds = new Set();
let refreshTimer = null;

// Звук уведомления
let audioCtx = null;
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Тихий звук чтобы разблокировать
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
    audioUnlocked = true;
  } catch {}
}

// Разблокируем при первом касании
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

function playSound() {
  if (!audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.12);
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.24);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.6);
  } catch {}
}

function pickDriver(name, btn) {
  pendingDriver = name;
  document.getElementById('driverBtns').style.display = 'none';
  document.getElementById('pinSection').style.display = 'block';
  document.getElementById('pinLabel').textContent = `PIN для ${name}`;
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').textContent = '';
  document.getElementById('pinInput').focus();
}

function backToSelect() {
  pendingDriver = null;
  document.getElementById('driverBtns').style.display = 'flex';
  document.getElementById('pinSection').style.display = 'none';
}

function checkPin() {
  const entered = document.getElementById('pinInput').value;
  if (entered === DRIVER_PINS[pendingDriver]) {
    selectDriver(pendingDriver);
  } else {
    document.getElementById('pinError').textContent = 'Неверный PIN';
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput').focus();
  }
}

function selectDriver(name) {
  currentDriver = name;
  localStorage.setItem('driverName', name);
  document.getElementById('selectScreen').style.display = 'none';
  document.getElementById('driverApp').style.display = 'flex';
  document.getElementById('driverApp').style.flexDirection = 'column';
  document.getElementById('driverName').textContent = name;
  loadOrders();
  refreshTimer = setInterval(loadOrders, 5000);
}

function changeDriver() {
  clearInterval(refreshTimer);
  currentDriver = null;
  knownOrderIds = new Set();
  localStorage.removeItem('driverName');
  document.getElementById('selectScreen').style.display = 'flex';
  document.getElementById('driverApp').style.display = 'none';
}

async function loadOrders() {
  if (!currentDriver) return;
  try {
    const res = await fetch('/api/orders');
    const all = await res.json();

    const today = new Date().toDateString();
    const mine = all.filter(o =>
      o.assignedDriver === currentDriver &&
      (o.status === 'new' || o.status === 'delivering') &&
      new Date(o.createdAt).toDateString() === today
    );

    // Проверяем новые заказы
    const newOnes = mine.filter(o => !knownOrderIds.has(o.id));
    if (knownOrderIds.size > 0 && newOnes.length > 0) {
      playSound();
    }
    mine.forEach(o => knownOrderIds.add(o.id));

    renderOrders(mine);
  } catch {
    document.getElementById('drMain').innerHTML =
      '<div class="dr-loading">Нет соединения...</div>';
  }
}

function renderOrders(orders) {
  const el = document.getElementById('drMain');

  if (orders.length === 0) {
    el.innerHTML = `
      <div class="dr-empty">
        <div class="dr-empty-icon">✅</div>
        <h3>Новых заказов нет</h3>
        <p>Страница обновляется автоматически каждые 5 секунд</p>
      </div>`;
    return;
  }

  el.innerHTML = orders.map(o => {
    const bottles = [];
    if (o.qty6 > 0) bottles.push(`${o.qty6} × 6Л`);
    if (o.qty16 > 0) bottles.push(`${o.qty16} × 19Л`);
    const time = new Date(o.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const isNew = o.status === 'new';
    const isDelivering = o.status === 'delivering';

    return `<div class="dr-order ${isNew ? 'new-order' : 'delivering'}" id="ord-${o.id}">
      ${isNew ? '<div class="do-new-badge">🆕 НОВЫЙ ЗАКАЗ</div>' : ''}

      <div class="do-top">
        <div class="do-name">${o.name}</div>
        <div class="do-time">${time}</div>
      </div>

      <div class="do-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${o.address}
      </div>

      <div class="do-bottles">💧 ${bottles.join(' + ')}</div>

      ${o.notes ? `<div class="do-notes">💬 ${o.notes}</div>` : ''}

      <div class="do-total">${o.total} сомон</div>

      <div class="do-actions">
        <a href="tel:${o.phone}" class="btn-call">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.63a16 16 0 0 0 5.86 5.86l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Позвонить
        </a>
        <button class="btn-delivered" onclick="markDelivered('${o.id}', this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          Доставлен
        </button>
      </div>
    </div>`;
  }).join('');
}

async function markDelivered(orderId, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'delivered' })
    });
    const card = document.getElementById(`ord-${orderId}`);
    if (card) {
      card.style.transition = 'opacity .4s';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 400);
    }
  } catch {
    btn.disabled = false;
    btn.textContent = 'Доставлен';
    alert('Ошибка. Попробуйте ещё раз.');
  }
}

// Enter в поле PIN
document.addEventListener('DOMContentLoaded', () => {
  const pinInput = document.getElementById('pinInput');
  if (pinInput) {
    pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkPin(); });
  }
});

// Автовход если уже выбирал
const saved = localStorage.getItem('driverName');
if (saved) selectDriver(saved);
