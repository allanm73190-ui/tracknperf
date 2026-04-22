import { useState, useEffect } from "react";
import styles from "./sync-detail-drawer.module.css";

export interface SyncOp {
  id: string;
  name: string;
  timestamp?: string;
  size?: string;
  status: "QUEUED" | "SYNCED" | "WAITING";
}

interface SyncDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  syncStatus: { pending: number; applied: number } | null;
  recentOps: SyncOp[];
  onForceSync: () => void;
  lastSyncTime?: string;
}

export function SyncDetailDrawer({
  isOpen,
  onClose,
  syncStatus,
  recentOps,
  onForceSync,
  lastSyncTime,
}: SyncDetailDrawerProps) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    if (!isOpen) return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SYNCED":
        return "OK";
      case "QUEUED":
        return "Q";
      case "WAITING":
        return "W";
      default:
        return ".";
    }
  };

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Sync Status"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Handle indicator */}
        <div className={styles.handle} />

        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Synchronisation</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            X
          </button>
        </div>

        {/* Offline alert */}
        {isOffline && (
          <div className={styles.offlineAlert}>
            <div className={styles.alertContent}>
              <span className={styles.alertIcon}>!</span>
              <span className={styles.alertText}>Hors ligne. Synchronisation en attente.</span>
            </div>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={onForceSync}
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Summary grid */}
        {syncStatus && (
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>En attente</span>
              <span className={styles.summaryValueTertiary}>
                {syncStatus.pending}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Synchronisé</span>
              <span className={styles.summaryValuePrimary}>
                {syncStatus.applied}
              </span>
            </div>
          </div>
        )}

        {/* Operations list */}
        <div className={styles.operationsList}>
          {recentOps.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>Aucune opération récente</p>
            </div>
          ) : (
            recentOps.map((op) => (
              <div key={op.id} className={styles.operationItem}>
                <div className={styles.opIcon}>
                  {getStatusIcon(op.status)}
                </div>
                <div className={styles.opContent}>
                  <div className={styles.opName}>{op.name}</div>
                  <div className={styles.opMeta}>
                    {op.timestamp && <span>{op.timestamp}</span>}
                    {op.size && <span>{op.size}</span>}
                  </div>
                </div>
                <div className={styles.opStatus}>
                  <span
                    className={`${styles.badge} ${styles[`badge${op.status}`]}`}
                  >
                    {op.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* CTA Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.forceSync}
            onClick={onForceSync}
            disabled={!isOffline && syncStatus?.pending === 0}
          >
            <span className={styles.syncIcon}>SYNC</span>
            Forcer la synchronisation
          </button>
          {lastSyncTime && (
            <div className={styles.lastSync}>
              Dernière synchro : {lastSyncTime}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
