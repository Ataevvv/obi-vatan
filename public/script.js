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

// ── Яндекс Карта для выбора адреса ──
let ymap = null;
let ymapMark = null;
let addrSearchTimer = null;
const KHUJAND_CENTER = [40.2833, 69.6333];

function initAddressMap() {
  if (ymap) return;
  ymaps.ready(function () {
    ymap = new ymaps.Map('addrMap', {
      center: KHUJAND_CENTER,
      zoom: 15,
      controls: ['zoomControl']
    });
    ymap.events.add('click', function (e) {
      placeAddrMark(e.get('coords'), true);
    });
  });
}

function placeAddrMark(coords, reverse) {
  if (ymapMark) {
    ymapMark.geometry.setCoordinates(coords);
  } else {
    ymapMark = new ymaps.Placemark(coords, {}, {
      draggable: true,
      iconLayout: ymaps.templateLayoutFactory.createClass(
        '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:grab">' +
        '<div style="width:32px;height:32px;background:#1a78c2;border-radius:50%;border:3px solid #fff;box-shadow:0 3px 16px rgba(26,120,194,.65);display:flex;align-items:center;justify-content:center">' +
        '<div style="width:10px;height:10px;background:#fff;border-radius:50%"></div>' +
        '</div>' +
        '<div style="width:3px;height:10px;background:#1a78c2;border-radius:0 0 2px 2px;margin-top:-1px"></div>' +
        '<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #1a78c2;margin-top:-1px"></div>' +
        '</div>'
      ),
      iconShape: { type: 'Circle', coordinates: [16, 16], radius: 16 },
      iconOffset: [-16, -50]
    });
    ymap.geoObjects.add(ymapMark);
    ymapMark.events.add('dragend', function () {
      const c = ymapMark.geometry.getCoordinates();
      document.getElementById('addrLat').value = c[0];
      document.getElementById('addrLng').value = c[1];
      reverseGeocodeY(c);
    });
  }
  ymap.setCenter(coords, 17, { duration: 300 });
  document.getElementById('addrLat').value = coords[0];
  document.getElementById('addrLng').value = coords[1];
  if (reverse) reverseGeocodeY(coords);
}

function reverseGeocodeY(coords) {
  ymaps.geocode(coords, { results: 1 }).then(function (res) {
    const obj = res.geoObjects.get(0);
    if (!obj) return;
    const full = obj.getAddressLine();
    const short = full.replace('Таджикистан, ', '').replace('Хучанд, ', '').replace('Худжанд, ', '');
    document.getElementById('address').value = short;
    document.getElementById('addrMapHint').textContent = '✅ ' + short;
  });
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
    setTimeout(function () {
      ymaps.ready(function () {
        initAddressMap();
        const existing = document.getElementById('address').value.trim();
        if (existing && !ymapMark) geocodeAddrY(existing);
      });
    }, 350);
  }
}

function geocodeAddrY(query) {
  ymaps.geocode('Худжанд ' + query, { results: 1 }).then(function (res) {
    const obj = res.geoObjects.get(0);
    if (obj) placeAddrMark(obj.geometry.getCoordinates(), false);
  });
}

function searchAddrSuggestions(query) {
  if (typeof ymaps === 'undefined') return;
  ymaps.ready(function () {
    ymaps.suggest('Худжанд ' + query, { results: 6 }).then(function (items) {
      const el = document.getElementById('addrSuggestions');
      if (!items || !items.length) { el.style.display = 'none'; return; }
      el.innerHTML = items.map(function (item) {
        const val  = item.value || '';
        const short = val.replace('Таджикистан, Хучанд, ', '').replace('Таджикистан, Худжанд, ', '').replace('Таджикистан, ', '');
        const parts = short.split(', ');
        const main = parts[0] || short;
        const sub  = parts.slice(1, 3).join(', ');
        const safe = val.replace(/'/g, "\\'");
        return `<div class="addr-sug-item" onclick="selectAddrSuggY('${safe}')">
          <div class="addr-sug-main">${main}</div>
          ${sub ? `<div class="addr-sug-sub">${sub}</div>` : ''}
        </div>`;
      }).join('');
      el.style.display = 'block';
    });
  });
}

function selectAddrSuggY(val) {
  const short = val.replace('Таджикистан, Хучанд, ', '').replace('Таджикистан, Худжанд, ', '').replace('Таджикистан, ', '');
  document.getElementById('address').value = short;
  document.getElementById('addrSuggestions').style.display = 'none';

  const wrap = document.getElementById('addrMapWrap');
  const btn  = document.getElementById('btnMapOpen');
  ymaps.ready(function () {
    ymaps.geocode(val, { results: 1 }).then(function (res) {
      const obj = res.geoObjects.get(0);
      if (!obj) return;
      const coords = obj.geometry.getCoordinates();
      if (!wrap.classList.contains('open')) {
        wrap.classList.add('open');
        btn.classList.add('active');
        setTimeout(function () { initAddressMap(); setTimeout(() => placeAddrMark(coords, false), 100); }, 350);
      } else {
        placeAddrMark(coords, false);
      }
      document.getElementById('addrMapHint').textContent = '✅ ' + short;
    });
  });
}

// Геокод без открытия карты — тихо ставит координаты и двигает маркер если карта открыта
function silentGeocodeY(query) {
  ymaps.ready(function () {
    ymaps.geocode('Худжанд ' + query, { results: 1 }).then(function (res) {
      const obj = res.geoObjects.get(0);
      if (!obj) return;
      const coords = obj.geometry.getCoordinates();
      document.getElementById('addrLat').value = coords[0];
      document.getElementById('addrLng').value = coords[1];
      const mapWrap = document.getElementById('addrMapWrap');
      if (ymap && mapWrap.classList.contains('open')) {
        if (ymapMark) {
          ymapMark.geometry.setCoordinates(coords);
          ymap.setCenter(coords, 17, { duration: 300 });
        } else {
          placeAddrMark(coords, false);
        }
        document.getElementById('addrMapHint').textContent = '✅ ' + query;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  // Если перешли с admin.html как водитель
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'driver') {
    history.replaceState({}, '', '/');
    setTimeout(() => switchAppTab('driver'), 200);
  }

  const addrInput = document.getElementById('address');
  if (addrInput) {
    addrInput.addEventListener('input', function () {
      clearTimeout(addrSearchTimer);
      const val = this.value.trim();
      if (val.length < 3) { document.getElementById('addrSuggestions').style.display = 'none'; return; }
      addrSearchTimer = setTimeout(() => searchAddrSuggestions(val), 600);
    });

    // Авто-геокод когда пользователь уходит с поля, не выбрав подсказку
    addrInput.addEventListener('blur', function () {
      const val = this.value.trim();
      const latField = document.getElementById('addrLat');
      if (val.length >= 3 && !latField.value) {
        silentGeocodeY(val);
      }
    });
  }
  document.addEventListener('click', function (e) {
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
