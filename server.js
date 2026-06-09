require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const path = require('path');
const { randomUUID } = require('crypto');
const https = require('https');
const webpush = require('web-push');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.join(__dirname, 'image')));

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID     = process.env.TELEGRAM_CHAT_ID;
const ESKIZ_EMAIL    = process.env.ESKIZ_EMAIL;
const ESKIZ_PASSWORD = process.env.ESKIZ_PASSWORD;
const MONGODB_URI    = process.env.MONGODB_URI;

// ─── Web Push (VAPID) ───
let VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  const keys = webpush.generateVAPIDKeys();
  VAPID_PUBLIC  = keys.publicKey;
  VAPID_PRIVATE = keys.privateKey;
  console.log('⚠️  Добавь в Render env vars:');
  console.log('VAPID_PUBLIC_KEY=' + VAPID_PUBLIC);
  console.log('VAPID_PRIVATE_KEY=' + VAPID_PRIVATE);
}
webpush.setVapidDetails('mailto:obi@vatan.tj', VAPID_PUBLIC, VAPID_PRIVATE);

// Telegram ID каждого водителя — добавляй по мере получения
const DRIVER_IDS = {
  'Алишер': '5805237043',
  'Бахром':  null,
  'Санжар':  null,
  'Достон':  null,
};

// ─── MongoDB ───
let db = null;

async function connectDB() {
  if (db) return db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('obiVatan');
  console.log('✅ MongoDB подключена');
  return db;
}

async function getOrders() {
  const d = await connectDB();
  return await d.collection('orders').find({}, { projection: { _id: 0 } }).toArray();
}

async function insertOrder(order) {
  const d = await connectDB();
  await d.collection('orders').insertOne(order);
}

async function updateOrder(id, update) {
  const d = await connectDB();
  await d.collection('orders').updateOne({ id }, { $set: update });
}

