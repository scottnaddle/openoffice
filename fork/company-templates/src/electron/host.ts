// Electron host for the company template library. The shell starts and stops
// this module. The renderer never receives a raw template path.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { ipcMain } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { categoryFolder, isCategoryId } from '../categories'
import { filledTemplate, listTemplateCards } from '../catalog'
import { TEMPLATE_CHANNELS } from '../channels'
import { serializeSidecar } from '../metadata'
import { safeTemplateBase, uniquePath } from '../names'
import { isPathInside } from '../paths'
import { sanitizeValues } from '../placeholders'
import type { DocumentChoice, TemplateResult, TemplateSettingsView } from '../public'
import { readSettingsFile, writeSettingsFile } from '../settings'
import type { CompanyTemplateSettings } from '../settings'
import { startFolderWatch } from '../watch'
import type { FolderWatch } from '../watch'
import { templateText } from '../../ui/strings'

export interface CompanyTemplateHostDeps {
  userData: string
  documentsDir(): string
  dirAllowed(dir: string): boolean
  openPath(filePath: string): void
  listDocuments(): Promise<DocumentChoice[]>
  pickDirectory(): Promise<string | null>
  notifyHome(channel: string): void
  openHome(): void
}

let deps: CompanyTemplateHostDeps | null = null
let registered = false
let folderWatch: FolderWatch | null = null

function settingsFile(): string {
  if (!deps) throw new Error('company templates host is not started')
  return join(deps.userData, 'company-templates.json')
}

function readCurrent(): CompanyTemplateSettings {
  return readSettingsFile(settingsFile())
}

function directoryIfPresent(folder: string): string | null {
  if (!folder) return null
  try {
    return statSync(folder).isDirectory() ? folder : null
  } catch {
    return null
  }
}

function companyRoot(): string | null {
  return directoryIfPresent(readCurrent().folder)
}

function settingsView(): TemplateSettingsView {
  const settings = readCurrent()
  return {
    folder: settings.folder,
    folderAvailable: directoryIfPresent(settings.folder) !== null,
    profile: settings.profile,
  }
}

function restartWatch(): void {
  folderWatch?.stop()
  folderWatch = null
  const root = companyRoot()
  if (!root || !deps) return
  const notify = deps
  folderWatch = startFolderWatch(root, () => {
    notify.notifyHome(TEMPLATE_CHANNELS.changed)
  })
}

function samePath(a: string, b: string): boolean {
  return resolve(a) === resolve(b)
}

export function startForkCompanyTemplates(next: CompanyTemplateHostDeps): void {
  deps = next
  if (!registered) {
    registered = true
    ipcMain.handle(TEMPLATE_CHANNELS.list, () => listTemplateCards(companyRoot()))
    ipcMain.handle(TEMPLATE_CHANNELS.refresh, () => listTemplateCards(companyRoot()))
    ipcMain.handle(TEMPLATE_CHANNELS.settings, () => settingsView())
    ipcMain.handle(TEMPLATE_CHANNELS.saveSettings, (_event, raw: unknown) => {
      const current = readCurrent()
      const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      const folder = typeof input.folder === 'string' ? input.folder.trim() : current.folder
      const profileInput =
        input.profile && typeof input.profile === 'object'
          ? (input.profile as Record<string, unknown>)
          : null
      const profile = profileInput
        ? {
            name: typeof profileInput.name === 'string' ? profileInput.name : current.profile.name,
            department:
              typeof profileInput.department === 'string'
                ? profileInput.department
                : current.profile.department,
            company:
              typeof profileInput.company === 'string'
                ? profileInput.company
                : current.profile.company,
          }
        : current.profile
      writeSettingsFile(settingsFile(), { folder, profile })
      restartWatch()
      deps?.notifyHome(TEMPLATE_CHANNELS.changed)
      return settingsView()
    })
    ipcMain.handle(TEMPLATE_CHANNELS.pickFolder, () => deps?.pickDirectory() ?? null)
    ipcMain.handle(TEMPLATE_CHANNELS.documents, () => deps?.listDocuments() ?? [])
    ipcMain.handle(
      TEMPLATE_CHANNELS.create,
      async (_event, raw: unknown): Promise<TemplateResult> => {
        const host = deps
        if (!host) return { ok: false, error: 'unavailable' }
        const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
        const id = typeof input.id === 'string' ? input.id : ''
        const values = sanitizeValues(input.values)
        const requested = typeof input.dir === 'string' ? input.dir : ''
        const dir = requested && host.dirAllowed(requested) ? requested : host.documentsDir()
        if (!dir) return { ok: false, error: 'write-failed' }
        const filled = filledTemplate(id, companyRoot(), values)
        if (!filled) return { ok: false, error: 'not-found' }
        try {
          mkdirSync(dir, { recursive: true })
          if (!host.dirAllowed(dir)) return { ok: false, error: 'write-failed' }
          const fileName = `${safeTemplateBase(filled.name)}.${filled.extension || 'docx'}`
          const target = uniquePath(dir, fileName)
          if (!isPathInside(dir, target) || !host.dirAllowed(dirname(target))) {
            return { ok: false, error: 'write-failed' }
          }
          writeFileSync(target, filled.bytes)
          host.openPath(target)
          return { ok: true, path: target }
        } catch {
          return { ok: false, error: 'write-failed' }
        }
      },
    )
    ipcMain.handle(
      TEMPLATE_CHANNELS.save,
      async (_event, raw: unknown): Promise<TemplateResult> => {
        const host = deps
        if (!host) return { ok: false, error: 'unavailable' }
        const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        const description =
          typeof input.description === 'string' ? input.description.trim().slice(0, 400) : ''
        const sourcePath = typeof input.sourcePath === 'string' ? input.sourcePath : ''
        if (!name || !isCategoryId(input.category)) return { ok: false, error: 'invalid' }
        const root = companyRoot()
        if (!root) return { ok: false, error: 'folder-missing' }
        const documents = await host.listDocuments()
        const chosen = documents.find((doc) => doc.path && samePath(doc.path, sourcePath))
        if (!chosen || !existsSync(sourcePath)) return { ok: false, error: 'no-document' }
        try {
          const folder = join(root, categoryFolder(input.category))
          mkdirSync(folder, { recursive: true })
          const ext = extname(sourcePath).toLowerCase() || '.docx'
          const target = uniquePath(folder, `${safeTemplateBase(name)}${ext}`)
          const sidecar = `${target}.json`
          if (!isPathInside(root, target) || !isPathInside(root, sidecar)) {
            return { ok: false, error: 'write-failed' }
          }
          copyFileSync(sourcePath, target)
          writeFileSync(
            sidecar,
            serializeSidecar({
              name: safeTemplateBase(name),
              category: input.category,
              description,
            }),
            'utf8',
          )
          host.notifyHome(TEMPLATE_CHANNELS.changed)
          return { ok: true, path: target }
        } catch {
          return { ok: false, error: 'write-failed' }
        }
      },
    )
  }
  restartWatch()
}

export function stopForkCompanyTemplates(): void {
  folderWatch?.stop()
  folderWatch = null
}

export function companyTemplateFileMenuItem(label: string): MenuItemConstructorOptions {
  return {
    id: 'company-templates-save',
    label,
    click: () => {
      deps?.openHome()
      deps?.notifyHome(TEMPLATE_CHANNELS.promptSave)
    },
  }
}

export function templateSaveLabel(lang: string): string {
  return templateText(lang, 'menuSaveAsTemplate')
}
