'use client';

import { useState } from 'react';
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

export function EditorSidebar() {
  const activeTab = useProjectStore((s) => s.activeTab);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tabContent = (
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
          onClick={() => {
            setActiveTab(tab.id);
            setDrawerOpen(true);
          }}
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

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-72 border-l border-tuft-border bg-tuft-surface flex-col shrink-0">
        {tabBar}
        <div className="flex-1 overflow-y-auto p-4">
          {tabContent}
        </div>
      </aside>

      {/* ── Mobile bottom drawer ── */}
      <div className="md:hidden flex flex-col shrink-0">
        {/* Drawer backdrop */}
        {drawerOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        {/* Drawer panel */}
        <div
          className={`
            fixed bottom-0 left-0 right-0 z-40 bg-tuft-surface border-t border-tuft-border
            rounded-t-xl transition-transform duration-300 ease-out
            ${drawerOpen ? 'translate-y-0' : 'translate-y-[calc(100%-44px)]'}
          `}
          style={{ maxHeight: '75dvh' }}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center py-2 cursor-pointer"
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            <div className="w-10 h-1 rounded-full bg-tuft-border-active" />
          </div>

          {/* Tab bar */}
          {tabBar}

          {/* Content */}
          <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(75dvh - 88px)' }}>
            {tabContent}
          </div>
        </div>
      </div>
    </>
  );
}
