import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { money2 } from '../lib/format.js';
import { Icon, Logo, Photo, Stepper, Wave } from './bits.jsx';

const NAV = [
  ['/', 'Home'],
  ['/about', 'About'],
  ['/menu', 'Menu'],
  ['/how-it-works', 'How It Works'],
  ['/contact', 'Contact'],
];

export default function Layout() {
  const { config, count, setCartOpen, toast } = useStore();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { setMobileOpen(false); window.scrollTo(0, 0); }, [pathname]);

  const name = config?.business_name || "Bugzie's Bakes";

  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="wrap">
          <Link to="/" className="logo" aria-label={`${name} home`}><Logo name={name} /></Link>
          <nav className="nav" aria-label="Main">
            {NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
          </nav>
          <div className="header-actions">
            <button className="icon-btn" aria-label={`Open basket, ${count} items`} onClick={() => setCartOpen(true)}>
              <Icon name="cart" />
              {count > 0 && <span className="badge">{count}</span>}
            </button>
            <Link to="/menu" className="btn pink sm header-order"><Icon name="cart" size={18} /> Order Now</Link>
            <button className="icon-btn menu-toggle" aria-label="Menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((o) => !o)}>
              <Icon name={mobileOpen ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
      </header>
      {mobileOpen && (
        <nav className="mobile-nav" aria-label="Mobile">
          {NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
          <Link to="/menu" className="btn pink" style={{ marginTop: '.5rem' }}>Order Now</Link>
        </nav>
      )}

      <main id="main"><Outlet /></main>

      <Footer name={name} config={config} />
      <CartDrawer />
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function Footer({ name, config }) {
  return (
    <footer className="site-footer">
      <Wave color="var(--yellow-soft)" />
      <div className="inner">
        <div className="wrap">
          <Link to="/" className="logo" aria-label={`${name} home`}><Logo name={name} /></Link>
          <div className="footer-links">
            {NAV.slice(1).map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
          </div>
          <div className="socials">
            {config?.instagram_url && <a className="icon-btn" href={config.instagram_url} target="_blank" rel="noreferrer" aria-label="Instagram"><Icon name="instagram" /></a>}
            {config?.facebook_url && <a className="icon-btn" href={config.facebook_url} target="_blank" rel="noreferrer" aria-label="Facebook"><Icon name="facebook" /></a>}
            {config?.contact_email && <a className="icon-btn" href={`mailto:${config.contact_email}`} aria-label="Email"><Icon name="mail" /></a>}
          </div>
          <p className="fine">© {new Date().getFullYear()} {name} · Baked with love, in small batches.</p>
        </div>
      </div>
    </footer>
  );
}

export function LineThumb({ product }) {
  return (
    <div className={`line-thumb tint-${product.color}`}>
      <Photo src={product.image} alt="" placeholderClass={`tint-${product.color}`} />
    </div>
  );
}

function CartDrawer() {
  const { cartOpen, setCartOpen, lines, subtotal, setQty, config } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e) => e.key === 'Escape' && setCartOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [cartOpen, setCartOpen]);

  if (!cartOpen) return null;
  const min = config?.min_order_cents || 0;
  const short = Math.max(0, min - subtotal);

  return (
    <>
      <div className="scrim" onClick={() => setCartOpen(false)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Your basket">
        <div className="drawer-head">
          <h2>Your Basket</h2>
          <button className="icon-btn" aria-label="Close basket" onClick={() => setCartOpen(false)}><Icon name="close" /></button>
        </div>
        <div className="drawer-body">
          {lines.length === 0 ? (
            <div className="empty">
              <Icon name="bag" size={56} stroke={1.6} />
              <p><strong>Your basket is empty.</strong><br />Let's fix that!</p>
              <button className="btn yellow" onClick={() => { setCartOpen(false); navigate('/menu'); }}>Browse the menu</button>
            </div>
          ) : lines.map(({ product, qty }) => (
            <div className="line-item" key={product.id}>
              <LineThumb product={product} />
              <div>
                <h4>{product.name}</h4>
                <Stepper value={qty} min={0} onChange={(q) => setQty(product.id, q)} label={`${product.name} quantity`} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="price">{money2(qty * product.price_cents)}</div>
                <button className="link-btn" onClick={() => setQty(product.id, 0)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <div className="drawer-foot">
            <div className="row-between total-row"><span>Subtotal</span><span>{money2(subtotal)}</span></div>
            {short > 0 && <p className="muted" style={{ fontSize: '.9rem', margin: '.3rem 0 0' }}>Add {money2(short)} more to reach our {money2(min)} minimum.</p>}
            <button className="btn pink block lg" style={{ marginTop: '1rem' }} disabled={short > 0}
              onClick={() => { setCartOpen(false); navigate('/checkout'); }}>
              Schedule my order <Icon name="arrow" size={20} />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
