import React from 'react';
import { FiGrid, FiList, FiPackage } from 'react-icons/fi';
import ItemsPage from './ItemsPage';
import InventoryPage from './InventoryPage';
import './Uniquem.css';

const PAGE_META = {
  dashboard: { title: 'Dashboard', eyebrow: 'Uniquem', icon: FiGrid },
  items: { title: 'Items', eyebrow: 'QuickBooks Desktop', icon: FiList },
  inventory: { title: '3D Inventory', eyebrow: 'QuickBooks Snapshot', icon: FiPackage },
};

export default function Uniquem({ page = 'dashboard' }) {
  const normalized = PAGE_META[page] ? page : 'dashboard';
  const meta = PAGE_META[normalized];
  const Icon = meta.icon;
  return <section className="uniquem-page">
    <header className="uniquem-head"><div><p>{meta.eyebrow}</p><h1><Icon aria-hidden="true" />{meta.title}</h1></div></header>
    {normalized === 'items' ? <ItemsPage /> : normalized === 'inventory' ? <InventoryPage /> : <div className="uniquem-dashboard-blank" aria-label="Blank dashboard" />}
  </section>;
}
