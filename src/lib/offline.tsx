// @ts-nocheck
import { useEffect, useState } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Offline support:
 * - Persists the React Query cache to localStorage so previously-viewed data
 *   renders instantly on reload, even with no connectivity.
 * - Shows an unobtrusive status bar while offline and while re-syncing.
 * - Resumes paused mutations and refetches stale queries once back online.
 */
export function OfflineSupport() {
  const queryClient = useQueryClient();
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Cache persistence (browser only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let unsubscribe: (() => void) | undefined;
    try {
      const persister = createSyncStoragePersister({
        storage: window.localStorage,
        key: "gf-query-cache",
        throttleTime: 1000,
      });
      const [unsub] = persistQueryClient({
        queryClient,
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && !!query.queryKey?.length,
        },
      });
      unsubscribe = unsub;
    } catch {
      /* storage unavailable (private mode / quota) — degrade gracefully */
    }
    return () => unsubscribe?.();
  }, [queryClient]);

  // Connectivity transitions.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOffline(!navigator.onLine);

    const goOffline = () => {
      onlineManager.setOnline(false);
      setIsOffline(true);
    };

    const goOnline = async () => {
      onlineManager.setOnline(true);
      setIsOffline(false);
      setIsSyncing(true);
      try {
        await queryClient.resumePausedMutations();
        await queryClient.invalidateQueries({ refetchType: "active" });
      } finally {
        setIsSyncing(false);
      }
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [queryClient]);

  if (!isOffline && !isSyncing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold",
        "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
        isOffline ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
      )}
    >
      {isOffline ? (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">You're offline — showing saved data</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="truncate">Back online — syncing your data</span>
        </>
      )}
    </div>
  );
}
