import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fromCents, money2, prettyDate, toCents, ymd } from '../lib/format.js';
import { Icon } from '../components/bits.jsx';
import { AdminTop } from './AdminLayout.jsx';

const CATEGORIES = ['Ingredients', 'Packaging', 'Equipment', 'Delivery & Gas', 'Marketing', 'Fees & Licenses', 'Other'];
const blank = () => ({ spent_on: ymd(new Date()), category: 'Ingredients', description: '', amount: '' });

export default function Expenses() {
  const [month, setMonth] = useState(() => ymd(new Date()).slice(0, 7));
  const [items, setItems] = useState(null);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');

  const range = month === 'all' ? '' : (() => {
    const [y, m] = month.split('-').map(Number);
    return `?from=${month}-01&to=${ymd(new Date(y, m, 0))}`;
  })();
  const load = () => api(`/admin/expenses${range}`).then(setItems);
  useEffect(() => { load(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setErr('');
    const amount_cents = toCents(f.amount);
    if (!(amount_cents > 0)) return setErr('Enter an amount.');
    try {
      await api(f.id ? `/admin/expenses/${f.id}` : '/admin/expenses', { method: f.id ? 'PUT' : 'POST', body: { ...f, amount_cents } });
      setF(blank()); load();
    } catch (e2) { setErr(e2.message); }
  };
  const remove = async (x) => {
    if (!confirm('Delete this expense?')) return;
    await api(`/admin/expenses/${x.id}`, { method: 'DELETE' }); load();
  };

  const total = (items || []).reduce((a, x) => a + x.amount_cents, 0);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return ymd(d).slice(0, 7); });

  return (
    <>
      <AdminTop title="Costs & Expenses">
        <select className="input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          {months.map((m) => <option key={m} value={m}>{new Date(`${m}-01T12:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</option>)}
          <option value="all">All time</option>
        </select>
      </AdminTop>
      <p className="muted" style={{ marginTop: '-.6rem' }}>
        Log bulk purchases and running costs here (flour runs, boxes, a new mixer, market fees). Per-item ingredient costs are tracked automatically from each item's cost on the menu.
      </p>
      <div className="a-grid" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
        <form className="a-card" onSubmit={save} style={{ alignSelf: 'start' }}>
          <div className="card-head"><h2>{f.id ? 'Edit expense' : 'Add expense'}</h2></div>
          {err && <div className="error-box">{err}</div>}
          <div className="grid-2">
            <label className="field"><span>Date</span><input type="date" required value={f.spent_on} onChange={set('spent_on')} /></label>
            <label className="field"><span>Amount ($)</span><input required inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="42.50" /></label>
          </div>
          <label className="field"><span>Category</span>
            <select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="field"><span>Note</span><input value={f.description} onChange={set('description')} placeholder="Costco run — butter, flour, chips" /></label>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn pink sm">{f.id ? 'Save' : <><Icon name="plus" size={16} /> Add</>}</button>
            {f.id && <button type="button" className="btn ghost sm" onClick={() => setF(blank())}>Cancel</button>}
          </div>
        </form>

        <section className="a-card">
          <div className="card-head"><h2>Spent: {money2(total)}</h2></div>
          {!items ? <p className="muted">Loading…</p> : items.length === 0 ? <p className="muted">Nothing logged for this period.</p> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Date</th><th>Category</th><th>Note</th><th className="num">Amount</th><th /></tr></thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={x.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{prettyDate(x.spent_on)}</td>
                      <td>{x.category}</td>
                      <td>{x.description}</td>
                      <td className="num">{money2(x.amount_cents)}</td>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        <button className="icon-btn" aria-label="Edit" onClick={() => setF({ ...x, amount: fromCents(x.amount_cents) })}><Icon name="edit" size={18} /></button>
                        <button className="icon-btn" aria-label="Delete" onClick={() => remove(x)}><Icon name="trash" size={18} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
