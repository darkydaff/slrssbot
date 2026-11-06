import React from 'react';

/**
 * Native vector SVG of the bot logo (logo_minimal.jpg).
 * Pure vector path without background, supporting Telegram theme colors.
 * The paper plane uses 'currentColor' (adapting to text color / button color),
 * and the RSS waves use vibrant brand orange (#FF7A00).
 */
export function BrandLogo({ className = 'w-7 h-7' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 317 164"
      fill="none"
      className={className}
    >
      <path d="M 164.0 10.0 L 169.0 11.0 L 170.0 17.0 L 144.0 150.0 L 137.0 151.0 L 100.0 122.0 L 76.0 146.0 L 70.0 146.0 L 55.0 97.0 L 51.0 94.0 L 13.0 82.0 L 11.0 81.0 L 10.0 76.0 L 11.0 74.0 L 22.0 69.0 L 163.0 11.0 Z" fill="currentColor" />
      <path d="M 141.0 36.0 L 60.0 92.0 L 73.0 135.0 L 75.0 131.0 L 78.0 106.0 L 145.0 38.0 L 142.0 35.0 Z" fill="currentColor" />
      <path d="M 189.0 15.0 L 218.0 22.0 L 239.0 32.0 L 255.0 43.0 L 273.0 60.0 L 290.0 84.0 L 300.0 106.0 L 306.0 130.0 L 307.0 154.0 L 283.0 153.0 L 283.0 142.0 L 280.0 124.0 L 273.0 104.0 L 261.0 84.0 L 243.0 65.0 L 228.0 54.0 L 212.0 46.0 L 184.0 39.0 L 188.0 16.0 Z" fill="#FF7A00" />
      <path d="M 180.0 63.0 L 200.0 67.0 L 215.0 74.0 L 229.0 84.0 L 238.0 93.0 L 249.0 109.0 L 254.0 120.0 L 258.0 134.0 L 260.0 153.0 L 235.0 153.0 L 235.0 143.0 L 231.0 128.0 L 220.0 110.0 L 211.0 101.0 L 202.0 95.0 L 188.0 89.0 L 175.0 87.0 L 179.0 64.0 Z" fill="#FF7A00" />
      <path d="M 188.0 118.0 L 199.0 121.0 L 206.0 130.0 L 207.0 139.0 L 202.0 149.0 L 193.0 154.0 L 185.0 154.0 L 177.0 150.0 L 173.0 145.0 L 171.0 133.0 L 174.0 126.0 L 179.0 121.0 L 187.0 119.0 Z" fill="#FF7A00" />
    </svg>
  );
}
