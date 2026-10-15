import { watch, type FSWatcher } from 'node:fs'
import { folderFingerprint } from './scan'

export interface FolderWatch {
  stop(): void
}

/**
 * Refresh when the folder changes. A NAS or synced mount often does not emit
 * filesystem events, so a slow poll runs beside the watcher.
 */
export function startFolderWatch(
  root: string,
  onChange: () => void,
  opts?: { pollMs?: number; debounceMs?: number },
): FolderWatch {
  let stopped = false
  let last = folderFingerprint(root)
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounceMs = opts?.debounceMs ?? 200
  const kick = () => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (stopped) return
      const next = folderFingerprint(root)
      if (next !== last) {
        last = next
        onChange()
      }
    }, debounceMs)
  }
  let watcher: FSWatcher | null = null
  try {
    watcher = watch(root, { recursive: true }, kick)
    watcher.on('error', () => {
      /* a dropped NAS mount ends the watcher; the poll keeps looking */
    })
  } catch {
    watcher = null
  }
  const poll = setInterval(kick, opts?.pollMs ?? 15_000)
  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      clearInterval(poll)
      watcher?.close()
    },
  }
}
