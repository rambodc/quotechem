import React from 'react';
import './PalletTexturePreview.css';

export default function PalletTexturePreview({ imageUrl, color }) {
  if (!imageUrl) return null;
  return <div className="pallet-texture-box-preview" aria-label="Rotating preview with the side texture on four faces">
    <div className="pallet-texture-box" style={{ '--pallet-side-image': `url("${imageUrl}")`, '--pallet-blank-color': color }}>
      <span className="front" data-face="front" /><span className="back" data-face="back" />
      <span className="left" data-face="left" /><span className="right" data-face="right" />
      <span className="top" data-face="top" /><span className="bottom" data-face="bottom" />
    </div>
    <small>Four textured sides · product-colour top and bottom</small>
  </div>;
}
