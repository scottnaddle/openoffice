import { readFileSync, writeFileSync } from 'node:fs'
import { EMPTY_PROFILE } from './placeholders'
import type { TemplateProfile } from './placeholders'

export interface CompanyTemplateSettings {
  /** Absolute path of the company templates folder. Empty until the user picks one.
   *  A later NAS sync can point this at a folder inside the synced workspace. */
  folder: string
  profile: TemplateProfile
}

export const EMPTY_SETTINGS: CompanyTemplateSettings = {
  folder: '',
  profile: { ...EMPTY_PROFILE },
}

function clampProfile(value: unknown): TemplateProfile {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const field = (key: keyof TemplateProfile) =>
    typeof record[key] === 'string' ? record[key].trim().slice(0, 80) : ''
  return { name: field('name'), department: field('department'), company: field('company') }
}

export function parseSettings(json: string): CompanyTemplateSettings {
  try {
    const raw: unknown = JSON.parse(json)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return { ...EMPTY_SETTINGS, profile: { ...EMPTY_PROFILE } }
    const record = raw as Record<string, unknown>
    const folder = typeof record.folder === 'string' ? record.folder.trim() : ''
    return { folder, profile: clampProfile(record.profile) }
  } catch {
    return { ...EMPTY_SETTINGS, profile: { ...EMPTY_PROFILE } }
  }
}

export function serializeSettings(settings: CompanyTemplateSettings): string {
  return `${JSON.stringify(
    {
      folder: settings.folder,
      profile: {
        name: settings.profile.name.slice(0, 80),
        department: settings.profile.department.slice(0, 80),
        company: settings.profile.company.slice(0, 80),
      },
    },
    null,
    2,
  )}\n`
}

export function readSettingsFile(file: string): CompanyTemplateSettings {
  try {
    return parseSettings(readFileSync(file, 'utf8'))
  } catch {
    return { ...EMPTY_SETTINGS, profile: { ...EMPTY_PROFILE } }
  }
}

export function writeSettingsFile(file: string, settings: CompanyTemplateSettings): void {
  writeFileSync(file, serializeSettings(settings), 'utf8')
}
