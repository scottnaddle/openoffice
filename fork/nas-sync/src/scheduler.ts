import type { SyncStatus } from './types'

export function retryDelayMs(attempt: number): number {
  const step = Math.min(Math.max(attempt, 0), 8)
  return Math.min(15_000 * 2 ** step, 5 * 60_000)
}

export interface SchedulerRun {
  phase: 'synced' | 'offline' | 'error' | 'disabled'
  conflictCount: number
  error: string | null
}

/**
 * One sync at a time. An offline pass stays pending and retries with backoff.
 * `kick` (manual sync, or the machine coming online) runs again immediately.
 */
export class SyncScheduler {
  private timer: unknown = null
  private running = false
  private queued = false
  private attempts = 0
  private stopped = true
  status: SyncStatus = {
    phase: 'idle',
    conflictCount: 0,
    lastSyncAt: null,
    lastError: null,
    pending: false,
  }

  constructor(
    private readonly deps: {
      setTimer: (fn: () => void, ms: number) => unknown
      clearTimer: (timer: unknown) => void
      intervalMs: () => number
      enabled: () => boolean
      run: () => Promise<SchedulerRun>
      onStatus: (status: SyncStatus) => void
    },
  ) {}

  start(): void {
    this.stopped = false
    if (!this.deps.enabled()) {
      this.publish({ ...this.status, phase: 'disabled', pending: false })
      return
    }
    this.arm(500)
  }

  stop(): void {
    this.stopped = true
    this.clear()
  }

  /** Network restored or the user pressed Sync now. */
  kick(): void {
    if (this.stopped || !this.deps.enabled()) return
    this.attempts = 0
    this.arm(0)
  }

  noteOffline(): void {
    if (this.running || this.stopped || !this.deps.enabled()) return
    this.publish({ ...this.status, phase: 'offline', pending: true, lastError: 'offline' })
  }

  private arm(ms: number): void {
    this.clear()
    this.timer = this.deps.setTimer(() => {
      this.timer = null
      void this.tick()
    }, ms)
  }

  private clear(): void {
    if (this.timer !== null) this.deps.clearTimer(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    if (this.stopped) return
    if (!this.deps.enabled()) {
      this.publish({ ...this.status, phase: 'disabled', pending: false })
      return
    }
    if (this.running) {
      this.queued = true
      return
    }
    this.running = true
    this.publish({ ...this.status, phase: 'syncing', pending: false })
    try {
      const result = await this.deps.run()
      if (this.stopped) return
      if (result.phase === 'offline' || result.phase === 'error') {
        this.attempts += 1
        this.publish({
          phase: result.phase,
          conflictCount: result.conflictCount,
          lastSyncAt: this.status.lastSyncAt,
          lastError: result.error,
          pending: true,
        })
        this.arm(retryDelayMs(this.attempts))
      } else {
        this.attempts = 0
        this.publish({
          phase: 'synced',
          conflictCount: result.conflictCount,
          lastSyncAt: new Date().toISOString(),
          lastError: null,
          pending: false,
        })
        this.arm(Math.max(this.deps.intervalMs(), 1_000))
      }
    } catch {
      if (!this.stopped) {
        this.attempts += 1
        this.publish({
          ...this.status,
          phase: 'error',
          lastError: 'io',
          pending: true,
        })
        this.arm(retryDelayMs(this.attempts))
      }
    } finally {
      this.running = false
      if (this.queued && !this.stopped) {
        this.queued = false
        void this.tick()
      }
    }
  }

  private publish(status: SyncStatus): void {
    this.status = status
    this.deps.onStatus(status)
  }
}
