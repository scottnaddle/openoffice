import { describe, expect, it } from 'vitest'
import { retryDelayMs, SyncScheduler } from '../src/scheduler'

describe('retryDelayMs', () => {
  it('backs off and then stays capped', () => {
    expect(retryDelayMs(0)).toBe(15_000)
    expect(retryDelayMs(1)).toBe(30_000)
    expect(retryDelayMs(2)).toBe(60_000)
    expect(retryDelayMs(20)).toBe(5 * 60_000)
  })
})

describe('SyncScheduler', () => {
  it('queues another pass after an offline result and runs it when kicked', async () => {
    const timers: Array<{ fn: () => void; ms: number }> = []
    let online = false
    const runs: string[] = []
    const seen: string[] = []
    const scheduler = new SyncScheduler({
      setTimer: (fn, ms) => {
        timers.push({ fn, ms })
        return timers.length
      },
      clearTimer: () => undefined,
      intervalMs: () => 60_000,
      enabled: () => true,
      run: async () => {
        runs.push(online ? 'up' : 'down')
        if (!online) return { phase: 'offline', conflictCount: 1, error: 'offline' }
        return { phase: 'synced', conflictCount: 0, error: null }
      },
      onStatus: (status) => seen.push(status.phase),
    })
    scheduler.start()
    expect(timers.at(-1)?.ms).toBe(500)
    timers.at(-1)?.fn()
    await Promise.resolve()
    await Promise.resolve()
    expect(runs).toEqual(['down'])
    expect(scheduler.status.phase).toBe('offline')
    expect(scheduler.status.pending).toBe(true)
    expect(timers.at(-1)?.ms).toBe(30_000)

    online = true
    scheduler.kick()
    expect(timers.at(-1)?.ms).toBe(0)
    timers.at(-1)?.fn()
    await Promise.resolve()
    await Promise.resolve()
    expect(runs).toEqual(['down', 'up'])
    expect(scheduler.status.phase).toBe('synced')
    expect(scheduler.status.pending).toBe(false)
    expect(seen).toContain('syncing')
  })
})
