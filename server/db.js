import pg from 'pg';

const { DATABASE_URL } = process.env;

// One small pool per server instance. On Vercel, warm instances reuse it between requests.
export const pool = DATABASE_URL
  ? new pg.Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 })
  : null;

export async function q(text, params = []) {
  if (!pool) throw new Error('DATABASE_URL is not set.');
  const { rows } = await pool.query(text, params);
  return rows;
}
export const one = async (text, params) => (await q(text, params))[0];

/** Run `fn(client)` inside a transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Cookies',
  unit_label TEXT NOT NULL DEFAULT 'each',
  price_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- stored upper-case
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
  value INTEGER NOT NULL,             -- percent (1-100) or cents
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,                   -- NULL = unlimited
  uses INTEGER NOT NULL DEFAULT 0,
  starts_on TEXT,                     -- YYYY-MM-DD, inclusive
  ends_on TEXT,                       -- YYYY-MM-DD, inclusive
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('pickup','delivery')),
  address TEXT NOT NULL DEFAULT '',
  scheduled_date TEXT NOT NULL,       -- YYYY-MM-DD in the shop's time zone
  scheduled_time TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,  -- item-cost snapshot at order time
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','confirmed','baking','ready','completed','cancelled')),
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_scheduled_date_idx ON orders (scheduled_date);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  spent_on TEXT NOT NULL,             -- YYYY-MM-DD
  category TEXT NOT NULL DEFAULT 'Ingredients',
  description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  body TEXT NOT NULL,
  handled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Photos uploaded from the dashboard (keeps everything in one database)
CREATE TABLE IF NOT EXISTS images (
  id SERIAL PRIMARY KEY,
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);
`;

export const DEFAULT_SETTINGS = {
  business_name: "Bugzie's Bakes",
  tagline: 'Homemade treats. Made with heart.',
  contact_email: 'hello@bugziesbakes.com',
  instagram_url: '',
  facebook_url: '',
  hero_image: '/images/hero.jpg',
  about_image: '/images/about.jpg',
  about_text: "I'm Bugzie — and I love to bake! What started as a simple hobby turned into a baking business made to share my favorite treats with you.\n\nEach recipe is tested, loved, and baked in small batches with quality ingredients. Thanks for being here and supporting Bugzie's Bakes!",
  time_zone: '',                  // IANA zone, e.g. America/Chicago; set from the dashboard
  lead_days: '2',                 // earliest order date = today + lead_days
  max_days_ahead: '60',
  closed_weekdays: '0',           // comma list, 0 = Sunday
  time_slots: '9:00 AM - 11:00 AM|11:00 AM - 1:00 PM|1:00 PM - 3:00 PM|3:00 PM - 5:00 PM',
  delivery_enabled: '1',
  delivery_fee_cents: '500',
  min_order_cents: '1200',
  pickup_note: 'Pickup details are sent with your order confirmation.',
  payment_note: 'Pay at pickup or delivery — cash, Venmo, or Zelle.',
};

export async function getSettings() {
  const rows = await q('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

const SEED_PRODUCTS = [
  ['Chocolate Chip Cookies', 'Golden edges, gooey middles, and puddles of semi-sweet chocolate.', 'Cookies', 400, 90, '/images/chocolate-chip.jpg', 'yellow', true],
  ['Brownies', 'Fudgy, crackly-topped brownies made with real cocoa and dark chocolate.', 'Bars', 400, 110, '/images/brownies.jpg', 'pink', true],
  ['Funfetti Cookies', 'Soft vanilla sugar cookies loaded with rainbow sprinkles.', 'Cookies', 400, 80, '/images/funfetti.jpg', 'mint', true],
  ['Oatmeal Raisin', 'Chewy, cinnamon-kissed oatmeal cookies with plump raisins.', 'Cookies', 400, 85, '/images/oatmeal-raisin.jpg', 'lavender', true],
  ['Salted Caramel Blondies', 'Brown-butter blondies swirled with homemade salted caramel.', 'Bars', 450, 120, '/images/salted-caramel-blondies.jpg', 'yellow', false],
];

let ready = null;
/** Create tables and starter menu on first use. Safe to call on every request. */
export function ensureDb() {
  if (!ready) {
    ready = tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(724205)'); // serialize concurrent cold starts
      await c.query(SCHEMA);
      const seeded = await c.query("SELECT 1 FROM settings WHERE key = '_seeded'");
      if (seeded.rowCount) return;
      for (const [i, p] of SEED_PRODUCTS.entries()) {
        await c.query(`INSERT INTO products (name, description, category, price_cents, cost_cents, image, color, featured, sort)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [...p, i]);
      }
      await c.query(`INSERT INTO coupons (code, description, kind, value) VALUES ('SWEET10', '10% off your order', 'percent', 10)
        ON CONFLICT (code) DO NOTHING`);
      await c.query("INSERT INTO settings (key, value) VALUES ('_seeded', '1')");
    }).catch((e) => { ready = null; throw e; });
  }
  return ready;
}
