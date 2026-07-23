import React from 'react';
import WarehouseViewer from './WarehouseViewer';
import ThreeDCreator from './ThreeDCreator';
import './ThreeD.css';

export default function ThreeD({ page }) {
  return page === 'creator' ? <ThreeDCreator /> : <WarehouseViewer />;
}
