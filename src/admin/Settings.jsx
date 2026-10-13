import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fromCents, toCents } from '../lib/format.js';
import { Icon } from '../components/bits.jsx';
import { AdminTop } from './AdminLayout.jsx';
import { ImagePicker } from './Products.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Messages() {
  const { refreshCounts } = useOutletContext();
  const [items, setItems] = useState(null);
  const load = () => api('/admin/messages').then(setItems);
  useEffect(() => { load(); }, []);
  const mark = async (m, handled) => { await api(`/admin/messages/${m.id}`, { method: 'PATCH', body: { handled } }); load(); refreshCounts(); };
  const remove = async (m) => { if (!confirm('Delete this message?')) return; await api(`/admin/messages/${m.id}`, { method: 'DELETE' }); load(); refreshCounts(); };

  return (
    <>
      <AdminTop title="Messages" />
      {!items ? <p className="muted">Loading…</p> : items.length === 0 ? <div className="a-card empty">No messages yet.</div> : items.map((m) => (
        <article key={m.id} className="order-card" style={{ opacity: m.handled ? 0.6 : 1 }}>
          <div className="oc-top">
            <strong>{m.name}</strong>
            <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message")}`}>{m.email}</a>
            {!m.handled && <span className="pill st-new">New</span>}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: '.82rem' }}>{new Date(m.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</span>
          </div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '.6rem 0' }}>{m.body}</p>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn ghost sm" onClick={() => mark(m, !m.handled)}><Icon name="check" size={16} /> {m.handled ? 'Mark unread' : 'Mark handled'}</button>
            <button className="btn ghost sm" onClick={() => remove(m)}><Icon name="trash" size={16} /> Delete</button>
          </div>
        </article>
      ))}
    </>
  );
}

export default function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api('/admin/settings').then(setS); }, []);
  if (!s) return <p className="muted">Loading…</p>;

  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const closed = s.closed_weekdays.split(',').filter(Boolean).map(Number);
  const toggleDay = (d) => setS({ ...s, closed_weekdays: (closed.includes(d) ? closed.filter((x) => x !== d) : [...closed, d]).sort().join(',') });
  const money = (k) => ({ value: s[`_${k}`] ?? fromCents(Number(s[k])), onChange: (e) => setS({ ...s, [`_${k}`]: e.target.value }) });

  const save = async (e) => {
    e.preventDefault(); setMsg(''); setErr('');
    const body = { ...s };
    for (const k of ['delivery_fee_cents', 'min_order_cents']) {
      if (body[`_${k}`] !== undefined) {
        const c = toCents(body[`_${k}`] || 0);
        if (Number.isNaN(c) || c < 0) return setErr('Please check the dollar amounts.');
        body[k] = c;
      }
      delete body[`_${k}`];
    }
    for (const k of ['lead_days', 'max_days_ahead']) {
      if (!/^\d+$/.test(String(body[k]))) return setErr('Lead time and booking window must be whole numbers.');
    }
    if (!body.time_slots.split('|').some((t) => t.trim())) return setErr('Add at least one time window.');
    try { setS(await api('/admin/settings', { method: 'PUT', body })); setMsg('Saved! Changes are live on the shop.'); }
    catch (e2) { setErr(e2.message); }
  };

  return (
    <>
      <AdminTop title="Settings" />
      <form onSubmit={save} className="stack" style={{ maxWidth: 820 }}>
        {msg && <div className="ok-box">{msg}</div>}
        {err && <div className="error-box">{err}</div>}

        <section className="a-card">
          <div className="card-head"><h2>Ordering & scheduling</h2></div>
          <div className="grid-2">
            <label className="field"><span>Notice needed (days)</span><input inputMode="numeric" value={s.lead_days} onChange={set('lead_days')} /><small>Earliest date customers can pick = today + this.</small></label>
            <label className="field"><span>Booking window (days ahead)</span><input inputMode="numeric" value={s.max_days_ahead} onChange={set('max_days_ahead')} /></label>
            <label className="field"><span>Minimum order ($)</span><input inputMode="decimal" {...money('min_order_cents')} /></label>
            <label className="field"><span>Delivery fee ($)</span><input inputMode="decimal" {...money('delivery_fee_cents')} /></label>
          </div>
          <label className="check" style={{ marginBottom: '1rem' }}>
            <input type="checkbox" checked={s.delivery_enabled === '1'} onChange={(e) => setS({ ...s, delivery_enabled: e.target.checked ? '1' : '0' })} /> Offer delivery
          </label>
          <div className="field">
            <span>Closed on</span>
            <div className="chips">
              {DAYS.map((d, i) => <button type="button" key={d} className="chip" aria-pressed={closed.includes(i)} onClick={() => toggleDay(i)}>{d}</button>)}
            </div>
          </div>
          <label className="field">
            <span>Time windows</span>
            <textarea rows={4} value={s.time_slots.split('|').join('\n')} onChange={(e) => setS({ ...s, time_slots: e.target.value.split('\n').join('|') })} />
            <small>One per line, e.g. “9:00 AM - 11:00 AM”.</small>
          </label>
          <label className="field"><span>Pickup note</span><input value={s.pickup_note} onChange={set('pickup_note')} /></label>
          <label className="field"><span>Payment note</span><input value={s.payment_note} onChange={set('payment_note')} /><small>Shown at checkout — tell customers how to pay.</small></label>
        </section>

        <section className="a-card">
          <div className="card-head"><h2>Shop details</h2></div>
          <div className="grid-2">
            <label className="field"><span>Business name</span><input value={s.business_name} onChange={set('business_name')} /></label>
            <label className="field"><span>Tagline</span><input value={s.tagline} onChange={set('tagline')} /></label>
            <label className="field"><span>Contact email</span><input type="email" value={s.contact_email} onChange={set('contact_email')} /></label>
            <label className="field"><span>Instagram URL</span><input value={s.instagram_url} onChange={set('instagram_url')} placeholder="https://instagram.com/…" /></label>
            <label className="field"><span>Facebook URL</span><input value={s.facebook_url} onChange={set('facebook_url')} placeholder="https://facebook.com/…" /></label>
          </div>
          <label className="field"><span>About text</span><textarea rows={5} value={s.about_text} onChange={set('about_text')} /></label>
          <div className="grid-2">
            <ImagePicker label="Homepage photo" value={s.hero_image} onChange={(v) => setS({ ...s, hero_image: v })} />
            <ImagePicker label="About photo" value={s.about_image} onChange={(v) => setS({ ...s, about_image: v })} />
          </div>
        </section>

        <div><button className="btn pink">Save settings</button></div>
      </form>
    </>
  );
}
