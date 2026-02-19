'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';
import { EditorCanvas } from '@/components/editor/editor-canvas';
import { EditorSidebar } from '@/components/editor/editor-sidebar';
import { EditorTopbar } from '@/components/editor/editor-topbar';

export default function EditorPage() {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const hasHydrated = useProjectStore((s) => s._hasHydrated);

  // Redirect to home if no project loaded (only after hydration)
  useEffect(() => {
    if (hasHydrated && !project) {
      router.replace('/');
    }
  }, [project, hasHydrated, router]);

  // Show nothing while hydrating or if no project
  if (!hasHydrated || !project) return null;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Top bar */}
      <EditorTopbar />

      {/* Desktop: side-by-side | Mobile: stacked */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative bg-tuft-bg min-h-0">
          <EditorCanvas />
        </div>

        {/* Desktop: right sidebar | Mobile: bottom drawer */}
        <EditorSidebar />
      </div>
    </div>
  );
}
