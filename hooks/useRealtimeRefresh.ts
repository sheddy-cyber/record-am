import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type RealtimeTableConfig = {
  table: string;
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  filter?: string;
};

interface UseRealtimeRefreshParams {
  channelName: string;
  tables: RealtimeTableConfig[];
  enabled?: boolean;
  debounceMs?: number;
  watch?: ReadonlyArray<unknown>;
  onRefresh: () => void;
}

export function useRealtimeRefresh({
  channelName,
  tables,
  enabled = true,
  debounceMs = 180,
  watch = [],
  onRefresh,
}: UseRealtimeRefreshParams) {
  const refreshRef = useRef(onRefresh);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tablesSignature = JSON.stringify(tables);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled || tables.length === 0) {
      return;
    }

    const scheduleRefresh = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        refreshRef.current();
      }, debounceMs);
    };

    let channel = supabase.channel(channelName);

    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        {
          event: table.event ?? '*',
          schema: 'public',
          table: table.table,
          ...(table.filter ? { filter: table.filter } : {}),
        },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [channelName, debounceMs, enabled, tablesSignature, ...watch]);
}
