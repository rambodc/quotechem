import React from 'react';
import { FiGrid, FiList } from 'react-icons/fi';
import ItemsPage from './ItemsPage';
import './Uniquem.css';

const PAGE_META = {
  dashboard: { title: 'Dashboard', eyebrow: 'Uniquem', icon: FiGrid },
  items: { title: 'Items', eyebrow: 'QuickBooks Desktop', icon: FiList },
};

export default function Uniquem({ page = 'dashboard' }) {
  const normalized = PAGE_META[page] ? page : 'dashboard';
  const meta = PAGE_META[normalized];
  const Icon = meta.icon;
  return <section className="uniquem-page">
    <header className="uniquem-head"><div><p>{meta.eyebrow}</p><h1><Icon aria-hidden="true" />{meta.title}</h1></div></header>
    {normalized === 'items' ? <ItemsPage /> : <div className="uniquem-dashboard-blank" aria-label="Blank dashboard" />}
  </section>;
}
