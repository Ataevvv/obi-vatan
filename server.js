require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.join(__dirname, 'image')));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const CLIENTS_FILE = path.join(__dirname, 'data', 'clients.json');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ESKIZ_EMAIL = process.env.ESKIZ_EMAIL;
const ESKIZ_PASSWORD = process.env.ESKIZ_PASSWORD;

const TOPIC_DM = 52; // Личка с ботом
// General/Новые заказы — message_thread_id не нужен (дефолтная тема)

// ─── Водители и районы ───
const DRIVERS = {
  'Алишер': ['Центр', 'Испечак'],
  'Бахром':  ['Кайракум', 'Боди'],
  'Санжар':  ['ЖД район', 'Нур'],
  'Достон':  ['Спитамен', 'Панчшанбе'],
};

function getDriverByDistrict(district) {
  for (const [driver, zones] of Object.entries(DRIVERS)) {
    if (zones.includes(district)) return driver;
  }
  return null;
}

// ─── Telegram Bot ───
let bot = null;
if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_BOT_TOKEN') {
  bot = new TelegramBot(BOT_TOKEN, {
    polling: {
      params: { allowed_updates: JSON.stringify(['message', 'callback_query', 'my_chat_member']) }
    }
  });
  console.log('✅ Telegram бот запущен (polling)');

  bot.on('callback_query', async (query) => {
    console.log(`📲 callback: ${query.data} from=${query.from.first_name}`);
    const parts = query.data.split(':');
    const action = parts[0];
    const orderId = parts[1];

    // Оценка — отдельная обработка
    if (action === 'rate') {
      const stars = parseInt(parts[2]) || 3;
      const allOrders = readOrders();
      const oi = allOrders.findIndex(o => o.id === orderId);
      if (oi !== -1) { allOrders[oi].rating = stars; allOrders[oi].ratedAt = new Date().toISOString(); saveOrders(allOrders); }
      const starStr = '⭐'.repeat(stars);
      bot.editMessageText(`${starStr} Спасибо за оценку!`, { chat_id: query.message.chat.id, message_id: query.message.message_id }).catch(() => {});
      bot.answerCallbackQuery(query.id, { text: `${starStr} Оценка сохранена!` });
      return;
    }

    const orders = readOrders();
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx === -1) {
      bot.answerCallbackQuery(query.id, { text: 'Заказ не найден' });
      return;
    }

    const order = orders[idx];
    const driverName = query.from.first_name || 'Водитель';

    if (action === 'accept' && order.status === 'new') {
      orders[idx].status = 'delivering';
      orders[idx].driverName = driverName;
      orders[idx].driverId = query.from.id;
      orders[idx].acceptedAt = new Date().toISOString();
      saveOrders(orders);

      const bottles = [];
      if (order.qty6 > 0) bottles.push(`${order.qty6}×6Л`);
      if (order.qty16 > 0) bottles.push(`${order.qty16}×16Л`);

      // Редактируем сообщение в теме "Новые заказы" — убираем кнопку
      bot.editMessageText(
        `✅ *ПРИНЯТО — ${driverName}*\n👤 ${order.name} · 📞 ${order.phone}\n📍 ${order.address}\n💧 ${bottles.join(' + ')} · 💰 ${order.total} сомон`,
        { chat_id: CHAT_ID, message_id: query.message.message_id, parse_mode: 'Markdown' }
      ).catch(() => {});

      bot.answerCallbackQuery(query.id, { text: '✅ Заказ принят! Удачи!' });

      // В тему "Личка с ботом" — кнопка "Доставлен"
      bot.sendMessage(CHAT_ID,
        `🚚 *${driverName} — в пути*\n━━━━━━━━━━━━━━━━\n👤 ${order.name}\n📞 ${order.phone}\n📍 ${order.address}\n💧 ${bottles.join(' + ')}\n💰 *${order.total} сомон*\n━━━━━━━━━━━━━━━━`,
        {
          parse_mode: 'Markdown',
          message_thread_id: TOPIC_DM,
          reply_markup: { inline_keyboard: [[{ text: '📦 Доставлен ✓', callback_data: `delivered:${orderId}` }]] }
        }
      ).then(sentMsg => {
        const orders2 = readOrders();
        const i2 = orders2.findIndex(o => o.id === orderId);
        if (i2 !== -1) { orders2[i2].dmMsgId = sentMsg.message_id; saveOrders(orders2); }
        console.log(`✅ "Личка с ботом" отправлено`);
      }).catch(err => console.error(`❌ topic error: ${err.message}`));

      // SMS клиенту
      sendSms(order.phone, `Оби Ватан: Ваш заказ принят! Водитель уже едет к вам.`);

    } else if (action === 'delivered' && order.status === 'delivering') {

      // Защита: только принявший водитель может нажать "Доставлен"
      if (query.from.id !== order.driverId) {
        bot.answerCallbackQuery(query.id, {
          text: `⛔ Этот заказ принял ${order.driverName}. Только он может отметить доставку.`,
          show_alert: true
        });
        return;
      }

      orders[idx].status = 'delivered';
      orders[idx].deliveredAt = new Date().toISOString();
      saveOrders(orders);

      // Убираем кнопку из личного сообщения
      bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      ).catch(() => {});

      bot.answerCallbackQuery(query.id, { text: '✅ Отлично! Заказ доставлен!' });

      // В General — уведомление о доставке
      bot.sendMessage(CHAT_ID,
        `✅ *ДОСТАВЛЕНО — ${driverName}*\n👤 ${order.name} · 📍 ${order.address}\n💰 *${order.total} сомон*`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});

      // Просим водителя оценить доставку
      bot.sendMessage(query.from.id,
        `⭐ Как прошла доставка?\n👤 ${order.name} · 📍 ${order.address}`,
        {
          reply_markup: { inline_keyboard: [[
            { text: '⭐', callback_data: `rate:${orderId}:1` },
            { text: '⭐⭐', callback_data: `rate:${orderId}:2` },
            { text: '⭐⭐⭐', callback_data: `rate:${orderId}:3` },
            { text: '⭐⭐⭐⭐', callback_data: `rate:${orderId}:4` },
            { text: '⭐⭐⭐⭐⭐', callback_data: `rate:${orderId}:5` }
          ]] }
        }
      ).catch(() => {});

    } else if (action === 'cancel' && order.status === 'new') {
      orders[idx].status = 'cancelled';
      orders[idx].cancelledAt = new Date().toISOString();
      orders[idx].cancelledBy = driverName;
      saveOrders(orders);

      bot.editMessageText(
        `❌ *ОТМЕНЁН*\n👤 ${order.name} · 📞 ${order.phone}\n📍 ${order.address}\n💰 ${order.total} сомон\n_Отменил: ${driverName}_`,
        { chat_id: CHAT_ID, message_id: query.message.message_id, parse_mode: 'Markdown' }
      ).catch(() => {});

      bot.answerCallbackQuery(query.id, { text: '❌ Заказ отменён' });

    } else if (action === 'cancel' && order.status !== 'new') {
      bot.answerCallbackQuery(query.id, { text: '⚠️ Заказ уже принят, нельзя отменить', show_alert: true });

    } else if (action === 'accept' && order.status !== 'new') {
      bot.answerCallbackQuery(query.id, {
        text: `⚠️ Заказ уже принят водителем ${order.driverName || ''}`,
        show_alert: true
      });
    } else {
      bot.answerCallbackQuery(query.id, { text: 'Статус уже изменён' });
    }
  });
}

