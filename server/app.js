import express from 'express';
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { q, one, tx, ensureDb, getSettings, DEFAULT_SETTINGS, DATABASE_URL } from './db.js';

const PROD = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD && !PROD) {
  // Dev convenience: a throwaway password for this run. Set ADMIN_PASSWORD in .env to pick your own.
  ADMIN_PASSWORD = randomBytes(6).toString('base64url');
  console.warn(`⚠️  ADMIN_PASSWORD not set — dashboard password for this run: ${ADMIN_PASSWORD}`);
}
// Sessions must verify on every serverless instance, so the signing key can't be random per instance.
// Derive it from the password when no SESSION_SECRET is given (changing the password logs everyone out).
const SECRET = process.env.SESSION_SECRET
  || createHash('sha256').update(`bb-session:${ADMIN_PASSWORD}:${DATABASE_URL}`).digest('hex');

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '4mb' })); // Vercel caps request bodies at 4.5 MB

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const wrap = (fn) => async (req, res, next) => {
  try {
    await ensureDb();
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) { next(e); }
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const weekday = (s) => new Date(`${s}T12:00:00`).getDay();
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const validZone = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
/** Today's date (YYYY-MM-DD) in the shop's time zone — servers run on UTC. */
function todayIn(tz) {
  const zone = tz && validZone(tz) ? tz : 'UTC';
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const today = async () => todayIn((await getSettings()).time_zone);

const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, { min = 0, max = 1e9 } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`Invalid number: ${v}`);
  return n;
};
const bool = (v) => !!v;

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

// ---------- public API ----------
async function publicSettings() {
  const s = await getSettings();
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
    today: todayIn(s.time_zone),
  };
}

app.get('/api/config', wrap(() => publicSettings()));

app.get('/api/products', wrap(() =>
  q(`SELECT id, name, description, category, unit_label, price_cents, image, color, featured
     FROM products WHERE active ORDER BY sort, id`)
));

/** Validate a coupon against a subtotal. Pass `run` to query inside a transaction. */
async function evaluateCoupon(code, subtotal, t, run = q) {
  if (!code) return null;
  const [c] = await run('SELECT * FROM coupons WHERE code = upper($1)', [code.trim()]);
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

app.post('/api/coupons/check', wrap(async (req) => {
  const subtotal = int(req.body.subtotal_cents ?? 0);
  const r = await evaluateCoupon(str(req.body.code, 40), subtotal, await today());
  if (!r) throw bad('Enter a code.');
  return { code: r.coupon.code, description: r.coupon.description, discount_cents: r.discount_cents };
}));

app.post('/api/orders', wrap(async (req) => {
  const b = req.body || {};
  const s = await publicSettings();

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
  if (s.closed_weekdays.includes(weekday(date))) throw bad("We're closed that day — pick another!");
  const time = str(b.scheduled_time, 60);
  if (!s.time_slots.includes(time)) throw bad('Please choose a time window.');

  if (!Array.isArray(b.items) || b.items.length === 0) throw bad('Your basket is empty.');
  if (b.items.length > 50) throw bad('Too many items.');
  const wanted = new Map();
  for (const it of b.items) {
    const id = int(it.product_id, { min: 1 });
    if (wanted.has(id)) throw bad('Duplicate item in basket.');
    wanted.set(id, int(it.quantity, { min: 1, max: 500 }));
  }
  const products = await q('SELECT * FROM products WHERE active AND id = ANY($1::int[])', [[...wanted.keys()]]);
  if (products.length !== wanted.size) throw bad('One of your items is no longer available. Please refresh the menu.');
  const lines = products.map((p) => ({ p, qty: wanted.get(p.id) }));
  const subtotal = lines.reduce((a, l) => a + l.p.price_cents * l.qty, 0);
  const cost = lines.reduce((a, l) => a + l.p.cost_cents * l.qty, 0);
  if (subtotal < s.min_order_cents) {
    throw bad(`Our minimum order is $${(s.min_order_cents / 100).toFixed(2)}.`);
  }

  return tx(async (c) => {
    const cpn = await evaluateCoupon(str(b.coupon_code, 40), subtotal, s.today, (text, args) => c.query(text, args).then((r) => r.rows));
    if (cpn) {
      // Claim a use atomically so a limited coupon can't be over-redeemed
      const claimed = await c.query(
        'UPDATE coupons SET uses = uses + 1 WHERE id = $1 AND (max_uses IS NULL OR uses < max_uses)', [cpn.coupon.id]);
      if (!claimed.rowCount) throw bad('That code has been fully redeemed.');
    }
    const discount = cpn ? cpn.discount_cents : 0;
    const fee = fulfillment === 'delivery' ? s.delivery_fee_cents : 0;
    const total = subtotal - discount + fee;
    const code = 'BB-' + randomBytes(4).toString('hex').toUpperCase().slice(0, 6);

    const { rows: [order] } = await c.query(`INSERT INTO orders
      (code, customer_name, email, phone, fulfillment, address, scheduled_date, scheduled_time, notes,
       subtotal_cents, discount_cents, delivery_fee_cents, total_cents, cost_cents, coupon_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`, [
      code, customer_name, email, phone, fulfillment, fulfillment === 'delivery' ? address : '',
      date, time, str(b.notes, 1000), subtotal, discount, fee, total, cost, cpn ? cpn.coupon.code : null,
    ]);
    for (const l of lines) {
      await c.query(`INSERT INTO order_items (order_id, product_id, name, unit_price_cents, unit_cost_cents, quantity)
        VALUES ($1, $2, $3, $4, $5, $6)`, [order.id, l.p.id, l.p.name, l.p.price_cents, l.p.cost_cents, l.qty]);
    }
    return {
      code, scheduled_date: date, scheduled_time: time, fulfillment,
      subtotal_cents: subtotal, discount_cents: discount, delivery_fee_cents: fee, total_cents: total,
      items: lines.map((l) => ({ name: l.p.name, quantity: l.qty, unit_price_cents: l.p.price_cents })),
    };
  });
}));

app.post('/api/messages', wrap(async (req) => {
  const name = str(req.body.name, 100), email = str(req.body.email, 200), body = str(req.body.body, 3000);
  if (!name || !email || !body) throw bad('Please fill in every field.');
  await q('INSERT INTO messages (name, email, body) VALUES ($1, $2, $3)', [name, email, body]);
  return { ok: true };
}));

// Photos uploaded from the dashboard. IDs are never reused, so they can be cached forever.
app.get('/api/images/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(404, 'Not found');
  const img = await one('SELECT content_type, data FROM images WHERE id = $1', [id]);
  if (!img) throw new HttpError(404, 'Not found');
  res.set('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  res.type(img.content_type).send(img.data);
}));

