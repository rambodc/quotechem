import React from 'react';
import { MovementTable, Panel } from './UniquemShared';

export default function MovementsPage({ data, lookups }) {
  return (
    <Panel title="Immutable Stock Ledger">
      <MovementTable movements={data.movements} lookups={lookups} />
    </Panel>
  );
}
