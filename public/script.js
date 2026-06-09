// ── Машина анимация — один раз при загрузке ──
// CSS уже запускает анимацию автоматически, повтор не нужен

// ── Переключение вкладок (Главная / Водитель) ──
let driverTabInited = false;

function switchAppTab(tab) {
  const sec = document.getElementById('driverSection');
  const bc  = document.getElementById('bnClient');
  const bd  = document.getElementById('bnDriver');
  if (tab === 'driver') {
    sec.style.display = 'block';
    bc.classList.remove('active');
    bd.classList.add('active');
    if (!driverTabInited) {
      driverTabInited = true;
      const saved = localStorage.getItem('driverName');
      if (saved) selectDriver(saved);
    }
  } else {
    sec.style.display = 'none';
    bc.classList.add('active');
    bd.classList.remove('active');
    if (typeof refreshTimer !== 'undefined' && refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }
}

// ── PWA Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const PRICE_6 = 7, PRICE_16 = 20;
const qty = { qty6: 0, qty16: 0 };

// ── Sticky header ──
window.addEventListener('scroll', () => {
  document.getElementById('header').classList.toggle('scrolled', window.scrollY > 40);
});

// ── Реалистичные капли воды на canvas ──
(function initDrops() {
  const canvas = document.getElementById('dropsCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Drop {
    constructor() { this.reset(true); }

    reset(initial) {
      this.x = Math.random() * canvas.width;
      this.y = initial ? Math.random() * canvas.height : -20;
      this.r = 3 + Math.random() * 7;
      this.speed = 1.5 + Math.random() * 3.5;
      this.wobble = Math.random() * Math.PI * 2;
      this.wobbleSpeed = 0.03 + Math.random() * 0.05;
      this.opacity = 0.25 + Math.random() * 0.45;
      this.trail = [];
    }

    update() {
      this.wobble += this.wobbleSpeed;
      this.x += Math.sin(this.wobble) * 0.4;
      this.y += this.speed;
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 18) this.trail.shift();
      if (this.y > canvas.height + 30) this.reset(false);
    }

    draw() {
      if (this.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(this.trail[0].x, this.trail[0].y - this.r);
        for (let i = 1; i < this.trail.length; i++) {
          ctx.lineTo(this.trail[i].x, this.trail[i].y - this.r);
        }
        ctx.strokeStyle = `rgba(140,220,255,${this.opacity * 0.25})`;
        ctx.lineWidth = this.r * 0.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Тело капли
      const grd = ctx.createRadialGradient(
        this.x - this.r * 0.3, this.y - this.r * 0.3, this.r * 0.1,
        this.x, this.y, this.r * 1.1
      );
      grd.addColorStop(0, `rgba(230,248,255,${this.opacity * 0.95})`);
      grd.addColorStop(0.4, `rgba(120,200,255,${this.opacity * 0.7})`);
      grd.addColorStop(1, `rgba(60,140,220,${this.opacity * 0.2})`);

      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r * 0.72, this.r, 0, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Блик
      ctx.beginPath();
      ctx.ellipse(
        this.x - this.r * 0.22, this.y - this.r * 0.28,
        this.r * 0.18, this.r * 0.28, -0.4, 0, Math.PI * 2
      );
      ctx.fillStyle = `rgba(255,255,255,${this.opacity * 0.7})`;
      ctx.fill();
    }
  }

  const drops = Array.from({ length: 38 }, () => new Drop());

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drops.forEach(d => { d.update(); d.draw(); });
    requestAnimationFrame(animate);
  }
  animate();
})();

// ── CSS капли в hero-canvas (старые полоски оставляем) ──
function createWaterEffect() {
  const canvas = document.getElementById('waterCanvas');
  if (!canvas) return;
  for (let i = 0; i < 20; i++) {
    const s = document.createElement('div');
    s.className = 'drop-streak';
    s.style.cssText = `left:${Math.random()*100}%;height:${50+Math.random()*100}px;opacity:${0.1+Math.random()*0.3};animation-duration:${3+Math.random()*5}s;animation-delay:${-Math.random()*6}s;`;
    canvas.appendChild(s);
  }
}
createWaterEffect();

// ── Карта для выбора адреса ──
let addrMap = null;
let addrMarker = null;
let addrSearchTimer = null;
const KHUJAND = [40.2833, 69.6333];

