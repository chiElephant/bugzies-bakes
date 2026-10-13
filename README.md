# Bugzie's Bakes 🍪

A small online shop for a home baking business. It has:

- **A shop for customers**: home, about, menu, how it works, contact, a basket, and a checkout where customers **schedule** an order for pickup or delivery on a day and time window they choose.
- **The Baker's Dashboard** (`/admin`):
  - **Overview:** sales, item costs, expenses and net profit, a sales chart, best sellers with margins, and upcoming orders.
  - **Orders:** a bake schedule grouped by day (with "what to bake" totals), a status for each order (new → confirmed → baking → ready → completed), and a paid / unpaid checkbox.
  - **Menu & Pricing:** add or edit items, set the price and **your cost to make** (margin is calculated for you), upload photos, hide items, and choose which are featured on the homepage.
  - **Coupons:** % off or $ off, with an optional minimum order, start and end dates, and usage limit.
  - **Costs & Expenses:** log ingredient runs, packaging, equipment, market fees and so on.
  - **Messages:** the contact form inbox.
  - **Settings:** days of notice needed, closed days, time windows, delivery fee, minimum order, about text, photos and social links.

Payment happens offline (cash, Venmo, Zelle and so on). The checkout shows a "how to pay" note you can edit in Settings.

## Running it

Requires **Node 22.13+**. The database is Node's built-in SQLite, so there's nothing else to install.

```bash
npm install
npm run dev          # shop on http://localhost:5173, dashboard at /admin
```

Set your dashboard password by copying `.env.example` to `.env` and filling in `ADMIN_PASSWORD`. If you skip that, the dev server makes up a password at startup and prints it in the terminal.

### Production

```bash
npm run build
npm start                 # reads .env; serves on $PORT (default 3001)
```

| Env var | What it does |
|---|---|
| `ADMIN_PASSWORD` | Dashboard password. **Required** in production. |
| `SESSION_SECRET` | Keeps you logged in across restarts. If it isn't set, a restart logs you out. |
| `PORT` | Port to serve on (default `3001`). |
| `DB_PATH` | SQLite file (default `data/bakes.db`). |
| `UPLOAD_DIR` | Where uploaded photos are stored (default `uploads/`). |
| `TZ` | Your time zone, e.g. `America/Chicago`. Order dates and lead times use it. |

The host needs a **persistent disk** for `data/` and `uploads/` (Render, Railway, Fly.io and any VPS all work).

## Photos

Put photos in `public/images/` with these names, or upload them from the dashboard later:

| File | Used for |
|---|---|
| `hero.jpg` | Homepage hero (about square) |
| `about.jpg` | About section (square) |
| `chocolate-chip.jpg`, `brownies.jpg`, `funfetti.jpg`, `oatmeal-raisin.jpg`, `salted-caramel-blondies.jpg` | Menu items (landscape, 4:3) |

Until a photo exists, its spot shows a soft striped placeholder.

## How the numbers work

- **Sales** = what customers paid for treats after coupons. Delivery fees are reported separately.
- **Item costs** = each item's "cost to make" × quantity, saved when the order is placed. Changing a cost later doesn't rewrite past profits.
- **Net profit** = sales + delivery fees − item costs − logged expenses.
- An order counts on its **scheduled date**. Cancelled orders are excluded.
