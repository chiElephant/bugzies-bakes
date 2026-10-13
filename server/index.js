import express from 'express';
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { db, getSettings, DEFAULT_SETTINGS, tx } from './db.js';

const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3001);
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  if (PROD) {
    console.error('ADMIN_PASSWORD must be set in production.');
    process.exit(1);
  }
  // Dev convenience: a throwaway password for this run. Set ADMIN_PASSWORD in .env to pick your own.
  ADMIN_PASSWORD = randomBytes(6).toString('base64url');
  console.warn(`⚠️  ADMIN_PASSWORD not set — dashboard password for this run: ${ADMIN_PASSWORD}`);
}
const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) { next(e); }
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, { min = 0, max = 1e9 } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`Invalid number: ${v}`);
  return n;
};
const bool = (v) => (v ? 1 : 0);

// ---------- auth ----------
const COOKIE = 'bb_admin';
const sign = (payload) => createHmac('sha256', SECRET).update(payload).digest('base64url');
function makeToken() {
  const exp = String(Date.now() + 1000 * 60 * 60 * 24 * 14);
  return `${exp}.${sign(exp)}`;
}
function validToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
function requireAdmin(req, _res, next) {
  if (validToken(readCookie(req, COOKIE))) return next();
  next(new HttpError(401, 'Please log in.'));
}
const sha = (s) => createHash('sha256').update(String(s)).digest();

const loginAttempts = new Map(); // ip -> { count, until }

// ---------- public API ----------
const publicSettings = () => {
  const s = getSettings();
  return {
    business_name: s.business_name,
    tagline: s.tagline,
    contact_email: s.contact_email,
    instagram_url: s.instagram_url,
    facebook_url: s.facebook_url,
    hero_image: s.hero_image,
    about_image: s.about_image,
    about_text: s.about_text,
    lead_days: Number(s.lead_days),
    max_days_ahead: Number(s.max_days_ahead),
    closed_weekdays: s.closed_weekdays.split(',').filter((x) => x !== '').map(Number),
    time_slots: s.time_slots.split('|').map((x) => x.trim()).filter(Boolean),
    delivery_enabled: s.delivery_enabled === '1',
    delivery_fee_cents: Number(s.delivery_fee_cents),
    min_order_cents: Number(s.min_order_cents),
    pickup_note: s.pickup_note,
    payment_note: s.payment_note,
    today: today(),
  };
};

app.get('/api/config', wrap(() => publicSettings()));

app.get('/api/products', wrap(() =>
  db.prepare(`SELECT id, name, description, category, unit_label, price_cents, image, color, featured
              FROM products WHERE active = 1 ORDER BY sort, id`).all()
));

function evaluateCoupon(code, subtotal) {
  if (!code) return null;
  const c = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code.trim());
  const t = today();
  if (!c || !c.active) throw bad("Hmm, that code doesn't look right.");
  if (c.starts_on && t < c.starts_on) throw bad("That code isn't active yet.");
  if (c.ends_on && t > c.ends_on) throw bad('That code has expired.');
  if (c.max_uses != null && c.uses >= c.max_uses) throw bad('That code has been fully redeemed.');
  if (subtotal < c.min_subtotal_cents) {
    throw bad(`That code needs a subtotal of at least $${(c.min_subtotal_cents / 100).toFixed(2)}.`);
  }
  const discount = c.kind === 'percent'
    ? Math.round((subtotal * Math.min(c.value, 100)) / 100)
    : Math.min(c.value, subtotal);
  return { coupon: c, discount_cents: discount };
}

app.post('/api/coupons/check', wrap((req) => {
  const subtotal = int(req.body.subtotal_cents ?? 0);
  const r = evaluateCoupon(str(req.body.code, 40), subtotal);
  if (!r) throw bad('Enter a code.');
  return { code: r.coupon.code, description: r.coupon.description, discount_cents: r.discount_cents };
}));