function initAddressMap() {
  if (addrMap) { addrMap.invalidateSize(); return; }
  addrMap = L.map('addrMap', { zoomControl: true, attributionControl: false }).setView(KHUJAND, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(addrMap);
  addrMap.on('click', e => placeAddrMarker(e.latlng.lat, e.latlng.lng, true));
}

function placeAddrMarker(lat, lng, reverse) {
  if (addrMarker) {
    addrMarker.setLatLng([lat, lng]);
  } else {
    addrMarker = L.marker([lat, lng], { draggable: true }).addTo(addrMap);
    addrMarker.on('dragend', () => {
      const p = addrMarker.getLatLng();
      document.getElementById('addrLat').value = p.lat;
      document.getElementById('addrLng').value = p.lng;
      reverseGeocode(p.lat, p.lng);
    });
  }
  addrMap.setView([lat, lng], 17);
  document.getElementById('addrLat').value = lat;
  document.getElementById('addrLng').value = lng;
  if (reverse) reverseGeocode(lat, lng);
}

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru`);
    const d = await r.json();
    if (d.address) {
      const a = d.address;
      const parts = [a.road || a.pedestrian || a.path, a.house_number, a.suburb || a.neighbourhood].filter(Boolean);
      const short = parts.join(', ') || d.display_name.split(', ').slice(0, 2).join(', ');
      document.getElementById('address').value = short;
      document.getElementById('addrMapHint').textContent = '✅ ' + short;
    }
  } catch {}
}

function toggleAddressMap() {
  const wrap = document.getElementById('addrMapWrap');
  const btn  = document.getElementById('btnMapOpen');
  const open = wrap.classList.contains('open');
  if (open) {
    wrap.classList.remove('open');
    btn.classList.remove('active');
  } else {
    wrap.classList.add('open');
    btn.classList.add('active');
    setTimeout(() => {
      initAddressMap();
      const existing = document.getElementById('address').value.trim();
      if (existing && !addrMarker) geocodeAddress(existing);
    }, 350);
  }
}

async function geocodeAddress(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Худжанд Таджикистан')}&format=json&limit=1&countrycodes=tj&accept-language=ru`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.length) placeAddrMarker(parseFloat(d[0].lat), parseFloat(d[0].lon), false);
  } catch {}
}

async function searchAddrSuggestions(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Худжанд')}&format=json&limit=5&countrycodes=tj&accept-language=ru&addressdetails=1`;
    const r = await fetch(url);
    const results = await r.json();
    const el = document.getElementById('addrSuggestions');
    if (!results.length) { el.style.display = 'none'; return; }
    el.innerHTML = results.map(res => {
      const a = res.address || {};
      const main = [a.road || a.pedestrian || res.display_name.split(',')[0], a.house_number].filter(Boolean).join(' ');
      const sub = [a.suburb || a.neighbourhood || a.city_district, a.city || a.town || 'Худжанд'].filter(Boolean).join(', ');
      const short = main || res.display_name.split(',').slice(0, 2).join(',');
      return `<div class="addr-sug-item" onclick="selectAddrSuggestion(${res.lat},${res.lon},'${short.replace(/'/g,"\\'").replace(/"/g,"&quot;")}')">
        <div class="addr-sug-main">${main || res.display_name.split(',')[0]}</div>
        <div class="addr-sug-sub">${sub}</div>
      </div>`;
    }).join('');
    el.style.display = 'block';
  } catch {}
}

function selectAddrSuggestion(lat, lon, addr) {
  document.getElementById('address').value = addr;
  document.getElementById('addrSuggestions').style.display = 'none';
  const wrap = document.getElementById('addrMapWrap');
  const btn  = document.getElementById('btnMapOpen');
  if (!wrap.classList.contains('open')) {
    wrap.classList.add('open');
    btn.classList.add('active');
    setTimeout(() => { initAddressMap(); placeAddrMarker(parseFloat(lat), parseFloat(lon), false); document.getElementById('addrMapHint').textContent = '✅ ' + addr; }, 350);
  } else {
    placeAddrMarker(parseFloat(lat), parseFloat(lon), false);
    document.getElementById('addrMapHint').textContent = '✅ ' + addr;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const addrInput = document.getElementById('address');
  if (addrInput) {
    addrInput.addEventListener('input', function () {
      clearTimeout(addrSearchTimer);
      const val = this.value.trim();
      if (val.length < 3) { document.getElementById('addrSuggestions').style.display = 'none'; return; }
      addrSearchTimer = setTimeout(() => searchAddrSuggestions(val), 650);
    });
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('.addr-group')) document.getElementById('addrSuggestions').style.display = 'none';
  });
});

// ── Qty controls ──
function changeQty(id, delta) {
  qty[id] = Math.max(0, qty[id] + delta);
  document.getElementById(id).textContent = qty[id];
  updateTotal();
}

