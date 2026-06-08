import React from 'react';

import { useTabStore } from '@/store/tabStore';

export function SwipeableTabScreen({ children, name }: { children: React.ReactNode, name: string }) {
  // Only re-render this screen if it's the one being activated or deactivated.
  // This prevents all 5 screens from re-rendering simultaneously on every tab switch.
  const isActive = useTabStore((s) => s.activeTab === name);
  
  return <>{children}</>;
}
