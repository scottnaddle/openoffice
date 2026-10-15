import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
const host = readFileSync(join(root, '../../fork/nas-sync/src/electron/host.ts'), 'utf8')
const settings = readFileSync(join(root, 'src/renderer/src/SettingsModal.tsx'), 'utf8')
const home = readFileSync(join(root, 'src/renderer/src/Home.tsx'), 'utf8')

describe('fork NAS sync wiring', () => {
  it('starts only on the windowed path and stops when the app quits', () => {
    const ready = main.slice(main.indexOf('app.whenReady().then(async () => {'))
    const headlessReturn = ready.indexOf('await runHeadlessExportEntry(headlessArgv)')
    const start = ready.indexOf('startForkNasSync(')
    expect(headlessReturn).toBeGreaterThanOrEqual(0)
    expect(start).toBeGreaterThan(headlessReturn)
    expect(main).toContain('stopForkNasSync()')
    expect(main.indexOf("app.on('will-quit'")).toBeLessThan(main.lastIndexOf('stopForkNasSync()'))
  })

  it('keeps the password in safeStorage and out of the settings snapshot', () => {
    expect(host).toContain('safeStorage.encryptString')
    expect(host).toContain('safeStorage.isEncryptionAvailable')
    expect(host).not.toContain('ai-settings.json')
    expect(host).not.toContain('auth.json')
    expect(settings).toContain('<NasSyncSettings lang={lang} />')
    expect(home).toContain('<NasSyncStatus lang={lang} />')
  })
})
