import { useEffect, useState } from 'react'
import type { TemplateProfile } from '../src/placeholders'
import { EMPTY_PROFILE } from '../src/placeholders'
import type { TemplateSettingsView } from '../src/public'
import './gallery.css'
import { templateText } from './strings'
import type { TemplateStringKey } from './strings'

export default function CompanyTemplateSettings({ lang }: { lang: string }) {
  const text = (key: TemplateStringKey) => templateText(lang, key)
  const [view, setView] = useState<TemplateSettingsView | null>(null)
  const [profile, setProfile] = useState<TemplateProfile>(EMPTY_PROFILE)

  useEffect(() => {
    const api = window.ieumTemplates
    if (!api) return
    let alive = true
    void api.settings().then((next) => {
      if (!alive) return
      setView(next)
      setProfile(next.profile)
    })
    return () => {
      alive = false
    }
  }, [])

  async function save(next: { folder?: string; profile?: Partial<TemplateProfile> }) {
    const api = window.ieumTemplates
    if (!api) return
    const saved = await api.saveSettings(next)
    setView(saved)
    setProfile(saved.profile)
  }

  if (!window.ieumTemplates) return null

  return (
    <div className="tpl-settings">
      <h3 className="set-pane-title">{text('settingsTitle')}</h3>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <div className="set-field-label">{text('settingsFolder')}</div>
            <div className="set-field-desc">{text('settingsFolderHint')}</div>
            <div className="set-field-desc">{view?.folder || '—'}</div>
            {view?.folder && !view.folderAvailable && (
              <div className="set-field-desc">{text('folderOffline')}</div>
            )}
          </div>
        </div>
        <div className="set-field-stack">
          <button
            type="button"
            className="set-btn"
            onClick={() => {
              void window.ieumTemplates?.pickFolder().then((folder) => {
                if (folder) void save({ folder })
              })
            }}
          >
            {text('settingsBrowse')}
          </button>
          <button
            type="button"
            className="set-btn"
            disabled={!view?.folder}
            onClick={() => void save({ folder: '' })}
          >
            {text('settingsClear')}
          </button>
        </div>
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <div className="set-field-label">{text('settingsProfile')}</div>
            <div className="set-field-desc">{text('settingsProfileHint')}</div>
          </div>
        </div>
      </div>
      <label className="set-field">
        <span className="set-field-label">{text('settingsName')}</span>
        <input
          className="set-input"
          value={profile.name}
          onChange={(event) => setProfile({ ...profile, name: event.target.value })}
          onBlur={() => void save({ profile })}
        />
      </label>
      <label className="set-field">
        <span className="set-field-label">{text('settingsDepartment')}</span>
        <input
          className="set-input"
          value={profile.department}
          onChange={(event) => setProfile({ ...profile, department: event.target.value })}
          onBlur={() => void save({ profile })}
        />
      </label>
      <label className="set-field">
        <span className="set-field-label">{text('settingsCompany')}</span>
        <input
          className="set-input"
          value={profile.company}
          onChange={(event) => setProfile({ ...profile, company: event.target.value })}
          onBlur={() => void save({ profile })}
        />
      </label>
    </div>
  )
}
