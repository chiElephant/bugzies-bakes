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

The site runs on **Vercel**, and the data (orders, menu, coupons, expenses and uploaded photos) lives in **Neon Postgres**. Tables and the starter menu are created automatically the first time the app connects.

### Local development

Requires **Node 22.9+**.

```bash
npm install
cp .env.example .env    # fill in DATABASE_URL and ADMIN_PASSWORD
npm run dev             # shop on http://localhost:5173, dashboard at /admin
```

If you've linked the Neon CLI (`neon link`), it writes `DATABASE_URL` to `.env.local`, and the app reads that too. Use a Neon dev branch locally so test orders stay out of production.

### Deploying to Vercel

1. Import the GitHub repo in Vercel. `vercel.json` already sets the build (Vite → `dist/`) and routes `/api/*` to the Express function in `api/index.js`.
2. Under **Settings → Environment Variables**, add:

| Env var | What it does |
|---|---|
| `DATABASE_URL` | Your Neon connection string. Use the **pooled** one (host contains `-pooler`). **Required.** |
| `ADMIN_PASSWORD` | Password for `/admin`. **Required.** |
| `SESSION_SECRET` | Optional. Any long random string. Without it, the login key is derived from the password, so changing the password logs you out. |

3. Deploy, then open `/admin` and log in. The dashboard sets the shop's time zone from your browser on first visit, and you can change it under **Settings**. Vercel's servers run on UTC, so the time zone is what makes "today", lead times and daily sales use your local clock.

## Photos

Site photos and the logo live in `public/images/`:

| File | Used for |
|---|---|
| `logo.png` | Logo in the header, footer, homepage hero and dashboard (transparent background) |
| `hero.jpg` | Homepage hero |
| `about.jpg` | About section |
| `chocolate-chip.jpg`, `brownies.jpg`, `funfetti.jpg`, `oatmeal-raisin.jpg`, `salted-caramel-blondies.jpg` | Menu items (4:3) |

To swap a photo, replace the file, or upload a new one from the dashboard (Menu & Pricing for items, Settings for the hero and about photos). Uploads are shrunk in the browser and stored in Neon. If an image is missing, a soft placeholder shows instead.

## How the numbers work

- **Sales** = what customers paid for treats after coupons. Delivery fees are reported separately.
- **Item costs** = each item's "cost to make" × quantity, saved when the order is placed. Changing a cost later doesn't rewrite past profits.
- **Net profit** = sales + delivery fees − item costs − logged expenses.
- An order counts on its **scheduled date**. Cancelled orders are excluded.
