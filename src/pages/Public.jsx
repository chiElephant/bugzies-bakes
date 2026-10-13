import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { Blob, Bursts, HeartDoodle, Icon, Photo } from '../components/bits.jsx';
import {
  AboutSection, ContactCta, Features, HowItWorks, PopularTreats, ProductCard, SectionHead,
} from '../components/Sections.jsx';

export function Home() {
  const { config } = useStore();
  const name = config?.business_name || "Bugzie's Bakes";
  const [first, ...rest] = name.split(' ');
  return (
    <>
      <section className="hero">
        <Blob color="var(--yellow-soft)" style={{ width: 300, height: 300, left: -150, top: -120 }} />
        <Blob color="var(--pink-soft)" variant={1} style={{ width: 260, height: 260, left: -130, bottom: -40 }} />
        <div className="wrap">
          <div className="hero-copy">
            <h1 className="hero-title">
              <Bursts style={{ position: 'absolute', left: '-14%', top: '30%' }} />
              {first}<br />{rest.join(' ')}
              <Bursts side="right" style={{ position: 'absolute', right: '-14%', top: '52%' }} />
            </h1>
            <p className="tagline">{config?.tagline || 'Homemade treats. Made with heart.'}</p>
            <Icon name="heart" size={22} style={{ color: 'var(--pink)', fill: 'var(--pink)', margin: '0 auto' }} />
            <p className="lede">Freshly baked goodies for every occasion — because life's better with something sweet.</p>
            <Link to="/menu" className="btn pink lg">Order Now <Icon name="cart" size={20} /></Link>
          </div>
          <div className="hero-art">
            <Blob color="var(--mint-soft)" style={{ inset: '-6% -8% -4% 0', width: '110%', height: '110%' }} />
            <Photo src={config?.hero_image} alt={`Fresh-baked treats from ${name}`} className="photo" />
            <HeartDoodle size={56} style={{ top: '6%', right: '18%' }} />
          </div>
        </div>
      </section>
      <Features />
      <PopularTreats />
      <AboutSection />
      <ContactCta />
    </>
  );
}

export function PageHead({ title, sub, tint = 'var(--pink-soft)' }) {
  return (
    <header className="page-head">
      <Blob color={tint} style={{ width: 420, height: 300, left: -160, top: -140 }} />
      <Blob color={tint} variant={2} style={{ width: 380, height: 280, right: -160, top: -100, opacity: .7 }} />
      <div className="wrap" style={{ position: 'relative' }}>
        <h1 className="squiggle">{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </header>
  );
}

export function Menu() {
  const { products, count, setCartOpen } = useStore();
  const [cat, setCat] = useState('All');
  const cats = useMemo(() => ['All', ...new Set((products || []).map((p) => p.category))], [products]);
  const shown = (products || []).filter((p) => cat === 'All' || p.category === cat);

  return (
    <>
      <PageHead title="Menu" sub="Sweet treats. Simple ingredients." />
      <section className="wrap" style={{ paddingBottom: '2rem' }}>
        {cats.length > 2 && (
          <div className="center" style={{ marginBottom: '1.8rem' }}>
            <div className="seg" role="group" aria-label="Filter by category">
              {cats.map((c) => <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
            </div>
          </div>
        )}
        {!products ? <p className="center muted">Warming up the oven…</p>
          : shown.length === 0 ? <p className="center muted">Nothing on the menu right now — check back soon!</p>
            : <div className="grid-products list">{shown.map((p) => <ProductCard key={p.id} product={p} />)}</div>}
        {count > 0 && (
          <div className="center" style={{ marginTop: '2.4rem' }}>
            <button className="btn pink lg" onClick={() => setCartOpen(true)}>
              Review basket ({count}) <Icon name="arrow" size={20} />
            </button>
          </div>
        )}
      </section>
    </>
  );
}

export function About() {
  return (
    <>
      <PageHead title="About" sub="Small batches. Big heart." tint="var(--mint-soft)" />
      <AboutSection full />
      <Features />
      <ContactCta />
    </>
  );
}

export function How() {
  return (
    <>
      <PageHead title="How It Works" sub="From our oven to your table." tint="var(--yellow-soft)" />
      <HowItWorks />
      <PopularTreats />
    </>
  );
}

export function Contact() {
  const { config } = useStore();
  const [form, setForm] = useState({ name: '', email: '', body: '' });
  const [state, setState] = useState({ busy: false, error: '', sent: false });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', sent: false });
    try {
      await api('/messages', { method: 'POST', body: form });
      setState({ busy: false, error: '', sent: true });
      setForm({ name: '', email: '', body: '' });
    } catch (err) {
      setState({ busy: false, error: err.message, sent: false });
    }
  };

  return (
    <>
      <PageHead title="Contact" sub="Questions, custom orders, or just saying hi." />
      <section className="wrap" style={{ maxWidth: 680 }}>
        <form className="panel" onSubmit={submit}>
          <h2 style={{ fontSize: '1.7rem' }}>Let's Bake Something Good Together</h2>
          <p className="muted">Planning a party or need a big batch? Tell me what you're dreaming of and I'll get back to you soon.</p>
          {state.sent && <div className="ok-box">Thanks! Your message is on its way. 💌</div>}
          {state.error && <div className="error-box">{state.error}</div>}
          <div className="grid-2">
            <label className="field"><span>Your name</span><input required value={form.name} onChange={set('name')} autoComplete="name" /></label>
            <label className="field"><span>Email</span><input required type="email" value={form.email} onChange={set('email')} autoComplete="email" /></label>
          </div>
          <label className="field"><span>Message</span><textarea required rows={5} value={form.body} onChange={set('body')} /></label>
          <button className="btn brown" disabled={state.busy}><Icon name="mail" size={18} /> {state.busy ? 'Sending…' : 'Send message'}</button>
          {config?.contact_email && (
            <p className="muted" style={{ marginTop: '1rem', marginBottom: 0, fontSize: '.92rem' }}>
              Or email me directly at <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a>.
            </p>
          )}
        </form>
      </section>
    </>
  );
}

export function NotFound() {
  return (
    <section className="wrap center" style={{ padding: '5rem 20px' }}>
      <h1 className="squiggle">Oh crumbs!</h1>
      <p className="muted">We couldn't find that page.</p>
      <Link to="/" className="btn pink">Back home</Link>
    </section>
  );
}