app.post('/api/orders', wrap((req) => {
  const b = req.body || {};
  const s = publicSettings();

  const customer_name = str(b.customer_name, 100);
  const email = str(b.email, 200);
  const phone = str(b.phone, 40);
  if (!customer_name) throw bad('Please add your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please add a valid email.');

  const fulfillment = b.fulfillment === 'delivery' ? 'delivery' : 'pickup';
  if (fulfillment === 'delivery' && !s.delivery_enabled) throw bad('Delivery is not available right now.');
  const address = str(b.address, 300);
  if (fulfillment === 'delivery' && !address) throw bad('Please add a delivery address.');

  const date = b.scheduled_date;
  if (!isDate(date)) throw bad('Please choose a date.');
  const earliest = addDays(s.today, s.lead_days);
  const latest = addDays(s.today, s.max_days_ahead);
  if (date < earliest) throw bad(`The earliest available date is ${earliest}.`);
  if (date > latest) throw bad('That date is too far out — please pick something sooner.');
  if (s.closed_weekdays.includes(new Date(`${date}T12:00:00`).getDay())) throw bad("We're closed that day — pick another!");
  const time = str(b.scheduled_time, 60);
  if (!s.time_slots.includes(time)) throw bad('Please choose a time window.');

  if (!Array.isArray(b.items) || b.items.length === 0) throw bad('Your basket is empty.');
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1');
  const lines = [];
  const seen = new Set();
  for (const it of b.items) {
    const id = int(it.product_id, { min: 1 });
    if (seen.has(id)) throw bad('Duplicate item in basket.');
    seen.add(id);
    const qty = int(it.quantity, { min: 1, max: 500 });
    const p = getProduct.get(id);
    if (!p) throw bad('One of your items is no longer available. Please refresh the menu.');
    lines.push({ p, qty });
  }
  const subtotal = lines.reduce((a, l) => a + l.p.price_cents * l.qty, 0);
  const cost = lines.reduce((a, l) => a + l.p.cost_cents * l.qty, 0);
  if (subtotal < s.min_order_cents) {
    throw bad(`Our minimum order is $${(s.min_order_cents / 100).toFixed(2)}.`);
  }

  return tx(() => {
    const cpn = evaluateCoupon(str(b.coupon_code, 40), subtotal);
    const discount = cpn ? cpn.discount_cents : 0;
    const fee = fulfillment === 'delivery' ? s.delivery_fee_cents : 0;
    const total = subtotal - discount + fee;
    const code = 'BB-' + randomBytes(4).toString('hex').toUpperCase().slice(0, 6);

    const { lastInsertRowid } = db.prepare(`INSERT INTO orders
      (code, customer_name, email, phone, fulfillment, address, scheduled_date, scheduled_time, notes,
       subtotal_cents, discount_cents, delivery_fee_cents, total_cents, cost_cents, coupon_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      code, customer_name, email, phone, fulfillment, fulfillment === 'delivery' ? address : '',
      date, time, str(b.notes, 1000), subtotal, discount, fee, total, cost, cpn ? cpn.coupon.code : null,
    );
    const insItem = db.prepare(`INSERT INTO order_items
      (order_id, product_id, name, unit_price_cents, unit_cost_cents, quantity) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const l of lines) insItem.run(lastInsertRowid, l.p.id, l.p.name, l.p.price_cents, l.p.cost_cents, l.qty);
    if (cpn) db.prepare('UPDATE coupons SET uses = uses + 1 WHERE id = ?').run(cpn.coupon.id);

    return {
      code, scheduled_date: date, scheduled_time: time, fulfillment,
      subtotal_cents: subtotal, discount_cents: discount, delivery_fee_cents: fee, total_cents: total,
      items: lines.map((l) => ({ name: l.p.name, quantity: l.qty, unit_price_cents: l.p.price_cents })),
    };
  });
}));

app.post('/api/messages', wrap((req) => {
  const name = str(req.body.name, 100), email = str(req.body.email, 200), body = str(req.body.body, 3000);
  if (!name || !email || !body) throw bad('Please fill in every field.');
  db.prepare('INSERT INTO messages (name, email, body) VALUES (?, ?, ?)').run(name, email, body);
  return { ok: true };
}));

