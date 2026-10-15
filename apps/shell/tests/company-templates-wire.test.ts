import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// index.ts cannot be imported without Electron. This checks the thin wire only.

const src = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('company templates wire', () => {
  const index = src('../src/main/index.ts')
  const preload = src('../src/preload/index.ts')
  const home = src('../src/renderer/src/Home.tsx')
  const settings = src('../src/renderer/src/SettingsModal.tsx')
  const host = src('../../../fork/company-templates/src/electron/host.ts')

  it('starts after a headless export has returned and stops when the app quits', () => {
    const ready = index.indexOf('await runHeadlessExportEntry(headlessArgv)')
    const start = index.indexOf('startForkCompanyTemplates(')
    const quit = index.indexOf("app.on('will-quit'")
    const stop = index.indexOf('stopForkCompanyTemplates()')
    expect(ready).toBeGreaterThan(0)
    expect(start).toBeGreaterThan(ready)
    expect(quit).toBeGreaterThan(start)
    expect(stop).toBeGreaterThan(quit)
  })

  it('mounts the gallery and settings from the fork folder', () => {
    expect(home).toContain('CompanyTemplateGallery')
    expect(home).toContain('ieum-open-template-settings')
    expect(settings).toContain('CompanyTemplateSettings')
    expect(preload).toContain("exposeInMainWorld('ieumTemplates'")
    expect(preload).toContain('TEMPLATE_CHANNELS')
    expect(src('../../../fork/company-templates/src/channels.ts')).toContain('company-templates:')
    expect(index).toContain('fork/company-templates/src/electron/host')
    expect(src('../src/renderer/src/strings.ts')).not.toContain('company-templates')
    expect(src('../src/renderer/src/strings.ts')).not.toContain('양식에서 만들기')
  })

  it('does not read a subscription login file', () => {
    expect(host).not.toContain('auth.json')
    expect(host).not.toContain('.codex')
    expect(index).not.toContain('company-templates.json')
  })
})