// ---------- admin auth ----------
app.post('/api/admin/login', wrap(async (req, res) => {
  if (!ADMIN_PASSWORD) throw new HttpError(500, 'ADMIN_PASSWORD is not configured on the server.');
  const ip = req.ip || 'unknown';
  const rec = await one('SELECT count, locked_until FROM login_attempts WHERE ip = $1', [ip]);
  if (rec?.locked_until && rec.locked_until > new Date()) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
  if (!timingSafeEqual(sha(req.body.password ?? ''), sha(ADMIN_PASSWORD))) {
    const { count } = await one(`INSERT INTO login_attempts (ip, count) VALUES ($1, 1)
      ON CONFLICT (ip) DO UPDATE SET count = login_attempts.count + 1 RETURNING count`, [ip]);
    if (count >= 5) await q("UPDATE login_attempts SET count = 0, locked_until = now() + interval '5 minutes' WHERE ip = $1", [ip]);
    throw new HttpError(401, 'Wrong password.');
  }
  await q('DELETE FROM login_attempts WHERE ip = $1', [ip]);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 14}${PROD ? '; Secure' : ''}`);
  return { ok: true };
}));
app.post('/api/admin/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.json({ ok: true });
});

const admin = express.Router();
admin.use(requireAdmin);
app.use('/api/admin', admin);

admin.get('/me', (_req, res) => res.json({ ok: true }));

const insertSql = (table, f) => {
  const keys = Object.keys(f);
  return [`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, Object.values(f)];
};
const updateSql = (table, f, id) => {
  const keys = Object.keys(f);
  return [`UPDATE ${table} SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`, [...Object.values(f), id]];
};

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
admin.get('/products', wrap(() => q('SELECT * FROM products ORDER BY sort, id')));
admin.post('/products', wrap(async (req) => one(...insertSql('products', productFields(req.body)))));
admin.put('/products/:id', wrap(async (req) => {
  const row = await one(...updateSql('products', productFields(req.body), Number(req.params.id)));
  if (!row) throw new HttpError(404, 'Not found');
  return row;
}));
admin.delete('/products/:id', wrap(async (req) => {
  await q('DELETE FROM products WHERE id = $1', [Number(req.params.id)]);
  return { ok: true };
}));

