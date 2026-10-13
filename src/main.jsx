import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './lib/store.jsx';
import Layout from './components/Layout.jsx';
import { About, Contact, Home, How, Menu, NotFound } from './pages/Public.jsx';
import Checkout, { Thanks } from './pages/Checkout.jsx';
import './styles.css';

// The dashboard is split into its own bundle so shoppers never download it.
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'));
const Overview = lazy(() => import('./admin/Overview.jsx'));
const Orders = lazy(() => import('./admin/Orders.jsx'));
const Products = lazy(() => import('./admin/Products.jsx'));
const Coupons = lazy(() => import('./admin/Coupons.jsx'));
const Expenses = lazy(() => import('./admin/Expenses.jsx'));
const Settings = lazy(() => import('./admin/Settings.jsx'));
const Messages = lazy(() => import('./admin/Settings.jsx').then((m) => ({ default: m.Messages })));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Overview />} />
            <Route path="orders" element={<Orders />} />
            <Route path="products" element={<Products />} />
            <Route path="coupons" element={<Coupons />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="messages" element={<Messages />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route element={<StoreProvider><Layout /></StoreProvider>}>
            <Route index element={<Home />} />
            <Route path="menu" element={<Menu />} />
            <Route path="about" element={<About />} />
            <Route path="how-it-works" element={<How />} />
            <Route path="contact" element={<Contact />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="thanks" element={<Thanks />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