// ─── Orders helpers ───
function readOrders() {
  if (!fs.existsSync(ORDERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function readClients() {
  if (!fs.existsSync(CLIENTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
}

function saveClient(order) {
  const clients = readClients();
  const existing = clients.findIndex(c => c.phone === order.phone);
  const now = new Date().toISOString();
  if (existing !== -1) {
    clients[existing].name = order.name;
    clients[existing].address = order.address;
    clients[existing].orderCount = (clients[existing].orderCount || 0) + 1;
    clients[existing].lastOrderAt = now;
  } else {
    clients.push({ phone: order.phone, name: order.name, address: order.address, orderCount: 1, firstOrderAt: now, lastOrderAt: now });
  }
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

function getLoyaltyInfo(phone) {
  const clients = readClients();
  const client = clients.find(c => c.phone === phone);
  if (!client) return { orderCount: 0, nextFreeAt: 10, isFreeOrder: false };
  const count = client.orderCount || 0;
  const isFreeOrder = count > 0 && count % 10 === 9; // 9-й → следующий (10-й) бесплатный
  const nextFreeAt = 10 - (count % 10);
  return { orderCount: count, nextFreeAt, isFreeOrder };
}

// ─── Telegram: новый заказ → тема "Новые заказы" ───
function sendTelegramOrder(order) {
  if (!bot || !CHAT_ID) return;

  const bottles = [];
  if (order.qty6 > 0) bottles.push(`🫙 6Л × ${order.qty6} шт = ${order.qty6 * 7} сомон`);
  if (order.qty16 > 0) bottles.push(`🫙 16Л × ${order.qty16} шт = ${order.qty16 * 25} сомон`);

  const driverLine = order.assignedDriver
    ? `🗺 *Район:* ${order.district} → 🚗 *${order.assignedDriver}*`
    : `🗺 *Район:* ${order.district || '—'}`;

  const msg = `🆕 *НОВЫЙ ЗАКАЗ — Оби Ватан*
━━━━━━━━━━━━━━━━━━
👤 *Клиент:* ${order.name}
📞 *Телефон:* ${order.phone}
📍 *Адрес:* ${order.address}
${driverLine}
━━━━━━━━━━━━━━━━━━
${bottles.join('\n')}
━━━━━━━━━━━━━━━━━━
💰 *Итого: ${order.total} сомон*${order.freeBottle ? '\n🎁 *БОНУС: 1×6Л бесплатно (10-й заказ!)*' : ''}${order.notes ? `\n💬 ${order.notes}` : ''}`;

  // Новые заказы → General (без message_thread_id = дефолтная тема)
  bot.sendMessage(CHAT_ID, msg, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Принять заказ', callback_data: `accept:${order.id}` }
      ]]
    }
  }).catch(err => console.error('Telegram error:', err.message));
}

// ─── SMS via Eskiz ───
let eskizToken = null;
let eskizTokenTime = 0;

async function getEskizToken() {
  if (!ESKIZ_EMAIL || !ESKIZ_PASSWORD) return null;
  if (eskizToken && Date.now() - eskizTokenTime < 28 * 24 * 60 * 60 * 1000) return eskizToken;

  return new Promise((resolve) => {
    const postData = `email=${encodeURIComponent(ESKIZ_EMAIL)}&password=${encodeURIComponent(ESKIZ_PASSWORD)}`;
    const req = https.request({
      hostname: 'notify.eskiz.uz', path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          eskizToken = json.data?.token || null;
          eskizTokenTime = Date.now();
          resolve(eskizToken);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(postData); req.end();
  });
}

async function sendSms(phone, text) {
  if (!ESKIZ_EMAIL || !ESKIZ_PASSWORD) {
    console.log(`📱 SMS (не настроен): ${phone} — ${text}`);
    return;
  }
  const token = await getEskizToken();
  if (!token) return;
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const postData = JSON.stringify({ mobile_phone: cleanPhone, message: text, from: '4546' });
  const req = https.request({
    hostname: 'notify.eskiz.uz', path: '/api/message/sms/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Content-Length': Buffer.byteLength(postData) }
  }, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => console.log('📱 SMS отправлен:', phone, JSON.parse(data)?.message || ''));
  });
  req.on('error', err => console.error('SMS error:', err.message));
  req.write(postData); req.end();
}

// ─── Routes ───
app.get('/api/orders', (req, res) => {
  res.json(readOrders());
});

app.post('/api/orders', (req, res) => {
  const { name, phone, address, district, qty6, qty16, deliveryTime, notes, total } = req.body;
  if (!name || !phone || !address) return res.status(400).json({ error: 'Заполните все поля' });
  if ((qty6 || 0) + (qty16 || 0) === 0) return res.status(400).json({ error: 'Выберите воду' });

  const assignedDriver = district ? getDriverByDistrict(district) : null;

  const order = {
    id: randomUUID(),
    name: name.trim(), phone: phone.trim(), address: address.trim(),
    district: (district || '').trim(),
    assignedDriver: assignedDriver,
    qty6: parseInt(qty6) || 0, qty16: parseInt(qty16) || 0,
    deliveryTime: deliveryTime || '08:00–10:00',
    notes: (notes || '').trim(),
    total: parseInt(total) || 0,
    status: 'new',
    createdAt: new Date().toISOString()
  };

  const orders = readOrders();
  orders.push(order);
  saveOrders(orders);

  const loyalty = getLoyaltyInfo(order.phone);
  if (loyalty.isFreeOrder) order.freeBottle = true;
  sendTelegramOrder(order);
  saveClient(order);
  console.log(`✅ Заказ: ${order.name} — ${order.total} сомон`);

  res.status(201).json({ success: true, id: order.id });
});

app.post('/api/orders/:id/assign', (req, res) => {
  const { driver } = req.body;
  const orders = readOrders();
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Не найден' });
  orders[idx].assignedDriver = driver || null;
  orders[idx].assignedAt = driver ? new Date().toISOString() : null;
  saveOrders(orders);
  res.json({ success: true });
});

app.patch('/api/orders/:id', (req, res) => {
  const { status } = req.body;
  const allowed = ['new', 'delivering', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });

  const orders = readOrders();
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Не найден' });

  orders[idx].status = status;
  orders[idx].updatedAt = new Date().toISOString();
  saveOrders(orders);
  res.json({ success: true });
});

app.get('/api/clients', (req, res) => {
  res.json(readClients());
});

app.get('/api/loyalty/:phone', (req, res) => {
  res.json(getLoyaltyInfo(req.params.phone));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Оби Ватан: http://localhost:${PORT}`);
  console.log(`📊 Админ панель: http://localhost:${PORT}/admin`);
});
