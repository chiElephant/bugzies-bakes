import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fromCents, money2, toCents } from '../lib/format.js';
import { Icon, Photo } from '../components/bits.jsx';
import { AdminTop, Modal } from './AdminLayout.jsx';

const COLORS = [['yellow', '#f7c34b'], ['pink', '#ee7f8e'], ['mint', '#4db39c'], ['lavender', '#b9a0e0'], ['blue', '#7cc3da']];
const blank = { name: '', description: '', category: 'Cookies', unit_label: 'each', price: '', cost: '', image: '', color: 'yellow', featured: false, active: true, sort: 0 };

export function marginClass(m) { return m >= 0.6 ? 'margin-good' : m >= 0.4 ? 'margin-low' : 'margin-bad'; }

export async function uploadImage(file) {
  if (file.size > 6 * 1024 * 1024) throw new Error('Please choose an image under 6 MB.');
  const data = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
  return (await api('/admin/upload', { method: 'POST', body: { data } })).url;
}

export function ImagePicker({ value, onChange, label = 'Photo' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="field">
      <span>{label}</span>
      <div className="img-pick">
        <div className="prev"><Photo src={value} alt="Preview" /></div>
        <div style={{ display: 'grid', gap: '.4rem', flex: 1 }}>
          <label className="btn ghost sm" style={{ width: 'fit-content' }}>
            {busy ? 'Uploading…' : 'Upload photo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                setBusy(true); setErr('');
                try { onChange(await uploadImage(file)); } catch (e2) { setErr(e2.message); } finally { setBusy(false); e.target.value = ''; }
              }} />
          </label>
          <input className="input" placeholder="…or paste an image URL" value={value} onChange={(e) => onChange(e.target.value)} />
          {err && <small style={{ color: 'var(--bad)' }}>{err}</small>}
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api('/admin/products').then(setItems);
  useEffect(() => { load(); }, []);

  const toggle = async (p, key) => {
    await api(`/admin/products/${p.id}`, { method: 'PUT', body: { ...p, [key]: !p[key] } });
    load();
  };

  return (
    <>
      <AdminTop title="Menu & Pricing">
        <button className="btn pink sm" onClick={() => setEditing(blank)}><Icon name="plus" size={18} /> Add item</button>
      </AdminTop>
      <section className="a-card">
        {!items ? <p className="muted">Loading…</p> : items.length === 0 ? <p className="muted">No items yet — add your first treat!</p> : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr><th /><th>Item</th><th className="num">Price</th><th className="num">Cost</th><th className="num">Profit / unit</th><th>Featured</th><th>On menu</th><th /></tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const m = p.price_cents ? (p.price_cents - p.cost_cents) / p.price_cents : 0;
                  return (
                    <tr key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
                      <td><div className={`thumb tint-${p.color}`}><Photo src={p.image} alt="" /></div></td>
                      <td><strong>{p.name}</strong><div className="muted" style={{ fontSize: '.82rem' }}>{p.category} · {p.unit_label}</div></td>
                      <td className="num">{money2(p.price_cents)}</td>
                      <td className="num">{money2(p.cost_cents)}</td>
                      <td className="num">{money2(p.price_cents - p.cost_cents)} <span className={marginClass(m)}>({Math.round(m * 100)}%)</span></td>
                      <td><input type="checkbox" checked={!!p.featured} onChange={() => toggle(p, 'featured')} aria-label={`Feature ${p.name}`} /></td>
                      <td><input type="checkbox" checked={!!p.active} onChange={() => toggle(p, 'active')} aria-label={`Show ${p.name} on menu`} /></td>
                      <td className="num">
                        <button className="icon-btn" aria-label={`Edit ${p.name}`}
                          onClick={() => setEditing({ ...p, price: fromCents(p.price_cents), cost: fromCents(p.cost_cents), featured: !!p.featured, active: !!p.active })}>
                          <Icon name="edit" size={20} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: '.82rem', marginBottom: 0 }}>
          “Cost” is what one unit costs you to make (ingredients + packaging). It's saved on each order, so changing it later won't rewrite past profits.
        </p>
      </section>
      {editing && <ProductForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function ProductForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const price = toCents(f.price), cost = toCents(f.cost || 0);
  const margin = price > 0 && !Number.isNaN(cost) ? (price - cost) / price : null;

  const save = async (e) => {
    e.preventDefault(); setErr('');
    if (!(price > 0)) return setErr('Please enter a price.');
    if (Number.isNaN(cost) || cost < 0) return setErr('Please enter a valid cost (or 0).');
    setBusy(true);
    try {
      const body = { ...f, price_cents: price, cost_cents: cost };
      await api(f.id ? `/admin/products/${f.id}` : '/admin/products', { method: f.id ? 'PUT' : 'POST', body });
      onSaved();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`Delete “${f.name}”? Past orders keep their history. Tip: untick “On menu” to just hide it.`)) return;
    await api(`/admin/products/${f.id}`, { method: 'DELETE' });
    onSaved();
  };

  return (
    <Modal title={f.id ? 'Edit item' : 'New item'} onClose={onClose}>
      <form onSubmit={save}>
        {err && <div className="error-box">{err}</div>}
        <label className="field"><span>Name</span><input required value={f.name} onChange={set('name')} /></label>
        <label className="field"><span>Description</span><textarea rows={2} value={f.description} onChange={set('description')} /></label>
        <div className="grid-2">
          <label className="field"><span>Category</span><input value={f.category} onChange={set('category')} placeholder="Cookies, Bars, Cakes…" /></label>
          <label className="field"><span>Sold by</span><input value={f.unit_label} onChange={set('unit_label')} placeholder="each, dozen, box of 6…" /></label>
          <label className="field"><span>Price ($)</span><input required inputMode="decimal" value={f.price} onChange={set('price')} placeholder="4.00" /></label>
          <label className="field">
            <span>Your cost to make ($)</span><input inputMode="decimal" value={f.cost} onChange={set('cost')} placeholder="0.90" />
            {margin !== null && <small>Profit {money2(price - cost)} per {f.unit_label || 'unit'} · <span className={marginClass(margin)}>{Math.round(margin * 100)}% margin</span></small>}
          </label>
        </div>
        <ImagePicker value={f.image} onChange={(image) => setF({ ...f, image })} />
        <div className="field">
          <span>Card color</span>
          <div className="dot-picker">
            {COLORS.map(([c, hex]) => (
              <button type="button" key={c} style={{ background: hex }} aria-label={c} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })} />
            ))}
          </div>
        </div>
        <div className="grid-2">
          <label className="field"><span>Sort order</span><input type="number" value={f.sort} onChange={set('sort')} /><small>Lower numbers show first.</small></label>
          <div className="field" style={{ alignContent: 'center' }}>
            <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Show on menu</label>
            <label className="check"><input type="checkbox" checked={f.featured} onChange={set('featured')} /> Feature on homepage</label>
          </div>
        </div>
        <div className="row-between" style={{ marginTop: '.5rem' }}>
          {f.id ? <button type="button" className="btn ghost sm" onClick={remove}><Icon name="trash" size={16} /> Delete</button> : <span />}
          <button className="btn pink" disabled={busy}>{busy ? 'Saving…' : 'Save item'}</button>
        </div>
      </form>
    </Modal>
  );
}