function updateTotal() {
  const total = qty.qty6 * PRICE_6 + qty.qty16 * PRICE_16;
  document.getElementById('totalPrice').textContent = total + ' сомон';
}

// ── Загрузка сохранённых данных из браузера ──
window.addEventListener('DOMContentLoaded', () => {
  const saved = JSON.parse(localStorage.getItem('obiVatanClient') || '{}');
  if (saved.phone) document.getElementById('phone').value = saved.phone;
  if (saved.name) document.getElementById('name').value = saved.name;
  if (saved.address) document.getElementById('address').value = saved.address;
});

// ── Автозаполнение + лояльность по номеру телефона ──
document.getElementById('phone').addEventListener('blur', async function () {
  const phone = this.value.trim();
  if (phone.length < 9) return;
  try {
    const [clientsRes, loyaltyRes] = await Promise.all([
      fetch('/api/clients'),
      fetch('/api/loyalty/' + encodeURIComponent(phone))
    ]);
    const clients = await clientsRes.json();
    const loyalty = await loyaltyRes.json();

    const client = clients.find(c => c.phone === phone);
    if (client) {
      if (!document.getElementById('name').value) document.getElementById('name').value = client.name;
      if (!document.getElementById('address').value) document.getElementById('address').value = client.address;
    }

    // Показать прогресс лояльности
    let badge = document.getElementById('loyaltyBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'loyaltyBadge';
      document.getElementById('phone').parentNode.appendChild(badge);
    }
    if (loyalty.orderCount === 0) {
      badge.innerHTML = '';
    } else if (loyalty.isFreeOrder) {
      badge.innerHTML = `<div class="loyalty-badge free">🎁 Этот заказ — ваш 10-й! Одна 6Л бутылка бесплатно!</div>`;
    } else {
      const filled = 10 - loyalty.nextFreeAt;
      const dots = Array.from({length: 10}, (_, i) =>
        `<span class="ldot ${i < filled ? 'done' : ''}"></span>`
      ).join('');
      badge.innerHTML = `<div class="loyalty-badge"><span>🎁 До бесплатной бутылки: ${loyalty.nextFreeAt} заказ${loyalty.nextFreeAt === 1 ? '' : 'а'}</span><div class="ldots">${dots}</div></div>`;
    }
  } catch {}
});

// ── Order form submit ──
document.getElementById('orderForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  if (qty.qty6 === 0 && qty.qty16 === 0) {
    alert('Пожалуйста, выберите количество воды.');
    return;
  }

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();
  const notes = document.getElementById('notes').value.trim();
  const total = qty.qty6 * PRICE_6 + qty.qty16 * PRICE_16;
  const lat = document.getElementById('addrLat').value || null;
  const lng = document.getElementById('addrLng').value || null;

  const btn = document.getElementById('submitBtn');
  document.getElementById('btnText').textContent = 'Отправляем...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, address, qty6: qty.qty6, qty16: qty.qty16, notes, total, lat, lng })
    });

    if (res.ok) {
      localStorage.setItem('obiVatanClient', JSON.stringify({ name, phone, address }));
      showSuccess({ name, phone, address, qty6: qty.qty6, qty16: qty.qty16, total });
      this.reset();
      qty.qty6 = 0; qty.qty16 = 0;
      document.getElementById('qty6').textContent = 0;
      document.getElementById('qty16').textContent = 0;
      updateTotal();
    } else {
      alert('Ошибка при отправке. Пожалуйста, позвоните нам напрямую.');
    }
  } catch {
    alert('Нет соединения с сервером. Попробуйте позже.');
  }

  document.getElementById('btnText').textContent = 'Отправить заказ';
  btn.disabled = false;
});

function showSuccess(data) {
  const bottles = [];
  if (data.qty6 > 0) bottles.push(`6-литровая × ${data.qty6} шт = ${data.qty6 * PRICE_6} сомон`);
  if (data.qty16 > 0) bottles.push(`19-литровая × ${data.qty16} шт = ${data.qty16 * PRICE_16} сомон`);

  document.getElementById('sbDetails').innerHTML = `
    <div><strong>Имя:</strong> ${data.name}</div>
    <div><strong>Телефон:</strong> ${data.phone}</div>
    <div><strong>Адрес:</strong> ${data.address}</div>
    <div><strong>Заказ:</strong> ${bottles.join(', ')}</div>
    <div><strong>Итого:</strong> ${data.total} сомон</div>
  `;
  document.getElementById('successOverlay').classList.add('active');
}

function closeSuccess() {
  document.getElementById('successOverlay').classList.remove('active');
}

document.getElementById('successOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeSuccess();
});
