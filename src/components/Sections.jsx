import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { money } from '../lib/format.js';
import { Blob, HeartDoodle, Icon, Photo, Stepper, Wave } from './bits.jsx';

const BTN_FOR = { yellow: 'yellow', pink: 'pink', mint: 'mint', lavender: 'lavender', blue: 'blue' };

export function ProductCard({ product, showDescription = true, quick = false }) {
  const { add, cart } = useStore();
  const [qty, setQty] = useState(1);
  const inCart = cart[product.id] || 0;
  return (
    <article className="card product-card">
      <div className={`product-art tint-${product.color}`}>
        <Photo src={product.image} alt={product.name} placeholderClass={`tint-${product.color}`} />
        {inCart > 0 && <span className="tag">{inCart} in basket</span>}
      </div>
      <div className="product-body">
        <h3>{product.name}</h3>
        <div className="price">{money(product.price_cents)} <span className="muted" style={{ fontWeight: 600, fontSize: '.85rem' }}>{product.unit_label !== 'each' ? `/ ${product.unit_label}` : ''}</span></div>
        {showDescription && product.description && <p className="desc">{product.description}</p>}
        <div className="product-actions">
          {!quick && <Stepper value={qty} min={1} onChange={setQty} label={`${product.name} quantity`} />}
          <button className={`btn sm ${BTN_FOR[product.color] || 'yellow'}`} onClick={() => { add(product, quick ? 1 : qty); setQty(1); }}>
            Add to Order
          </button>
        </div>
      </div>
    </article>
  );
}

export function SectionHead({ title, sub, as: H = 'h2' }) {
  return (
    <div className="section-head">
      <H className="squiggle">{title}</H>
      {sub && <p>{sub}</p>}
    </div>
  );
}

export function Features() {
  const items = [
    ['leaf', 'var(--mint-bright)', 'Quality Ingredients', 'Real butter, real chocolate, no shortcuts.'],
    ['heart', 'var(--pink-bright)', 'Baked with Love', 'Small batch, big care.'],
    ['home', 'var(--brown)', 'Custom Orders', 'Birthdays, events & more.'],
    ['smile', 'var(--yellow)', 'Always Fresh', 'Baked for your pickup day — never sitting on a shelf.'],
  ];
  return (
    <div className="band band-pink">
      <div className="wrap features">
        {items.map(([icon, color, title, text]) => (
          <div className="feature" key={title}>
            <Icon name={icon} size={44} stroke={1.8} style={{ color }} />
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PopularTreats() {
  const { products } = useStore();
  if (!products) return <div style={{ minHeight: 360 }} />;
  const featured = products.filter((p) => p.featured);
  const list = (featured.length ? featured : products).slice(0, 4);
  if (!list.length) return null;
  return (
    <section className="section">
      <div className="wrap">
        <SectionHead title="Popular Treats" sub="A few favorites from the oven." />
        <div className="grid-products">
          {list.map((p) => <ProductCard key={p.id} product={p} showDescription={false} quick />)}
        </div>
        <div className="center" style={{ marginTop: '2rem' }}>
          <Link to="/menu" className="btn ghost">See the full menu <Icon name="arrow" size={18} /></Link>
        </div>
      </div>
    </section>
  );
}

export function AboutSection({ full = false }) {
  const { config } = useStore();
  const name = config?.business_name || "Bugzie's Bakes";
  return (
    <section className="band">
      <Wave color="var(--blue-soft)" variant={1} />
      <div className="band-blue" style={{ padding: '2.5rem 0 3.5rem' }}>
        <div className="wrap about">
          <div className="about-art">
            <Blob color="var(--mint-soft)" variant={2} style={{ inset: '-10%', width: '120%', height: '120%' }} />
            <Photo src={config?.about_image || '/images/about.jpg'} alt={`Baking at ${name}`} className="photo" />
            <HeartDoodle size={44} style={{ top: '-4%', right: '4%' }} />
          </div>
          <div>
            <h2>About {name}</h2>
            <p>{config?.about_text}</p>
            {!full && <Link to="/about" className="btn yellow">Learn More</Link>}
            {full && <Link to="/menu" className="btn pink">See what's baking <Icon name="arrow" size={18} /></Link>}
          </div>
        </div>
      </div>
      <Wave color="var(--blue-soft)" flip />
    </section>
  );
}

export function HowItWorks() {
  const { config } = useStore();
  const lead = config?.lead_days ?? 2;
  const steps = [
    ['var(--yellow-soft)', 'Pick your treats', 'Browse the menu and add as many goodies as you like.'],
    ['var(--pink-soft)', 'Choose a day', `Pick a pickup${config?.delivery_enabled ? ' or delivery' : ''} date and time window — at least ${lead} day${lead === 1 ? '' : 's'} out so everything is baked fresh.`],
    ['var(--mint-soft)', 'We bake', 'Your order is mixed, baked and packed in a small batch, just for you.'],
    ['var(--lavender-soft)', 'Enjoy!', config?.payment_note || 'Pay at pickup and enjoy every crumb.'],
  ];
  return (
    <section className="section">
      <div className="wrap">
        <SectionHead title="How It Works" sub="Fresh-baked treats in four easy steps." />
        <div className="steps" style={{ marginTop: '3rem' }}>
          {steps.map(([bg, title, text], i) => (
            <div className="step" key={title}>
              <div className="num" style={{ background: bg }}>{i + 1}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactCta() {
  return (
    <section className="section" style={{ paddingTop: '1rem' }}>
      <div className="wrap">
        <div className="cta-blob">
          <h2 className="squiggle" style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)' }}>Let's Bake Something Good Together</h2>
          <p>Have a question, want a custom order, or just want to say hi? I'd love to hear from you!</p>
          <Link to="/contact" className="btn brown"><Icon name="mail" size={18} /> Contact Me</Link>
        </div>
      </div>
    </section>
  );
}
