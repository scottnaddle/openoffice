import { useEffect, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { NasSyncSnapshot } from '../src/public'
import type { SyncStatus } from '../src/types'
import { nasCopy, nasFill } from './strings'
import './nas-sync.css'

declare global {
  interface Window {
    ieumNasSync?: import('../src/public').NasSyncApi
  }
}

function labelFor(
  status: SyncStatus,
  text: ReturnType<typeof nasCopy>,
): { kind: string; label: string } {
  if (status.phase === 'syncing') return { kind: 'syncing', label: text.syncing }
  if (status.phase === 'offline') {
    return {
      kind: 'offline',
      label:
        status.conflictCount > 0
          ? nasFill(text.offlineConflicts, status.conflictCount)
          : text.offline,
    }
  }
  if (status.phase === 'error') return { kind: 'error', label: text.error }
  if (status.conflictCount > 0)
    return { kind: 'conflict', label: nasFill(text.conflicts, status.conflictCount) }
  if (status.phase === 'synced') return { kind: 'synced', label: text.synced }
  return { kind: 'idle', label: text.idle }
}

/** Home sidebar chip. Hidden until NAS sync is turned on. */
export function NasSyncStatus({ lang }: { lang: Lang }) {
  const text = nasCopy(lang)
  const [snapshot, setSnapshot] = useState<NasSyncSnapshot | null>(null)

  useEffect(() => {
    const api = window.ieumNasSync
    if (!api) return
    let alive = true
    void api.get().then((next) => {
      if (alive) setSnapshot(next)
    })
    const off = api.onStatus((next) => {
      if (alive) setSnapshot(next)
    })
    const notify = () => api.notifyNetwork(navigator.onLine)
    window.addEventListener('online', notify)
    window.addEventListener('offline', notify)
    notify()
    return () => {
      alive = false
      off()
      window.removeEventListener('online', notify)
      window.removeEventListener('offline', notify)
    }
  }, [])

  if (!snapshot || (!snapshot.settings.enabled && !snapshot.account)) return null
  const view = labelFor(snapshot.status, text)
  return (
    <div className="nas-sync-status" role="status" aria-live="polite">
      <span className={`nas-sync-dot ${snapshot.settings.enabled ? view.kind : 'idle'}`} />
      <span className="nas-sync-account">
        {snapshot.settings.enabled ? <span>{view.label}</span> : null}
        {snapshot.account ? (
          <span>
            {snapshot.account.displayName} · {snapshot.account.email}
          </span>
        ) : null}
      </span>
    </div>
  )
}
