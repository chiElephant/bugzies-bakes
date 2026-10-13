import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const StoreCtx = createContext(null);
const CART_KEY = 'bb-cart-v1';

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}

export function StoreProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [products, setProducts] = useState(null);
  const [cart, setCart] = useState(loadCart); // { [productId]: qty }
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(() => {
    api('/config').then(setConfig).catch(() => setConfig({}));
    api('/products').then(setProducts).catch(() => setProducts([]));
  }, []);
  useEffect(refresh, [refresh]);

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* private mode */ }
  }, [cart]);

  // Drop cart lines for items that are no longer on the menu
  useEffect(() => {
    if (!products) return;
    const ids = new Set(products.map((p) => String(p.id)));
    setCart((c) => {
      const next = Object.fromEntries(Object.entries(c).filter(([id]) => ids.has(id)));
      return Object.keys(next).length === Object.keys(c).length ? c : next;
    });
  }, [products]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const setQty = useCallback((id, qty) => {
    setCart((c) => {
      const next = { ...c };
      const q = Math.max(0, Math.min(500, Math.floor(Number(qty) || 0)));
      if (q === 0) delete next[id]; else next[id] = q;
      return next;
    });
  }, []);
  const add = useCallback((product, qty = 1) => {
    setCart((c) => ({ ...c, [product.id]: Math.min(500, (c[product.id] || 0) + qty) }));
    setToast(`${qty} × ${product.name} added to your order 🍪`);
  }, []);
  const clear = useCallback(() => setCart({}), []);

  const lines = useMemo(() => {
    if (!products) return [];
    const byId = new Map(products.map((p) => [String(p.id), p]));
    return Object.entries(cart)
      .map(([id, qty]) => ({ product: byId.get(id), qty }))
      .filter((l) => l.product);
  }, [cart, products]);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.product.price_cents, 0);

  const value = {
    config, products, refresh, cart, lines, count, subtotal, setQty, add, clear,
    cartOpen, setCartOpen, toast, setToast,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
