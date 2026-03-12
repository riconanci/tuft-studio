'use client';

import { useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/stores/project-store';
import type { EditorTab } from '@/types';
import { SettingsPanel } from './panels/settings-panel';
import { PalettePanel } from './panels/palette-panel';
import { ExportPanel } from './panels/export-panel';

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'palette', label: 'Palette' },
  { id: 'export', label: 'Export' },
];

// Snap points as percentage of viewport height
const SNAP_CLOSED = 0; // just tab bar visible
const SNAP_HALF = 40;
const SNAP_FULL = 75;

export function EditorSidebar() {
  const activeTab = useProjectStore((s) => s.activeTab);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);

  // Mobile drawer height as vh percentage
  const [drawerHeight, setDrawerHeight] = useState(SNAP_CLOSED);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);

  const isOpen = drawerHeight > 5;

  // Drag handling
  const handleDragStart = useCallback((clientY: number) => {
    isDraggingRef.current = true;
    dragStartYRef.current = clientY;
    dragStartHeightRef.current = drawerHeight;
  }, [drawerHeight]);

  const handleDragMove = useCallback((clientY: number) => {
    if (!isDraggingRef.current) return;
    const deltaY = dragStartYRef.current - clientY;
    const deltaPct = (deltaY / window.innerHeight) * 100;
    const newHeight = Math.max(0, Math.min(SNAP_FULL, dragStartHeightRef.current + deltaPct));
    setDrawerHeight(newHeight);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Snap to nearest point
    setDrawerHeight((h) => {
      if (h < 15) return SNAP_CLOSED;
      if (h < 55) return SNAP_HALF;
      return SNAP_FULL;
    });
  }, []);

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  }, [handleDragStart]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  }, [handleDragMove]);

  const onTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Mouse handlers (for desktop testing)
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);

    const onMove = (ev: MouseEvent) => handleDragMove(ev.clientY);
    const onUp = () => {
      handleDragEnd();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [handleDragStart, handleDragMove, handleDragEnd]);

  // Tap handle toggles between closed and half
  const handleTap = useCallback(() => {
    if (!isDraggingRef.current) {
      setDrawerHeight((h) => (h > 5 ? SNAP_CLOSED : SNAP_HALF));
    }
  }, []);

  // Tab click opens drawer if closed
  const handleTabClick = (tabId: EditorTab) => {
    setActiveTab(tabId);
    if (drawerHeight < 15) {
      setDrawerHeight(SNAP_HALF);
    }
  };

  const tabContent = (
    <>
      {activeTab === 'settings' && <SettingsPanel onApply={() => setDrawerHeight(SNAP_CLOSED)} />}
      {activeTab === 'palette' && <PalettePanel />}
      {activeTab === 'export' && <ExportPanel />}
    </>
  );

  // Desktop tab content (no drawer to close)
  const desktopTabContent = (
    <>
      {activeTab === 'settings' && <SettingsPanel />}
      {activeTab === 'palette' && <PalettePanel />}
      {activeTab === 'export' && <ExportPanel />}
    </>
  );

  const tabBar = (
    <div className="flex border-b border-tuft-border shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => handleTabClick(tab.id)}
          className={`
            flex-1 py-2.5 text-xs font-mono tracking-wide transition-colors
            ${
              activeTab === tab.id
                ? 'text-tuft-accent border-b border-tuft-accent'
                : 'text-tuft-text-dim hover:text-tuft-text-muted'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  // Calculate content height (drawer height minus handle + tabs)
  const headerHeight = 52; // handle (16px padding) + tab bar (~36px)

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-72 border-l border-tuft-border bg-tuft-surface flex-col shrink-0">
        <div className="flex border-b border-tuft-border shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 py-2.5 text-xs font-mono tracking-wide transition-colors
                ${
                  activeTab === tab.id
                    ? 'text-tuft-accent border-b border-tuft-accent'
                    : 'text-tuft-text-dim hover:text-tuft-text-muted'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {desktopTabContent}
        </div>
      </aside>

      {/* ── Mobile bottom drawer ── */}
      <div className="md:hidden flex flex-col shrink-0">
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30"
            onClick={() => setDrawerHeight(SNAP_CLOSED)}
          />
        )}

        {/* Drawer */}
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-tuft-surface border-t border-tuft-border rounded-t-xl"
          style={{
            height: `calc(${drawerHeight}vh + ${headerHeight}px)`,
            maxHeight: '85dvh',
            transition: isDraggingRef.current ? 'none' : 'height 0.25s ease-out',
          }}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center py-2 cursor-grab active:cursor-grabbing touch-none select-none"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onMouseDown={onMouseDown}
            onClick={handleTap}
          >
            <div className="w-10 h-1 rounded-full bg-tuft-border-active" />
          </div>

          {/* Tab bar */}
          {tabBar}

          {/* Content */}
          <div
            className="overflow-y-auto p-4"
            style={{
              height: `${drawerHeight}vh`,
              maxHeight: `calc(85dvh - ${headerHeight}px)`,
            }}
          >
            {tabContent}
          </div>
        </div>
      </div>
    </>
  );
}