async function savePushSub(driverName, subscription) {
  const d = await connectDB();
  await d.collection('pushSubs').updateOne(
    { driverName },
    { $set: { driverName, subscription, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

async function sendPush(driverName, payload) {
  try {
    const d = await connectDB();
    const doc = await d.collection('pushSubs').findOne({ driverName });
    if (!doc?.subscription) return;
    await webpush.sendNotification(doc.subscription, JSON.stringify(payload));
  } catch (e) {
    if (e.statusCode === 410 || e.statusCode === 404) {
      const d = await connectDB();
      await d.collection('pushSubs').deleteOne({ driverName });
    }
    console.error('Push error:', e.message);
  }
}

async function getClients() {
  const d = await connectDB();
  return await d.collection('clients').find({}, { projection: { _id: 0 } }).toArray();
}

async function upsertClient(order) {
  const d = await connectDB();
  const now = new Date().toISOString();
  await d.collection('clients').updateOne(
    { phone: order.phone },
    {
      $set:  { name: order.name, address: order.address, lastOrderAt: now },
      $inc:  { orderCount: 1 },
      $setOnInsert: { firstOrderAt: now }
    },
    { upsert: true }
  );
}

async function getLoyaltyInfo(phone) {
  const d = await connectDB();
  const client = await d.collection('clients').findOne({ phone }, { projection: { _id: 0 } });
  if (!client) return { orderCount: 0, nextFreeAt: 10, isFreeOrder: false };
  const count = client.orderCount || 0;
  const isFreeOrder = count > 0 && count % 10 === 9;
  const nextFreeAt  = 10 - (count % 10);
  return { orderCount: count, nextFreeAt, isFreeOrder };
}

// ─── Telegram Bot ───
let bot = null;
if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_BOT_TOKEN') {
  bot = new TelegramBot(BOT_TOKEN, {
    polling: { params: { allowed_updates: JSON.stringify(['callback_query']) } }
  });
  console.log('✅ Telegram бот готов');

  bot.on('callback_query', async (query) => {
    const [action, orderId] = query.data.split(':');
    if (action !== 'done') return;

    try {
      await updateOrder(orderId, { status: 'delivered', deliveredAt: new Date().toISOString() });
      const driverName = query.from.first_name || 'Водитель';

      bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      }).catch(() => {});

      bot.answerCallbackQuery(query.id, { text: '✅ Отлично! Заказ доставлен!' });

      // Уведомление диспетчеру
      if (CHAT_ID) {
        const orders = await getOrders();
        const order = orders.find(o => o.id === orderId);
        if (order) {
          bot.sendMessage(CHAT_ID,
            `✅ *Доставлено — ${driverName}*\n👤 ${order.name} · 📍 ${order.address}\n💰 *${order.total} сомон*`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
      }
    } catch (e) { console.error('Delivered error:', e.message); }
  });
}

function sendTelegramOrder(order) {
  if (!bot || !CHAT_ID) return;
  const bottles = [];
  if (order.qty6  > 0) bottles.push(`🫙 6Л × ${order.qty6}  = ${order.qty6  * 7}  сом`);
  if (order.qty16 > 0) bottles.push(`🫙 19Л × ${order.qty16} = ${order.qty16 * 20} сом`);

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
let eskizToken = null, eskizTokenTime = 0;

async function getEskizToken() {
  if (!ESKIZ_EMAIL || !ESKIZ_PASSWORD) return null;
  if (eskizToken && Date.now() - eskizTokenTime < 28 * 24 * 60 * 60 * 1000) return eskizToken;
  return new Promise(resolve => {
    const postData = `email=${encodeURIComponent(ESKIZ_EMAIL)}&password=${encodeURIComponent(ESKIZ_PASSWORD)}`;
    const req = https.request({
      hostname: 'notify.eskiz.uz', path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { eskizToken = JSON.parse(data).data?.token || null; eskizTokenTime = Date.now(); resolve(eskizToken); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(postData); req.end();
  });
}

async function sendSms(phone, text) {
  const token = await getEskizToken();
  if (!token) return;
  const clean = phone.replace(/[^\d]/g, '');
  const body = JSON.stringify({ mobile_phone: clean, message: text, from: '4546' });
  const req = https.request({
    hostname: 'notify.eskiz.uz', path: '/api/message/sms/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Content-Length': Buffer.byteLength(body) }
  }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => console.log('📱 SMS:', phone)); });
  req.on('error', err => console.error('SMS error:', err.message));
  req.write(body); req.end();
}

// ─── Routes ───
app.get('/api/orders', async (req, res) => {
  try { res.json(await getOrders()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { name, phone, address, qty6, qty16, notes, total, lat, lng } = req.body;
    if (!name || !phone || !address) return res.status(400).json({ error: 'Заполните все поля' });
    if ((qty6 || 0) + (qty16 || 0) === 0) return res.status(400).json({ error: 'Выберите воду' });

    const order = {
      id: randomUUID(),
      name: name.trim(), phone: phone.trim(), address: address.trim(),
      qty6: parseInt(qty6) || 0, qty16: parseInt(qty16) || 0,
      notes: (notes || '').trim(),
      total: parseInt(total) || 0,
      status: 'new',
      createdAt: new Date().toISOString(),
      ...(lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : {})
    };

    const loyalty = await getLoyaltyInfo(order.phone);
    if (loyalty.isFreeOrder) order.freeBottle = true;

    await insertOrder(order);
    await upsertClient(order);
    sendTelegramOrder(order);
    console.log(`✅ Заказ: ${order.name} — ${order.total} сомон`);
    res.status(201).json({ success: true, id: order.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/orders/:id/assign', async (req, res) => {
  try {
    const { driver } = req.body;
    await updateOrder(req.params.id, {
      assignedDriver: driver || null,
      assignedAt: driver ? new Date().toISOString() : null
    });

    // Push уведомление водителю
    if (driver) {
      const orders = await getOrders();
      const order = orders.find(o => o.id === req.params.id);
      if (order) {
        const bottles = [];
        if (order.qty6  > 0) bottles.push(`${order.qty6}×6Л`);
        if (order.qty16 > 0) bottles.push(`${order.qty16}×19Л`);
        await sendPush(driver, {
          title: '🚚 Новый заказ!',
          body: `${order.name} · ${order.address} · ${order.total} сомон`,
          bottles: bottles.join(' + '),
          orderId: order.id,
          url: '/driver'
        });
      }
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orders/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['new', 'delivering', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });
    await updateOrder(req.params.id, { status, updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/all', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== 'obi2025') return res.status(403).json({ error: 'Нет доступа' });
    const d = await connectDB();
    await d.collection('orders').deleteMany({});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients', async (req, res) => {
  try { res.json(await getClients()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/loyalty/:phone', async (req, res) => {
  try { res.json(await getLoyaltyInfo(req.params.phone)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Push API ───
app.get('/api/push/vapid-public', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { driverName, subscription } = req.body;
    if (!driverName || !subscription) return res.status(400).json({ error: 'Missing data' });
    await savePushSub(driverName, subscription);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/driver', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'driver.html'));
});


// ─── Ежедневный отчёт в 17:00 ───
let lastReportDate = null;

async function sendDailyReport() {
  if (!bot || !CHAT_ID) return;
  try {
    const orders = await getOrders();
    const today = new Date().toDateString();
    const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === today);
    const delivered = todayOrders.filter(o => o.status === 'delivered');
    const revenue = delivered.reduce((s, o) => s + o.total, 0);

    const driverMap = {};
    delivered.forEach(o => {
      const d = o.assignedDriver || 'Не назначен';
      if (!driverMap[d]) driverMap[d] = { count: 0, revenue: 0 };
      driverMap[d].count++;
      driverMap[d].revenue += o.total;
    });

    const driverLines = Object.entries(driverMap)
      .map(([name, s]) => `  🚗 ${name}: ${s.count} дост. · ${s.revenue} сом`)
      .join('\n') || '  Нет данных';

    const msg = `📊 *Итог дня — ${new Date().toLocaleDateString('ru-RU', {day:'numeric',month:'long'})}*
━━━━━━━━━━━━━━━━
📦 Всего заказов: ${todayOrders.length}
✅ Доставлено: ${delivered.length}
❌ Отменено: ${todayOrders.filter(o => o.status === 'cancelled').length}
💰 *Выручка: ${revenue} сомон*
━━━━━━━━━━━━━━━━
*Водители:*
${driverLines}`;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
    console.log('📊 Ежедневный отчёт отправлен');
  } catch (e) { console.error('Report error:', e.message); }
}

setInterval(() => {
  const now = new Date();
  const today = now.toDateString();
  if (now.getHours() === 17 && now.getMinutes() === 0 && lastReportDate !== today) {
    lastReportDate = today;
    sendDailyReport();
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Оби Ватан: http://localhost:${PORT}`);
  connectDB().catch(console.error);
});
