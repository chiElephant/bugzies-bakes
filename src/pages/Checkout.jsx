import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { addDays, longDate, money2, parseYmd, ymd } from '../lib/format.js';
import { Icon, Stepper } from '../components/bits.jsx';
import { LineThumb } from '../components/Layout.jsx';
import { PageHead } from './Public.jsx';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function Calendar({ value, onChange, isAvailable, today, earliest }) {
  const [month, setMonth] = useState(() => {
    const d = parseYmd(value || earliest); return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const thisMonth = parseYmd(today);
  const canBack = month > new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} disabled={!canBack} aria-label="Previous month"><Icon name="back" size={20} /></button>
        <strong>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><Icon name="arrow" size={20} /></button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((d, i) => d === null ? <div key={`b${i}`} /> : (
          <button
            type="button" key={d} className={`cal-day ${d === today ? 'today' : ''}`}
            disabled={!isAvailable(d)} aria-pressed={value === d}
            aria-label={longDate(d)} onClick={() => onChange(d)}
          >{Number(d.slice(8))}</button>
        ))}
      </div>
    </div>
  );
}

export default function Checkout() {
  const { config, lines, subtotal, setQty, clear, refresh } = useStore();
  const navigate = useNavigate();
  const [f, setF] = useState({
    fulfillment: 'pickup', scheduled_date: '', scheduled_time: '',
    customer_name: '', email: '', phone: '', address: '', notes: '',
  });
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null); // { code, description, discount_cents }
  const [couponErr, setCouponErr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const today = config?.today || ymd(new Date());
  const earliest = config ? addDays(today, config.lead_days) : today;
  const latest = config ? addDays(today, config.max_days_ahead) : today;
  const isAvailable = useMemo(() => (d) =>
    !!config && d >= earliest && d <= latest && !config.closed_weekdays.includes(parseYmd(d).getDay()),
  [config, earliest, latest]);

  // Re-validate the coupon when the subtotal changes
  useEffect(() => {
    if (!coupon) return;
    api('/coupons/check', { method: 'POST', body: { code: coupon.code, subtotal_cents: subtotal } })
      .then(setCoupon)
      .catch((e) => { setCoupon(null); setCouponErr(e.message); });
  }, [subtotal]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) return <p className="center muted" style={{ padding: '4rem' }}>Loading…</p>;
  if (lines.length === 0) {
    return (
      <>
        <PageHead title="Checkout" />
        <div className="wrap empty">
          <Icon name="bag" size={56} stroke={1.6} />
          <p><strong>Your basket is empty.</strong></p>
          <Link to="/menu" className="btn yellow">Browse the menu</Link>
        </div>
      </>
    );
  }

  const discount = coupon?.discount_cents || 0;
  const fee = f.fulfillment === 'delivery' ? config.delivery_fee_cents : 0;
  const total = subtotal - discount + fee;
  const short = Math.max(0, config.min_order_cents - subtotal);

  const applyCoupon = async () => {
    setCouponErr('');
    if (!couponInput.trim()) return;
    try {
      setCoupon(await api('/coupons/check', { method: 'POST', body: { code: couponInput, subtotal_cents: subtotal } }));
      setCouponInput('');
    } catch (e) { setCoupon(null); setCouponErr(e.message); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.scheduled_date) return setError('Please pick a date for your order.');
    if (!f.scheduled_time) return setError('Please pick a time window.');
    setBusy(true);
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: {
          ...f, coupon_code: coupon?.code || '',
          items: lines.map((l) => ({ product_id: l.product.id, quantity: l.qty })),
        },
      });
      try { sessionStorage.setItem('bb-last-order', JSON.stringify({ ...order, customer_name: f.customer_name, email: f.email })); } catch { /* ignore */ }
      clear();
      navigate('/thanks', { state: { order: { ...order, customer_name: f.customer_name, email: f.email } } });
    } catch (err) {
      setError(err.message);
      if (/no longer available/.test(err.message)) refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Schedule Your Order" sub="Pick a day, tell us who you are, and we'll get baking." tint="var(--yellow-soft)" />
      <form className="wrap checkout" onSubmit={submit}>
        <div>
          {error && <div className="error-box" role="alert">{error}</div>}

          <section className="panel">
            <h2><span className="n" style={{ background: 'var(--yellow-soft)' }}>1</span> When & how</h2>
            <div className="seg" role="group" aria-label="Pickup or delivery" style={{ marginBottom: '1.2rem' }}>
              <button type="button" aria-pressed={f.fulfillment === 'pickup'} onClick={() => setF({ ...f, fulfillment: 'pickup' })}>
                Pickup
              </button>
              {config.delivery_enabled && (
                <button type="button" aria-pressed={f.fulfillment === 'delivery'} onClick={() => setF({ ...f, fulfillment: 'delivery' })}>
                  Delivery (+{money2(config.delivery_fee_cents)})
                </button>
              )}
            </div>
            <div className="grid-2" style={{ alignItems: 'start', gap: '1.5rem' }}>
              <div>
                <div className="label" style={{ marginBottom: '.4rem' }}>Date</div>
                <Calendar value={f.scheduled_date} onChange={(d) => setF({ ...f, scheduled_date: d })}
                  isAvailable={isAvailable} today={today} earliest={earliest} />
                <small className="muted">Orders need at least {config.lead_days} day{config.lead_days === 1 ? '' : 's'} notice.</small>
              </div>
              <div>
                <div className="label" style={{ marginBottom: '.5rem' }}>Time window</div>
                <div className="chips" role="group" aria-label="Time window">
                  {config.time_slots.map((t) => (
                    <button type="button" key={t} className="chip" aria-pressed={f.scheduled_time === t}
                      onClick={() => setF({ ...f, scheduled_time: t })}>{t}</button>
                  ))}
                </div>
                {f.scheduled_date && (
                  <p style={{ marginTop: '1rem', fontWeight: 700 }}>
                    <Icon name="calendar" size={18} style={{ verticalAlign: '-3px' }} /> {longDate(f.scheduled_date)}{f.scheduled_time && `, ${f.scheduled_time}`}
                  </p>
                )}
                {f.fulfillment === 'pickup' && config.pickup_note && <p className="muted" style={{ fontSize: '.9rem' }}>{config.pickup_note}</p>}
              </div>
            </div>
          </section>

          <section className="panel">
            <h2><span className="n" style={{ background: 'var(--pink-soft)' }}>2</span> Your details</h2>
            <div className="grid-2">
              <label className="field"><span>Name</span><input required value={f.customer_name} onChange={set('customer_name')} autoComplete="name" /></label>
              <label className="field"><span>Phone</span><input type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="Optional" /></label>
            </div>
            <label className="field"><span>Email</span><input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /><small>So we can reach you about your order.</small></label>
            {f.fulfillment === 'delivery' && (
              <label className="field"><span>Delivery address</span><textarea required rows={2} value={f.address} onChange={set('address')} autoComplete="street-address" /></label>
            )}
            <label className="field"><span>Notes</span><textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Allergies, gift message, custom requests…" /></label>
          </section>
        </div>

        <aside className="panel summary" aria-label="Order summary">
          <h2><span className="n" style={{ background: 'var(--mint-soft)' }}>3</span> Your treats</h2>
          {lines.map(({ product, qty }) => (
            <div className="line-item" key={product.id}>
              <LineThumb product={product} />
              <div>
                <h4>{product.name}</h4>
                <Stepper value={qty} min={0} onChange={(q) => setQty(product.id, q)} label={`${product.name} quantity`} />
              </div>
              <div className="price">{money2(qty * product.price_cents)}</div>
            </div>
          ))}

          <div style={{ borderTop: '1px solid var(--line)', marginTop: '.6rem', paddingTop: '1rem' }}>
            {coupon ? (
              <div className="ok-box row-between" style={{ alignItems: 'center' }}>
                <span><Icon name="tag" size={16} style={{ verticalAlign: '-2px' }} /> {coupon.code}{coupon.description && ` — ${coupon.description}`}</span>
                <button type="button" className="link-btn" onClick={() => setCoupon(null)}>Remove</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.8rem' }}>
                <input className="input" placeholder="Coupon code" value={couponInput} aria-label="Coupon code"
                  onChange={(e) => setCouponInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }} />
                <button type="button" className="btn ghost sm" onClick={applyCoupon}>Apply</button>
              </div>
            )}
            {couponErr && <p style={{ color: 'var(--bad)', fontSize: '.88rem', fontWeight: 700, marginTop: '-.3rem' }}>{couponErr}</p>}

            <div className="row-between"><span>Subtotal</span><span>{money2(subtotal)}</span></div>
            {discount > 0 && <div className="row-between" style={{ color: 'var(--mint)', fontWeight: 700 }}><span>Discount</span><span>−{money2(discount)}</span></div>}
            {fee > 0 && <div className="row-between"><span>Delivery</span><span>{money2(fee)}</span></div>}
            <div className="row-between total-row" style={{ marginTop: '.4rem' }}><span>Total</span><span>{money2(total)}</span></div>
            {short > 0 && <p className="muted" style={{ fontSize: '.9rem' }}>Add {money2(short)} more to reach our {money2(config.min_order_cents)} minimum.</p>}
            <button className="btn pink block lg" style={{ marginTop: '1rem' }} disabled={busy || short > 0}>
              {busy ? 'Placing order…' : <>Place order <Icon name="check" size={20} /></>}
            </button>
            {config.payment_note && <p className="muted center" style={{ fontSize: '.85rem', marginTop: '.8rem', marginBottom: 0 }}>{config.payment_note}</p>}
          </div>
        </aside>
      </form>
    </>
  );
}

