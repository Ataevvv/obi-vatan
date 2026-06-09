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
  subscribeToPush(name);
}

// ─── Push подписка ───
function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeToPush(driverName) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const { key } = await fetch('/api/push/vapid-public').then(r => r.json());

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(key)
    });

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverName, subscription: sub })
    });
    console.log('✅ Push подписка активна для', driverName);
  } catch (e) {
    console.log('Push подписка недоступна:', e.message);
  }
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
  const el = document.getElementById('drMain');
  const dbg = document.getElementById('drDebugBar');
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const all = await res.json();

    const mine = all.filter(o =>
      o.assignedDriver === currentDriver &&
      (o.status === 'new' || o.status === 'delivering')
    );

    const done = all.filter(o =>
      o.assignedDriver === currentDriver &&
      o.status === 'delivered'
    );

    if (dbg) {
      const assignedToMe = all.filter(o => o.assignedDriver === currentDriver);
      dbg.textContent = `Вход: ${currentDriver} | В базе: ${all.length} заказов | Назначено мне: ${assignedToMe.length} | Активных: ${mine.length}`;
    }

    renderHistory(done);

    const newOnes = mine.filter(o => !knownOrderIds.has(o.id));
    if (knownOrderIds.size > 0 && newOnes.length > 0) playSound();
    mine.forEach(o => knownOrderIds.add(o.id));

    renderDriverOrders(mine);
  } catch (e) {
    if (dbg) dbg.textContent = `Ошибка: ${e.message}`;
    el.innerHTML = `<div class="dr-loading" style="color:#f59e0b">
      ⏳ Сервер запускается...<br>
      <span style="font-size:.78rem;opacity:.7">Подождите 30–60 секунд</span>
    </div>`;
  }
}

function renderDriverOrders(orders) {
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

      <a class="do-row do-addr-link"
         href="${o.lat && o.lng
           ? `https://yandex.ru/maps/?pt=${o.lng},${o.lat}&z=17&l=map`
           : `https://yandex.ru/maps/?text=${encodeURIComponent(o.address + ' Худжанд')}`}"
         target="_blank" rel="noopener">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${o.address}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="opacity:.5;margin-left:3px;flex-shrink:0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>

      <div class="do-bottles">💧 ${bottles.join(' + ')}</div>

      ${o.notes ? `<div class="do-notes">💬 ${o.notes}</div>` : ''}

      <div class="do-total">${o.total} сомон</div>

      ${o.lat && o.lng ? `<div class="do-map-wrap" id="orderMapWrap-${o.id}"><div id="orderMap-${o.id}" class="do-map"></div></div>` : ''}

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

  initOrderMaps(orders);
}

function initOrderMaps(orders) {
  if (typeof ymaps === 'undefined') return;
  ymaps.ready(function () {
    orders.filter(function (o) { return o.lat && o.lng; }).forEach(function (o) {
      const el = document.getElementById('orderMap-' + o.id);
      if (!el || el.dataset.init) return;
      el.dataset.init = '1';
      const map = new ymaps.Map(el, {
        center: [o.lat, o.lng],
        zoom: 16,
        controls: []
      }, { suppressMapOpenBlock: true });
      map.behaviors.disable(['scrollZoom', 'drag']);
      const pin = new ymaps.Placemark([o.lat, o.lng], {}, { preset: 'islands#redIcon' });
      map.geoObjects.add(pin);
    });
  });
}

function renderHistory(done) {
  let el = document.getElementById('drHistory');
  if (!el) {
    el = document.createElement('div');
    el.id = 'drHistory';
    el.style.cssText = 'padding:16px;margin-top:8px;border-top:2px solid #e2ecf5';
    document.getElementById('drMain').after(el);
  }
  if (done.length === 0) { el.innerHTML = ''; return; }
  const revenue = done.reduce((s, o) => s + o.total, 0);
  el.innerHTML = `
    <div style="font-size:.8rem;font-weight:700;color:#64748b;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">
      История за сегодня
    </div>
    <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:1.1rem;font-weight:800;color:#15803d">${done.length} доставок</div>
        <div style="font-size:.78rem;color:#16a34a">сегодня</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:1.1rem;font-weight:800;color:#15803d">${revenue} сом</div>
        <div style="font-size:.78rem;color:#16a34a">выручка</div>
      </div>
    </div>
    ${done.map(o => {
      const time = new Date(o.createdAt).toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'});
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e2ecf5;font-size:.82rem">
        <span style="color:#334155">${o.name} · ${o.address.substring(0,25)}...</span>
        <span style="color:#16a34a;font-weight:700">${o.total} сом</span>
      </div>`;
    }).join('')}`;
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

// Автовход запускается через switchAppTab в script.js