// ---------- admin auth ----------
app.post('/api/admin/login', wrap((req, res) => {
  const ip = req.ip;
  const rec = loginAttempts.get(ip);
  if (rec && rec.until > Date.now()) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
  if (!timingSafeEqual(sha(req.body.password ?? ''), sha(ADMIN_PASSWORD))) {
    const count = (rec?.count || 0) + 1;
    loginAttempts.set(ip, { count, until: count >= 5 ? Date.now() + 5 * 60_000 : 0 });
    throw new HttpError(401, 'Wrong password.');
  }
  loginAttempts.delete(ip);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 14}${PROD ? '; Secure' : ''}`);
  return { ok: true };
}));
app.post('/api/admin/logout', wrap((_req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  return { ok: true };
}));

const admin = express.Router();
admin.use(requireAdmin);
app.use('/api/admin', admin);

admin.get('/me', wrap(() => ({ ok: true })));

// products
function productFields(b) {
  const name = str(b.name, 100);
  if (!name) throw bad('Name is required.');
  return {
    name,
    description: str(b.description, 1000),
    category: str(b.category, 50) || 'Treats',
    unit_label: str(b.unit_label, 30) || 'each',
    price_cents: int(b.price_cents),
    cost_cents: int(b.cost_cents ?? 0),
    image: str(b.image, 500),
    color: ['yellow', 'pink', 'mint', 'lavender', 'blue'].includes(b.color) ? b.color : 'yellow',
    featured: bool(b.featured),
    active: bool(b.active ?? true),
    sort: int(b.sort ?? 0, { min: -1e6, max: 1e6 }),
  };
}
admin.get('/products', wrap(() => db.prepare('SELECT * FROM products ORDER BY sort, id').all()));
admin.post('/products', wrap((req) => {
  const f = productFields(req.body);
  const keys = Object.keys(f);
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO products (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(f));
  return db.prepare('SELECT * FROM products WHERE id = ?').get(lastInsertRowid);
}));
admin.put('/products/:id', wrap((req) => {
  const f = productFields(req.body);
  const r = db.prepare(`UPDATE products SET ${Object.keys(f).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...Object.values(f), Number(req.params.id));
  if (!r.changes) throw new HttpError(404, 'Not found');
  return db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
}));
admin.delete('/products/:id', wrap((req) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
  return { ok: true };
}));

admin.post('/upload', wrap((req) => {
  const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(req.body.data || '');
  if (!m) throw bad('Please upload a PNG, JPG, WEBP or GIF image.');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  writeFileSync(join(UPLOAD_DIR, name), Buffer.from(m[2], 'base64'));
  return { url: `/uploads/${name}` };
}));

// coupons
function couponFields(b) {
  const code = str(b.code, 40).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw bad('Codes need 3+ letters/numbers (no spaces).');
  const kind = b.kind === 'fixed' ? 'fixed' : 'percent';
  const value = int(b.value, { min: 1, max: kind === 'percent' ? 100 : 1e7 });
  const d = (v) => (v ? (isDate(v) ? v : (() => { throw bad('Invalid date'); })()) : null);
  return {
    code, kind, value,
    description: str(b.description, 200),
    min_subtotal_cents: int(b.min_subtotal_cents ?? 0),
    max_uses: b.max_uses === '' || b.max_uses == null ? null : int(b.max_uses, { min: 1 }),
    starts_on: d(b.starts_on),
    ends_on: d(b.ends_on),
    active: bool(b.active ?? true),
  };
}
const uniqueCode = (fn) => {
  try { return fn(); } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw bad('A coupon with that code already exists.');
    throw e;
  }
};
admin.get('/coupons', wrap(() => db.prepare(`
  SELECT c.*, COALESCE(SUM(o.discount_cents), 0) AS total_discount_cents
  FROM coupons c LEFT JOIN orders o ON o.coupon_code = c.code COLLATE NOCASE AND o.status != 'cancelled'
  GROUP BY c.id ORDER BY c.created_at DESC`).all()));