export function Thanks() {
  const { state } = useLocation();
  const order = state?.order || (() => {
    try { return JSON.parse(sessionStorage.getItem('bb-last-order')); } catch { return null; }
  })();
  const { config } = useStore();

  if (!order) {
    return <div className="wrap empty"><p>No recent order found.</p><Link className="btn yellow" to="/menu">Browse the menu</Link></div>;
  }
  return (
    <section className="wrap" style={{ padding: '3rem 20px' }}>
      <div className="panel confetti-card">
        <div style={{ fontSize: '3rem', lineHeight: 1 }} aria-hidden="true">🎉</div>
        <h1 className="squiggle" style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)' }}>Order placed!</h1>
        <p className="tagline" style={{ margin: '.2rem 0 .6rem' }}>Thank you, {order.customer_name?.split(' ')[0] || 'friend'}!</p>
        <div className="order-code">{order.code}</div>
        <p>
          Your treats will be ready for <strong>{order.fulfillment}</strong> on<br />
          <strong>{longDate(order.scheduled_date)}</strong>, {order.scheduled_time}.
        </p>
        <div style={{ textAlign: 'left', background: 'var(--cream)', borderRadius: 16, padding: '1rem 1.2rem', margin: '1.2rem 0' }}>
          {order.items.map((it) => (
            <div className="row-between" key={it.name}><span>{it.quantity} × {it.name}</span><span>{money2(it.quantity * it.unit_price_cents)}</span></div>
          ))}
          {order.discount_cents > 0 && <div className="row-between" style={{ color: 'var(--mint)' }}><span>Discount</span><span>−{money2(order.discount_cents)}</span></div>}
          {order.delivery_fee_cents > 0 && <div className="row-between"><span>Delivery</span><span>{money2(order.delivery_fee_cents)}</span></div>}
          <div className="row-between total-row" style={{ marginTop: '.4rem' }}><span>Total</span><span>{money2(order.total_cents)}</span></div>
        </div>
        {config?.payment_note && <p className="muted">{config.payment_note}</p>}
        <p className="muted" style={{ fontSize: '.92rem' }}>Keep your order code handy. Questions? <Link to="/contact">Get in touch</Link>.</p>
        <Link to="/" className="btn yellow">Back home</Link>
      </div>
    </section>
  );
}
