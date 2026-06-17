import React from 'react';
import { DataTable, formatQty, MovementTable, Panel, productLabel } from './UniquemShared';

function StatGrid({ data }) {
  const stats = [
    ['Active products', data.dashboard.productCount],
    ['Active lots', data.dashboard.lotCount],
    ['Stock positions', data.dashboard.onHandPositions],
    ['Open blend jobs', data.dashboard.openBlendJobs],
  ];
  return (
    <div className="uniquem-stat-grid">
      {stats.map(([label, value]) => (
        <div className="uniquem-stat" key={label}>
          <span>{label}</span>
          <strong>{value || 0}</strong>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage({ data, lookups }) {
  return (
    <div className="uniquem-stack">
      <StatGrid data={data} />
      <div className="uniquem-grid two">
        <Panel title="Low Stock">
          <DataTable
            empty="No low stock products."
            columns={['Product', 'On hand', 'Reorder']}
            rows={(data.dashboard.lowStock || []).map((item) => [
              item.name,
              formatQty(item.quantity, item.unit),
              formatQty(item.reorderPoint, item.unit),
            ])}
          />
        </Panel>
        <Panel title="Expiring Lots">
          <DataTable
            empty="No lots expiring in the next 60 days."
            columns={['Lot', 'Product', 'Expiry']}
            rows={(data.dashboard.expiringLots || []).map((lot) => [
              lot.lotNumber,
              productLabel(lookups.products.get(lot.productId)),
              lot.expiryDate || '-',
            ])}
          />
        </Panel>
      </div>
      <Panel title="Recent Movements">
        <MovementTable movements={data.movements.slice(0, 8)} lookups={lookups} />
      </Panel>
    </div>
  );
}
