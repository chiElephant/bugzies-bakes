import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = resolve(process.env.DB_PATH || 'data/bakes.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Cookies',
  unit_label TEXT NOT NULL DEFAULT 'each',
  price_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
  value INTEGER NOT NULL,            -- percent (0-100) or cents
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,                  -- NULL = unlimited
  uses INTEGER NOT NULL DEFAULT 0,
  starts_on TEXT,                    -- YYYY-MM-DD, inclusive
  ends_on TEXT,                      -- YYYY-MM-DD, inclusive
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('pickup','delivery')),
  address TEXT NOT NULL DEFAULT '',
  scheduled_date TEXT NOT NULL,      -- YYYY-MM-DD
  scheduled_time TEXT NOT NULL,      -- e.g. "10:00 AM - 12:00 PM"
  notes TEXT NOT NULL DEFAULT '',
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0, -- ingredient cost snapshot at order time
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','confirmed','baking','ready','completed','cancelled')),
  paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spent_on TEXT NOT NULL,            -- YYYY-MM-DD
  category TEXT NOT NULL DEFAULT 'Ingredients',
  description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  body TEXT NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export const DEFAULT_SETTINGS = {
  business_name: "Bugzie's Bakes",
  tagline: 'Homemade treats. Made with heart.',
  contact_email: 'hello@bugziesbakes.com',
  instagram_url: '',
  facebook_url: '',
  hero_image: '/images/hero.jpg',
  about_image: '/images/about.jpg',
  about_text: "I'm Bugzie — and I love to bake! What started as a simple hobby turned into a baking business made to share my favorite treats with you.\n\nEach recipe is tested, loved, and baked in small batches with quality ingredients. Thanks for being here and supporting Bugzie's Bakes!",
  lead_days: '2',                 // earliest order date = today + lead_days
  max_days_ahead: '60',
  closed_weekdays: '0',           // comma list, 0 = Sunday
  time_slots: '9:00 AM - 11:00 AM|11:00 AM - 1:00 PM|1:00 PM - 3:00 PM|3:00 PM - 5:00 PM',
  delivery_enabled: '1',
  delivery_fee_cents: '500',
  min_order_cents: '1200',
  pickup_note: "Pickup details are sent with your order confirmation.",
  payment_note: 'Pay at pickup or delivery — cash, Venmo, or Zelle.',
};

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count > 0) return;
  const ins = db.prepare(`INSERT INTO products
    (name, description, category, unit_label, price_cents, cost_cents, image, color, featured, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const items = [
    ['Chocolate Chip Cookies', 'Golden edges, gooey middles, and puddles of semi-sweet chocolate.', 'Cookies', 'each', 400, 90, '/images/chocolate-chip.jpg', 'yellow', 1],
    ['Brownies', 'Fudgy, crackly-topped brownies made with real cocoa and dark chocolate.', 'Bars', 'each', 400, 110, '/images/brownies.jpg', 'pink', 1],
    ['Funfetti Cookies', 'Soft vanilla sugar cookies loaded with rainbow sprinkles.', 'Cookies', 'each', 400, 80, '/images/funfetti.jpg', 'mint', 1],
    ['Oatmeal Raisin', 'Chewy, cinnamon-kissed oatmeal cookies with plump raisins.', 'Cookies', 'each', 400, 85, '/images/oatmeal-raisin.jpg', 'lavender', 1],
    ['Salted Caramel Blondies', 'Brown-butter blondies swirled with homemade salted caramel.', 'Bars', 'each', 450, 120, '/images/salted-caramel-blondies.jpg', 'yellow', 0],
  ];
  tx(() => items.forEach((it, i) => ins.run(...it, i)));

  db.prepare(`INSERT INTO coupons (code, description, kind, value, min_subtotal_cents)
    VALUES ('SWEET10', '10% off your order', 'percent', 10, 0)`).run();
}
seed();
