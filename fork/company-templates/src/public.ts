import type { CategoryId } from './categories'
import type { TemplateProfile } from './placeholders'

export interface TemplateCard {
  id: string
  source: 'builtin' | 'company'
  name: string
  category: CategoryId
  description: string
  extension: string
  placeholders: string[]
  thumbnailDataUrl?: string
  previewText: string
}

export interface TemplateSettingsView {
  folder: string
  folderAvailable: boolean
  profile: TemplateProfile
}

export interface CreateTemplateInput {
  id: string
  values: Record<string, string>
  dir?: string
}

export interface SaveTemplateInput {
  sourcePath: string
  name: string
  category: CategoryId
  description: string
}

export interface DocumentChoice {
  path: string
  title: string
  active: boolean
  dirty: boolean
}

export type TemplateResult = { ok: true; path: string } | { ok: false; error: string }

export interface CompanyTemplatesApi {
  list(): Promise<TemplateCard[]>
  settings(): Promise<TemplateSettingsView>
  saveSettings(input: {
    folder?: string
    profile?: Partial<TemplateProfile>
  }): Promise<TemplateSettingsView>
  pickFolder(): Promise<string | null>
  create(input: CreateTemplateInput): Promise<TemplateResult>
  save(input: SaveTemplateInput): Promise<TemplateResult>
  documents(): Promise<DocumentChoice[]>
  refresh(): Promise<TemplateCard[]>
  onChanged(listener: () => void): () => void
  onPromptSave(listener: () => void): () => void
}
