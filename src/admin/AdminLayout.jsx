import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Icon, Logo } from '../components/bits.jsx';
import './admin.css';

const NAV = [
  ['/admin', 'Overview', 'chart'],
  ['/admin/orders', 'Orders', 'receipt'],
  ['/admin/products', 'Menu & Pricing', 'cookie'],
  ['/admin/coupons', 'Coupons', 'tag'],
  ['/admin/expenses', 'Costs & Expenses', 'bag'],
  ['/admin/messages', 'Messages', 'mail'],
  ['/admin/settings', 'Settings', 'settings'],
];

export default function AdminLayout() {
  const [authed, setAuthed] = useState(null);
  const [counts, setCounts] = useState({});
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    api('/admin/me').then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  const refreshCounts = useCallback(() => {
    api('/admin/counts').then(setCounts).catch(() => {});
  }, []);
  useEffect(() => { if (authed) refreshCounts(); }, [authed, pathname, refreshCounts]);

  // First visit: adopt the baker's own time zone so "today" and lead times match their clock.
  useEffect(() => {
    if (!authed) return;
    api('/admin/settings').then((s) => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!s.time_zone && tz) api('/admin/settings', { method: 'PUT', body: { time_zone: tz } });
    }).catch(() => {});
  }, [authed]);
  useEffect(() => setOpen(false), [pathname]);

  if (authed === null) return null;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const logout = async () => { await api('/admin/logout', { method: 'POST' }); setAuthed(false); };
  const badge = { '/admin/orders': counts.new_orders, '/admin/messages': counts.unread_messages };

  return (
    <div className="admin">
      <div className="admin-mobile-bar">
        <Link to="/admin" className="logo"><Logo /></Link>
        <button className="icon-btn" aria-label="Dashboard menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`admin-side ${open ? 'open' : ''}`}>
        <Link to="/admin" className="logo"><Logo /></Link>
        <nav className="admin-nav">
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/admin'}>
              <Icon name={icon} size={20} /> {label}
              {badge[to] > 0 && <span className="count">{badge[to]}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <a className="side-btn" href="/" target="_blank" rel="noreferrer"><Icon name="external" size={20} /> View shop</a>
        <button className="side-btn" onClick={logout}><Icon name="logout" size={20} /> Log out</button>
      </aside>
      <main className="admin-main">
        <Outlet context={{ refreshCounts }} />
      </main>
    </div>
  );
}

function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('/admin/login', { method: 'POST', body: { password: pw } }); onDone(); }
    catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <div className="logo" style={{ display: 'block' }}><Logo size="lg" /></div>
        <h1 style={{ fontSize: '1.6rem', margin: '1rem 0 .3rem' }}>Baker's Dashboard</h1>
        <p className="muted">Sign in to manage orders, menu and sales.</p>
        {err && <div className="error-box">{err}</div>}
        <label className="field" style={{ textAlign: 'left' }}>
          <span>Password</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
        </label>
        <button className="btn pink block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p style={{ marginTop: '1rem', marginBottom: 0 }}><Link to="/" className="muted">← Back to shop</Link></p>
      </form>
    </div>
  );
}

export function AdminTop({ title, children }) {
  return (
    <div className="admin-top">
      <h1>{title}</h1>
      {children && <div className="toolbar" style={{ margin: 0 }}>{children}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row-between" style={{ alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.6rem' }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