admin.post('/upload', wrap(async (req) => {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(req.body.data || '');
  if (!m) throw bad('Please upload a PNG, JPG, WEBP or GIF image.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw bad('That image is too large — please use one under 3 MB.');
  const img = await one('INSERT INTO images (content_type, data) VALUES ($1, $2) RETURNING id', [m[1], buf]);
  return { url: `/api/images/${img.id}` };
}));

// coupons
function couponFields(b) {
  const code = str(b.code, 40).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw bad('Codes need 3+ letters/numbers (no spaces).');
  const kind = b.kind === 'fixed' ? 'fixed' : 'percent';
  const value = int(b.value, { min: 1, max: kind === 'percent' ? 100 : 1e7 });
  const d = (v) => { if (!v) return null; if (!isDate(v)) throw bad('Invalid date'); return v; };
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
const uniqueCode = async (p) => {
  try { return await p; } catch (e) {
    if (e.code === '23505') throw bad('A coupon with that code already exists.');
    throw e;
  }
};
admin.get('/coupons', wrap(() => q(`
  SELECT c.*, COALESCE(SUM(o.discount_cents), 0)::int AS total_discount_cents
  FROM coupons c LEFT JOIN orders o ON o.coupon_code = c.code AND o.status != 'cancelled'
  GROUP BY c.id ORDER BY c.created_at DESC`)));
admin.post('/coupons', wrap(async (req) => {
  await uniqueCode(q(...insertSql('coupons', couponFields(req.body))));
  return { ok: true };
}));
admin.put('/coupons/:id', wrap(async (req) => {
  await uniqueCode(q(...updateSql('coupons', couponFields(req.body), Number(req.params.id))));
  return { ok: true };
}));
admin.delete('/coupons/:id', wrap(async (req) => {
  await q('DELETE FROM coupons WHERE id = $1', [Number(req.params.id)]);
  return { ok: true };
}));

// orders
const STATUSES = ['new', 'confirmed', 'baking', 'ready', 'completed', 'cancelled'];
async function withItems(orders) {
  if (!orders.length) return orders;
  const items = await q('SELECT * FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id', [orders.map((o) => o.id)]);
  const by = new Map();
  for (const it of items) (by.get(it.order_id) || by.set(it.order_id, []).get(it.order_id)).push(it);
  return orders.map((o) => ({ ...o, items: by.get(o.id) || [] }));
}
admin.get('/orders', wrap(async (req) => {
  const where = [], args = [];
  const p = (v) => { args.push(v); return `$${args.length}`; }; // adds a bound parameter
  if (STATUSES.includes(req.query.status)) where.push(`status = ${p(req.query.status)}`);
  if (req.query.view === 'upcoming') where.push(`scheduled_date >= ${p(await today())} AND status NOT IN ('completed','cancelled')`);
  if (isDate(req.query.from)) where.push(`scheduled_date >= ${p(req.query.from)}`);
  if (isDate(req.query.to)) where.push(`scheduled_date <= ${p(req.query.to)}`);
  if (req.query.q) {
    const like = p(`%${str(req.query.q, 100)}%`);
    where.push(`(customer_name ILIKE ${like} OR email ILIKE ${like} OR code ILIKE ${like})`);
  }
  const order = req.query.view === 'upcoming' ? 'scheduled_date ASC, scheduled_time ASC' : 'created_at DESC';
  const orders = await q(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${order} LIMIT 500`, args);
  return withItems(orders);
}));
admin.patch('/orders/:id', wrap(async (req) => {
  const id = Number(req.params.id);
  const o = await one('SELECT status, paid FROM orders WHERE id = $1', [id]);
  if (!o) throw new HttpError(404, 'Not found');
  const status = STATUSES.includes(req.body.status) ? req.body.status : o.status;
  const paid = req.body.paid === undefined ? o.paid : bool(req.body.paid);
  await q('UPDATE orders SET status = $1, paid = $2 WHERE id = $3', [status, paid, id]);
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
  return q('SELECT * FROM expenses WHERE spent_on BETWEEN $1 AND $2 ORDER BY spent_on DESC, id DESC', [from, to]);
}));
admin.post('/expenses', wrap(async (req) => {
  await q(...insertSql('expenses', expenseFields(req.body)));
  return { ok: true };
}));
admin.put('/expenses/:id', wrap(async (req) => {
  await q(...updateSql('expenses', expenseFields(req.body), Number(req.params.id)));
  return { ok: true };
}));
admin.delete('/expenses/:id', wrap(async (req) => {
  await q('DELETE FROM expenses WHERE id = $1', [Number(req.params.id)]);
  return { ok: true };
}));

// messages
admin.get('/messages', wrap(() => q('SELECT * FROM messages ORDER BY handled, created_at DESC')));
admin.patch('/messages/:id', wrap(async (req) => {
  await q('UPDATE messages SET handled = $1 WHERE id = $2', [bool(req.body.handled), Number(req.params.id)]);
  return { ok: true };
}));
admin.delete('/messages/:id', wrap(async (req) => {
  await q('DELETE FROM messages WHERE id = $1', [Number(req.params.id)]);
  return { ok: true };
}));

// settings
admin.get('/settings', wrap(() => getSettings()));
admin.put('/settings', wrap(async (req) => {
  if (req.body.time_zone && !validZone(req.body.time_zone)) throw bad('Unknown time zone.');
  await tx(async (c) => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (req.body[key] === undefined) continue;
      await c.query(`INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [key, String(req.body[key]).slice(0, 2000)]);
    }
  });
  return getSettings();
}));

