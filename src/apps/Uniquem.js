import React from 'react';
import Warehouse3D from './Warehouse3D';
import './Uniquem.css';

const PAGE_TITLES = {
  inventory: 'Inventory',
  'price-list': 'Price List',
  shipping: 'Shipping',
  orders: 'Orders',
};

function UniquemBlankPage({ page }) {
  const title = PAGE_TITLES[page] || 'Uniquem';

  return (
    <section className="uniquem-page">
      <header className="uniquem-page-head">
        <p>Uniquem</p>
        <h1>{title}</h1>
      </header>
    </section>
  );
}

export default function Uniquem({ page }) {
  if (page === '3d') return <Warehouse3D />;
  return <UniquemBlankPage page={page} />;
}
