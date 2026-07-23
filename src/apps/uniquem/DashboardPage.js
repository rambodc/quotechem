import React from 'react';
import { DataTable, formatQty, Panel, productLabel } from './UniquemShared';

export default function DashboardPage({ data, lookups }) {
  const stats = [
    ['Products', data.dashboard.productCount], ['Warehouses', data.dashboard.warehouseCount],
    ['Available packages', formatQty(data.dashboard.totalPackages, '')], ['Draft shipments', data.dashboard.draftShipments],
    ['Draft production runs', data.dashboard.draftProductionRuns],
  ];
  return <div className="uniquem-stack">
    <div className="uniquem-stat-grid">{stats.map(([label, value]) => <div className="uniquem-stat" key={label}><span>{label}</span><strong>{value || 0}</strong></div>)}</div>
    <Panel title="Recent inventory activity">
      <DataTable empty="No inventory activity yet." columns={['Date', 'Activity', 'Product', 'Packages', 'Warehouse / location', 'Reason']} rows={data.ledger.slice(0, 12).map((item) => [
        item.createdAt?.slice(0, 10) || '-', item.type, productLabel(lookups.products.get(item.productId)), formatQty(item.packageQuantity, 'packages'),
        `${lookups.warehouses.get(item.warehouseId)?.name || item.warehouseId || '-'} / ${item.location || 'Main'}`, item.reason || '-',
      ])} />
    </Panel>
  </div>;
}