async function getCounts() {
  return one(`SELECT
      (SELECT COUNT(*) FROM orders WHERE status = 'new')::int AS new_orders,
      (SELECT COUNT(*) FROM orders WHERE status NOT IN ('completed','cancelled') AND scheduled_date >= $1)::int AS upcoming,
      (SELECT COUNT(*) FROM orders WHERE status = 'completed' AND NOT paid)::int AS unpaid,
      (SELECT COUNT(*) FROM messages WHERE NOT handled)::int AS unread_messages`, [await today()]);
}
admin.get('/counts', wrap(() => getCounts()));

// stats — sales are counted on their scheduled (fulfillment) date; cancelled orders are excluded
admin.get('/stats', wrap(async (req) => {
  const to = isDate(req.query.to) ? req.query.to : await today();
  const from = isDate(req.query.from) ? req.query.from : addDays(to, -29);
  const live = "status != 'cancelled' AND scheduled_date BETWEEN $1 AND $2";
  const range = [from, to];

  const [totals, exp, dailyRows, topProducts, expenseByCategory, counts] = await Promise.all([
    one(`SELECT COUNT(*)::int AS orders,
        COALESCE(SUM(total_cents - delivery_fee_cents), 0)::int AS revenue_cents,
        COALESCE(SUM(delivery_fee_cents), 0)::int AS delivery_cents,
        COALESCE(SUM(discount_cents), 0)::int AS discount_cents,
        COALESCE(SUM(cost_cents), 0)::int AS cogs_cents
      FROM orders WHERE ${live}`, range),
    one('SELECT COALESCE(SUM(amount_cents), 0)::int AS n FROM expenses WHERE spent_on BETWEEN $1 AND $2', range),
    q(`SELECT scheduled_date AS day, COUNT(*)::int AS orders, SUM(total_cents - delivery_fee_cents)::int AS revenue_cents
      FROM orders WHERE ${live} GROUP BY scheduled_date`, range),
    q(`SELECT oi.name, SUM(oi.quantity)::int AS quantity,
        SUM(oi.quantity * oi.unit_price_cents)::int AS sales_cents,
        SUM(oi.quantity * oi.unit_cost_cents)::int AS cost_cents
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'cancelled' AND o.scheduled_date BETWEEN $1 AND $2
      GROUP BY oi.name ORDER BY sales_cents DESC LIMIT 8`, range),
    q(`SELECT category, SUM(amount_cents)::int AS amount_cents
      FROM expenses WHERE spent_on BETWEEN $1 AND $2 GROUP BY category ORDER BY amount_cents DESC`, range),
    getCounts(),
  ]);

  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = [];
  for (let d = from; d <= to && daily.length < 400; d = addDays(d, 1)) {
    const r = byDay.get(d);
    daily.push({ day: d, orders: r?.orders || 0, revenue_cents: r?.revenue_cents || 0 });
  }

  // revenue here is product revenue after discounts (delivery fees reported separately)
  const gross = totals.revenue_cents - totals.cogs_cents;
  return {
    from, to, ...totals,
    expenses_cents: exp.n,
    gross_profit_cents: gross,
    net_profit_cents: gross + totals.delivery_cents - exp.n,
    avg_order_cents: totals.orders ? Math.round((totals.revenue_cents + totals.delivery_cents) / totals.orders) : 0,
    daily, topProducts, expenseByCategory, counts,
  };
}));

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? (String(err?.message).startsWith('DATABASE_URL is not set.') ? err.message : 'Something went wrong on our end.') : err.message });
});

export default app;
