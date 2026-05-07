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

// ─── Telegram Bot ───
let bot = null;
if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_BOT_TOKEN') {
  bot = new TelegramBot(BOT_TOKEN, { polling: false });
  console.log('✅ Telegram бот готов');
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

// ─── Telegram: уведомление о новом заказе ───
function sendTelegramOrder(order) {
  if (!bot || !CHAT_ID) return;

  const bottles = [];
  if (order.qty6 > 0) bottles.push(`🫙 6Л × ${order.qty6} = ${order.qty6 * 7} сом`);
  if (order.qty16 > 0) bottles.push(`🫙 16Л × ${order.qty16} = ${order.qty16 * 25} сом`);

  const msg = `🆕 *НОВЫЙ ЗАКАЗ*
👤 ${order.name}
📞 ${order.phone}
📍 ${order.address}
${bottles.join('\n')}
💰 *${order.total} сомон*${order.freeBottle ? '\n🎁 10-й заказ — 6Л бесплатно!' : ''}${order.notes ? `\n💬 ${order.notes}` : ''}`;

  bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' })
    .catch(err => console.error('Telegram error:', err.message));
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
  const { name, phone, address, qty6, qty16, notes, total } = req.body;
  if (!name || !phone || !address) return res.status(400).json({ error: 'Заполните все поля' });
  if ((qty6 || 0) + (qty16 || 0) === 0) return res.status(400).json({ error: 'Выберите воду' });

  const order = {
    id: randomUUID(),
    name: name.trim(), phone: phone.trim(), address: address.trim(),
    qty6: parseInt(qty6) || 0, qty16: parseInt(qty16) || 0,
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
