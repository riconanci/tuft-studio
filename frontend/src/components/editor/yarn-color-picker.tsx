'use client';

import { useState, useRef, useEffect } from 'react';

// Must match backend/app/processing/yarn_colors.py
const YARN_COLORS: { name: string; hex: string }[] = [
  // Whites & Creams
  { name: 'Snow White', hex: '#ffffff' },
  { name: 'Ivory', hex: '#fff8e7' },
  { name: 'Cream', hex: '#f5edd7' },
  { name: 'Eggshell', hex: '#f0ead6' },
  // Grays
  { name: 'Silver', hex: '#c0c0c0' },
  { name: 'Ash Gray', hex: '#a0a0a0' },
  { name: 'Slate', hex: '#808080' },
  { name: 'Charcoal', hex: '#404040' },
  { name: 'Graphite', hex: '#282828' },
  // Blacks
  { name: 'Black', hex: '#0f0f0f' },
  { name: 'Jet Black', hex: '#050505' },
  // Browns & Tans
  { name: 'Sand', hex: '#d2be9b' },
  { name: 'Tan', hex: '#bea57a' },
  { name: 'Camel', hex: '#af8c5a' },
  { name: 'Mocha', hex: '#825f41' },
  { name: 'Chocolate', hex: '#5a3c23' },
  { name: 'Espresso', hex: '#372314' },
  { name: 'Walnut', hex: '#462d19' },
  // Reds
  { name: 'Blush', hex: '#e6b4af' },
  { name: 'Coral', hex: '#e67864' },
  { name: 'Tomato Red', hex: '#d23c2d' },
  { name: 'Crimson', hex: '#af1e1e' },
  { name: 'Burgundy', hex: '#731923' },
  { name: 'Wine', hex: '#5a141e' },
  // Oranges
  { name: 'Peach', hex: '#f5c39b' },
  { name: 'Tangerine', hex: '#eb8c3c' },
  { name: 'Burnt Orange', hex: '#c86423' },
  { name: 'Rust', hex: '#aa4b1e' },
  { name: 'Terracotta', hex: '#be6441' },
  // Yellows
  { name: 'Butter', hex: '#faebaa' },
  { name: 'Lemon', hex: '#f5dc50' },
  { name: 'Mustard', hex: '#d2af37' },
  { name: 'Gold', hex: '#c39b2d' },
  { name: 'Amber', hex: '#b48223' },
  // Greens
  { name: 'Mint', hex: '#afe1b9' },
  { name: 'Sage', hex: '#96af8c' },
  { name: 'Olive', hex: '#6e783c' },
  { name: 'Forest', hex: '#2d502d' },
  { name: 'Hunter Green', hex: '#1e4123' },
  { name: 'Emerald', hex: '#287846' },
  { name: 'Teal', hex: '#328282' },
  // Blues
  { name: 'Baby Blue', hex: '#aacdeb' },
  { name: 'Sky Blue', hex: '#78afdc' },
  { name: 'Denim', hex: '#5078aa' },
  { name: 'Royal Blue', hex: '#2d469b' },
  { name: 'Navy', hex: '#192350' },
  { name: 'Midnight', hex: '#141937' },
  { name: 'Powder Blue', hex: '#a0bed2' },
  // Purples
  { name: 'Lavender', hex: '#b9aad2' },
  { name: 'Lilac', hex: '#aa8cbe' },
  { name: 'Plum', hex: '#6e3264' },
  { name: 'Eggplant', hex: '#411e41' },
  { name: 'Mauve', hex: '#af829b' },
  // Pinks
  { name: 'Pale Pink', hex: '#f5d2d2' },
  { name: 'Rose', hex: '#dc8c96' },
  { name: 'Hot Pink', hex: '#dc4678' },
  { name: 'Magenta', hex: '#b42d6e' },
  { name: 'Dusty Rose', hex: '#c39191' },
];

interface YarnColorPickerProps {
  currentHex: string;
  onSelect: (hex: string, name: string) => void;
  onClose: () => void;
}

export function YarnColorPicker({ currentHex, onSelect, onClose }: YarnColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = search
    ? YARN_COLORS.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : YARN_COLORS;

  return (
    <div
      ref={ref}
      className="absolute z-50 right-0 top-full mt-1 w-64 max-h-72 bg-tuft-surface border border-tuft-border rounded-lg shadow-xl overflow-hidden"
    >
      {/* Search */}
      <div className="p-2 border-b border-tuft-border">
        <input
          type="text"
          placeholder="Search colors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="tuft-input w-full text-xs py-1.5"
        />
      </div>

      {/* Color grid */}
      <div className="p-2 overflow-y-auto max-h-56 grid grid-cols-6 gap-1.5">
        {filtered.map((color) => {
          const isActive =
            currentHex.toLowerCase() === color.hex.toLowerCase();

          return (
            <button
              key={color.hex}
              onClick={() => onSelect(color.hex, color.name)}
              title={color.name}
              className={`
                w-full aspect-square rounded transition-all
                ${
                  isActive
                    ? 'ring-2 ring-tuft-accent ring-offset-1 ring-offset-tuft-surface scale-110'
                    : 'hover:scale-110 hover:ring-1 hover:ring-tuft-border-active'
                }
              `}
              style={{ backgroundColor: color.hex }}
            />
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-2xs text-tuft-text-dim py-4 font-mono">
          No matching colors
        </p>
      )}
    </div>
  );
}
