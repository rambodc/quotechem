import React from 'react';
import { FiClipboard, FiTruck } from 'react-icons/fi';

export default function FuturePage({ type }) {
  const title = type === 'shipping' ? 'Shipping' : 'Orders';
  const Icon = type === 'shipping' ? FiTruck : FiClipboard;
  return (
    <div className="uniquem-future">
      <Icon aria-hidden="true" />
      <div>
        <h2>{title} will connect to inventory next.</h2>
        <p>Inventory, lot traceability, blending, pricing, and file attachments are now the foundation. This page is reserved for reservations, shipments, customer orders, shipping photos, delivery files, and future invoice documents.</p>
      </div>
    </div>
  );
}
