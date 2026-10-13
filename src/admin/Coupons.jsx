import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fromCents, money2, prettyDate, toCents } from '../lib/format.js';
import { Icon } from '../components/bits.jsx';
import { AdminTop, Modal } from './AdminLayout.jsx';

const blank = { code: '', description: '', kind: 'percent', value: '10', min: '', max_uses: '', starts_on: '', ends_on: '', active: true };

function describe(c) {
  const amt = c.kind === 'percent' ? `${c.value}% off` : `${money2(c.value)} off`;
  return c.min_subtotal_cents ? `${amt} orders over ${money2(c.min_subtotal_cents)}` : amt;
}
function window_(c) {
  if (!c.starts_on && !c.ends_on) return 'Always';
  if (c.starts_on && c.ends_on) return `${prettyDate(c.starts_on, { weekday: undefined })} – ${prettyDate(c.ends_on, { weekday: undefined })}`;
  return c.ends_on ? `Until ${prettyDate(c.ends_on, { weekday: undefined })}` : `From ${prettyDate(c.starts_on, { weekday: undefined })}`;
}

export default function Coupons() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api('/admin/coupons').then(setItems);
  useEffect(() => { load(); }, []);

  const edit = (c) => setEditing({
    ...c, value: c.kind === 'fixed' ? fromCents(c.value) : String(c.value),
    min: c.min_subtotal_cents ? fromCents(c.min_subtotal_cents) : '',
    max_uses: c.max_uses ?? '', starts_on: c.starts_on || '', ends_on: c.ends_on || '', active: !!c.active,
  });

  return (
    <>
      <AdminTop title="Coupons & Discounts">
        <button className="btn pink sm" onClick={() => setEditing(blank)}><Icon name="plus" size={18} /> New coupon</button>
      </AdminTop>
      <section className="a-card">
        {!items ? <p className="muted">Loading…</p> : items.length === 0 ? <p className="muted">No coupons yet.</p> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Code</th><th>Deal</th><th>Valid</th><th className="num">Used</th><th className="num">Given away</th><th>Status</th><th /></tr></thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td><strong style={{ fontFamily: 'var(--font-display)', letterSpacing: '.04em' }}>{c.code}</strong>{c.description && <div className="muted" style={{ fontSize: '.82rem' }}>{c.description}</div>}</td>
                    <td>{describe(c)}</td>
                    <td>{window_(c)}</td>
                    <td className="num">{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                    <td className="num">{money2(c.total_discount_cents)}</td>
                    <td><span className={`pill plain ${c.active ? 'on' : 'off'}`}>{c.active ? 'Active' : 'Paused'}</span></td>
                    <td className="num"><button className="icon-btn" aria-label={`Edit ${c.code}`} onClick={() => edit(c)}><Icon name="edit" size={20} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <CouponForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function CouponForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault(); setErr('');
    const value = f.kind === 'fixed' ? toCents(f.value) : Number(f.value);
    if (!(value > 0)) return setErr('Enter the discount amount.');
    const body = {
      code: f.code, description: f.description, kind: f.kind, value,
      min_subtotal_cents: f.min ? toCents(f.min) : 0,
      max_uses: f.max_uses, starts_on: f.starts_on, ends_on: f.ends_on, active: f.active,
    };
    try {
      await api(f.id ? `/admin/coupons/${f.id}` : '/admin/coupons', { method: f.id ? 'PUT' : 'POST', body });
      onSaved();
    } catch (e2) { setErr(e2.message); }
  };
  const remove = async () => {
    if (!confirm(`Delete coupon ${f.code}?`)) return;
    await api(`/admin/coupons/${f.id}`, { method: 'DELETE' });
    onSaved();
  };

  return (
    <Modal title={f.id ? 'Edit coupon' : 'New coupon'} onClose={onClose}>
      <form onSubmit={save}>
        {err && <div className="error-box">{err}</div>}
        <div className="grid-2">
          <label className="field"><span>Code</span><input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="HOLIDAY15" /></label>
          <label className="field"><span>Shown to customer</span><input value={f.description} onChange={set('description')} placeholder="15% off holiday treats" /></label>
        </div>
        <div className="field">
          <span>Discount type</span>
          <div className="seg" role="group">
            <button type="button" aria-pressed={f.kind === 'percent'} onClick={() => setF({ ...f, kind: 'percent' })}>% off</button>
            <button type="button" aria-pressed={f.kind === 'fixed'} onClick={() => setF({ ...f, kind: 'fixed' })}>$ off</button>
          </div>
        </div>
        <div className="grid-2">
          <label className="field"><span>{f.kind === 'percent' ? 'Percent off' : 'Dollars off'}</span><input required inputMode="decimal" value={f.value} onChange={set('value')} /></label>
          <label className="field"><span>Minimum order ($)</span><input inputMode="decimal" value={f.min} onChange={set('min')} placeholder="None" /></label>
          <label className="field"><span>Starts</span><input type="date" value={f.starts_on} onChange={set('starts_on')} /></label>
          <label className="field"><span>Ends</span><input type="date" value={f.ends_on} onChange={set('ends_on')} /></label>
          <label className="field"><span>Max total uses</span><input type="number" min="1" value={f.max_uses} onChange={set('max_uses')} placeholder="Unlimited" /></label>
          <div className="field" style={{ alignContent: 'end' }}><label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Active</label></div>
        </div>
        <div className="row-between">
          {f.id ? <button type="button" className="btn ghost sm" onClick={remove}><Icon name="trash" size={16} /> Delete</button> : <span />}
          <button className="btn pink">Save coupon</button>
        </div>
      </form>
    </Modal>
  );
}