admin.post('/coupons', wrap((req) => uniqueCode(() => {
  const f = couponFields(req.body);
  const keys = Object.keys(f);
  db.prepare(`INSERT INTO coupons (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(f));
  return { ok: true };
})));
admin.put('/coupons/:id', wrap((req) => uniqueCode(() => {
  const f = couponFields(req.body);
  db.prepare(`UPDATE coupons SET ${Object.keys(f).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...Object.values(f), Number(req.params.id));
  return { ok: true };
})));
admin.delete('/coupons/:id', wrap((req) => {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(Number(req.params.id));
  return { ok: true };
}));

// orders
const STATUSES = ['new', 'confirmed', 'baking', 'ready', 'completed', 'cancelled'];
admin.get('/orders', wrap((req) => {
  const where = [], args = [];
  if (STATUSES.includes(req.query.status)) { where.push('status = ?'); args.push(req.query.status); }
  if (req.query.view === 'upcoming') { where.push("scheduled_date >= ? AND status NOT IN ('completed','cancelled')"); args.push(today()); }
  if (isDate(req.query.from)) { where.push('scheduled_date >= ?'); args.push(req.query.from); }
  if (isDate(req.query.to)) { where.push('scheduled_date <= ?'); args.push(req.query.to); }
  if (req.query.q) {
    where.push('(customer_name LIKE ? OR email LIKE ? OR code LIKE ?)');
    const q = `%${str(req.query.q, 100)}%`; args.push(q, q, q);
  }
  const order = req.query.view === 'upcoming' ? 'scheduled_date ASC, scheduled_time ASC' : 'created_at DESC';
  const orders = db.prepare(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${order} LIMIT 500`).all(...args);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  return orders.map((o) => ({ ...o, items: items.all(o.id) }));
}));
admin.patch('/orders/:id', wrap((req) => {
  const id = Number(req.params.id);
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) throw new HttpError(404, 'Not found');
  const status = STATUSES.includes(req.body.status) ? req.body.status : o.status;
  const paid = req.body.paid === undefined ? o.paid : bool(req.body.paid);
  db.prepare('UPDATE orders SET status = ?, paid = ? WHERE id = ?').run(status, paid, id);
  return { ok: true };
}));

// expenses
function expenseFields(b) {
  if (!isDate(b.spent_on)) throw bad('Pick a date.');
  return {
    spent_on: b.spent_on,
    category: str(b.category, 50) || 'Other',
    description: str(b.description, 300),
    amount_cents: int(b.amount_cents, { min: 1 }),
  };
}
admin.get('/expenses', wrap((req) => {
  const from = isDate(req.query.from) ? req.query.from : '0000-01-01';
  const to = isDate(req.query.to) ? req.query.to : '9999-12-31';
  return db.prepare('SELECT * FROM expenses WHERE spent_on BETWEEN ? AND ? ORDER BY spent_on DESC, id DESC').all(from, to);
}));
admin.post('/expenses', wrap((req) => {
  const f = expenseFields(req.body);
  db.prepare('INSERT INTO expenses (spent_on, category, description, amount_cents) VALUES (?, ?, ?, ?)')
    .run(f.spent_on, f.category, f.description, f.amount_cents);
  return { ok: true };
}));
admin.put('/expenses/:id', wrap((req) => {
  const f = expenseFields(req.body);
  db.prepare('UPDATE expenses SET spent_on = ?, category = ?, description = ?, amount_cents = ? WHERE id = ?')
    .run(f.spent_on, f.category, f.description, f.amount_cents, Number(req.params.id));
  return { ok: true };
}));
admin.delete('/expenses/:id', wrap((req) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
  return { ok: true };
}));

// messages
admin.get('/messages', wrap(() => db.prepare('SELECT * FROM messages ORDER BY handled, created_at DESC').all()));
admin.patch('/messages/:id', wrap((req) => {
  db.prepare('UPDATE messages SET handled = ? WHERE id = ?').run(bool(req.body.handled), Number(req.params.id));
  return { ok: true };
}));
admin.delete('/messages/:id', wrap((req) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(Number(req.params.id));
  return { ok: true };
}));

// settings
admin.get('/settings', wrap(() => getSettings()));
admin.put('/settings', wrap((req) => {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  tx(() => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (req.body[key] !== undefined) up.run(key, String(req.body[key]).slice(0, 2000));
    }
  });
  return getSettings();
}));

function getCounts() {
  return db.prepare(`SELECT
      (SELECT COUNT(*) FROM orders WHERE status = 'new') AS new_orders,
      (SELECT COUNT(*) FROM orders WHERE status NOT IN ('completed','cancelled') AND scheduled_date >= ?) AS upcoming,
      (SELECT COUNT(*) FROM orders WHERE status = 'completed' AND paid = 0) AS unpaid,
      (SELECT COUNT(*) FROM messages WHERE handled = 0) AS unread_messages`).get(today());
}
admin.get('/counts', wrap(() => getCounts()));

// stats — sales are counted on their scheduled (fulfillment) date; cancelled orders are excluded
admin.get('/stats', wrap((req) => {
  const to = isDate(req.query.to) ? req.query.to : today();
  const from = isDate(req.query.from) ? req.query.from : addDays(to, -29);
  const live = "status != 'cancelled' AND scheduled_date BETWEEN ? AND ?";

  const totals = db.prepare(`SELECT COUNT(*) AS orders,
      COALESCE(SUM(total_cents - delivery_fee_cents), 0) AS revenue_cents,
      COALESCE(SUM(delivery_fee_cents), 0) AS delivery_cents,
      COALESCE(SUM(discount_cents), 0) AS discount_cents,
      COALESCE(SUM(cost_cents), 0) AS cogs_cents
    FROM orders WHERE ${live}`).get(from, to);
  const expenses = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS n FROM expenses WHERE spent_on BETWEEN ? AND ?').get(from, to).n;

  const dailyRows = db.prepare(`SELECT scheduled_date AS day, COUNT(*) AS orders,
      SUM(total_cents - delivery_fee_cents) AS revenue_cents
    FROM orders WHERE ${live} GROUP BY scheduled_date`).all(from, to);
  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = [];
  for (let d = from; d <= to && daily.length < 400; d = addDays(d, 1)) {
    const r = byDay.get(d);
    daily.push({ day: d, orders: r?.orders || 0, revenue_cents: r?.revenue_cents || 0 });
  }

  const topProducts = db.prepare(`SELECT oi.name, SUM(oi.quantity) AS quantity,
      SUM(oi.quantity * oi.unit_price_cents) AS sales_cents,
      SUM(oi.quantity * oi.unit_cost_cents) AS cost_cents
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelled' AND o.scheduled_date BETWEEN ? AND ?
    GROUP BY oi.name ORDER BY sales_cents DESC LIMIT 8`).all(from, to);
  const expenseByCategory = db.prepare(`SELECT category, SUM(amount_cents) AS amount_cents
    FROM expenses WHERE spent_on BETWEEN ? AND ? GROUP BY category ORDER BY amount_cents DESC`).all(from, to);

  const counts = getCounts();

  // revenue here is product revenue after discounts (delivery fees reported separately)
  const gross = totals.revenue_cents - totals.cogs_cents;
  return {
    from, to, ...totals,
    expenses_cents: expenses,
    gross_profit_cents: gross,
    net_profit_cents: gross + totals.delivery_cents - expenses,
    avg_order_cents: totals.orders ? Math.round((totals.revenue_cents + totals.delivery_cents) / totals.orders) : 0,
    daily, topProducts, expenseByCategory, counts,
  };
}));

// ---------- static ----------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
const DIST = resolve('dist');
if (PROD && existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(DIST, 'index.html')));
}

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our end.' : err.message });
});

app.listen(PORT, () => console.log(`🍪 API listening on http://localhost:${PORT}`));
