import { useEffect, useMemo, useState } from 'react'
import type { CategoryId } from '../src/categories'
import { CATEGORY_IDS } from '../src/categories'
import { EMPTY_PROFILE, prefillPlaceholders } from '../src/placeholders'
import type { DocumentChoice, TemplateCard, TemplateSettingsView } from '../src/public'
import type { CompanyTemplatesApi } from '../src/public'
import './gallery.css'
import { templateText } from './strings'
import type { TemplateStringKey } from './strings'

declare global {
  interface Window {
    ieumTemplates?: CompanyTemplatesApi
  }
}

const CATEGORY_KEY: Record<CategoryId, TemplateStringKey> = {
  report: 'catReport',
  draft: 'catDraft',
  minutes: 'catMinutes',
  quote: 'catQuote',
  official: 'catOfficial',
  slides: 'catSlides',
  other: 'catOther',
}

function messageKey(error: string, saving: boolean): TemplateStringKey {
  if (error === 'folder-missing') return 'folderMissing'
  if (error === 'no-document') return 'noDocument'
  if (error === 'invalid') return 'nameRequired'
  return saving ? 'saveFailed' : 'createFailed'
}

export default function CompanyTemplateGallery({
  lang,
  targetDir,
}: {
  lang: string
  targetDir?: string
}) {
  const text = (key: TemplateStringKey) => templateText(lang, key)
  const [cards, setCards] = useState<TemplateCard[]>([])
  const [settings, setSettings] = useState<TemplateSettingsView | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [fill, setFill] = useState<{ card: TemplateCard; values: Record<string, string> } | null>(
    null,
  )
  const [saveOpen, setSaveOpen] = useState(false)
  const [documents, setDocuments] = useState<DocumentChoice[]>([])
  const [sourcePath, setSourcePath] = useState('')
  const [saveName, setSaveName] = useState('')
  const [saveCategory, setSaveCategory] = useState<CategoryId>('other')
  const [saveDescription, setSaveDescription] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.ieumTemplates
    if (!api) return
    let alive = true
    const load = () => {
      void api.list().then((next) => {
        if (alive) setCards(next)
      })
      void api.settings().then((next) => {
        if (alive) setSettings(next)
      })
    }
    load()
    const offChanged = api.onChanged(load)
    const offPrompt = api.onPromptSave(() => {
      if (alive) setSaveOpen(true)
    })
    return () => {
      alive = false
      offChanged()
      offPrompt()
    }
  }, [])

  useEffect(() => {
    if (!saveOpen) return
    const api = window.ieumTemplates
    if (!api) return
    let alive = true
    void api.documents().then((docs) => {
      if (!alive) return
      setDocuments(docs)
      const preferred = docs.find((doc) => doc.active) ?? docs[0]
      setSourcePath((current) => current || preferred?.path || '')
      setSaveName((current) => current || preferred?.title || '')
    })
    return () => {
      alive = false
    }
  }, [saveOpen])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return cards.filter((card) => {
      if (category !== 'all' && card.category !== category) return false
      if (!needle) return true
      return `${card.name} ${card.description} ${card.previewText}`.toLowerCase().includes(needle)
    })
  }, [cards, category, query])

  const chosen = documents.find((doc) => doc.path === sourcePath)

  async function createFrom(card: TemplateCard, values: Record<string, string>) {
    const api = window.ieumTemplates
    if (!api) return
    setBusy(true)
    setError('')
    const result = await api.create({ id: card.id, values, dir: targetDir })
    setBusy(false)
    if (!result.ok) {
      setError(text(messageKey(result.error, false)))
      return
    }
    setFill(null)
  }

  function openCard(card: TemplateCard) {
    setError('')
    setNotice('')
    if (card.placeholders.length === 0) {
      void createFrom(card, {})
      return
    }
    setFill({
      card,
      values: prefillPlaceholders(
        card.placeholders,
        settings?.profile ?? EMPTY_PROFILE,
        new Date(),
      ),
    })
  }

  async function submitSave() {
    const api = window.ieumTemplates
    if (!api) return
    if (!saveName.trim()) {
      setError(text('nameRequired'))
      return
    }
    setBusy(true)
    setError('')
    const result = await api.save({
      sourcePath,
      name: saveName.trim(),
      category: saveCategory,
      description: saveDescription.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      setError(text(messageKey(result.error, true)))
      return
    }
    setSaveOpen(false)
    setNotice(text('saved'))
  }

  return (
    <section className="quick-start tpl-section" aria-label={text('sectionTitle')}>
      <div className="section-head">
        <span className="section-label">{text('sectionTitle')}</span>
      </div>
      <div className="tpl-toolbar">
        <input
          className="tpl-search"
          value={query}
          placeholder={text('searchPlaceholder')}
          aria-label={text('searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="tpl-chips" role="tablist">
          <button
            type="button"
            className={`tpl-chip${category === 'all' ? ' active' : ''}`}
            onClick={() => setCategory('all')}
          >
            {text('categoryAll')}
          </button>
          {CATEGORY_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`tpl-chip${category === id ? ' active' : ''}`}
              onClick={() => setCategory(id)}
            >
              {text(CATEGORY_KEY[id])}
            </button>
          ))}
        </div>
        <div className="tpl-actions">
          <button
            type="button"
            className="tpl-link"
            onClick={() => {
              void window.ieumTemplates?.refresh().then(setCards)
            }}
          >
            {text('refresh')}
          </button>
          <button type="button" className="tpl-link" onClick={() => setSaveOpen(true)}>
            {text('saveCurrent')}
          </button>
        </div>
      </div>
      <p className="tpl-note">{text('folderHintHome')}</p>
      {settings?.folder && !settings.folderAvailable && (
        <p className="tpl-note">{text('folderOffline')}</p>
      )}
      {visible.length === 0 ? (
        <p className="tpl-empty">{text('empty')}</p>
      ) : (
        <div className="tpl-grid">
          {visible.map((card) => (
            <button key={card.id} type="button" className="tpl-card" onClick={() => openCard(card)}>
              {card.thumbnailDataUrl && (
                <img className="tpl-thumb" src={card.thumbnailDataUrl} alt="" />
              )}
              <span className="tpl-card-name">{card.name}</span>
              <span className="tpl-card-meta">
                <span className="tpl-badge">
                  {text(card.source === 'builtin' ? 'sourceBuiltin' : 'sourceCompany')}
                </span>
                <span>{text(CATEGORY_KEY[card.category])}</span>
                <span>.{card.extension}</span>
              </span>
              {card.description && <span className="tpl-card-desc">{card.description}</span>}
            </button>
          ))}
        </div>
      )}
      {notice && <p className="tpl-note">{notice}</p>}
      {error && !fill && !saveOpen && <p className="tpl-error">{error}</p>}

      {fill && (
        <div className="modal-overlay" role="presentation" onClick={() => setFill(null)}>
          <div
            className="modal"
            role="dialog"
            aria-label={text('fillTitle')}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{text('fillTitle')}</h3>
            <p>{text('fillHint')}</p>
            <div className="tpl-form">
              {fill.card.placeholders.map((name) => (
                <label key={name}>
                  {name}
                  <input
                    value={fill.values[name] ?? ''}
                    onChange={(event) =>
                      setFill({
                        card: fill.card,
                        values: { ...fill.values, [name]: event.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            {error && <p className="tpl-error">{error}</p>}
            <div className="modal-buttons">
              <button type="button" className="btn btn-secondary" onClick={() => setFill(null)}>
                {text('cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void createFrom(fill.card, fill.values)}
              >
                {text('create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveOpen && (
        <div className="modal-overlay" role="presentation" onClick={() => setSaveOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-label={text('saveTitle')}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{text('saveTitle')}</h3>
            {settings?.folder ? (
              settings.folderAvailable ? null : (
                <p>{text('folderOffline')}</p>
              )
            ) : (
              <p>
                {text('folderMissing')}{' '}
                <button
                  type="button"
                  className="tpl-link"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('ieum-open-template-settings'))
                    setSaveOpen(false)
                  }}
                >
                  {text('openSettings')}
                </button>
              </p>
            )}
            <div className="tpl-form">
              <label>
                {text('pickDocument')}
                <select value={sourcePath} onChange={(event) => setSourcePath(event.target.value)}>
                  {documents.length === 0 && <option value="">{text('noDocument')}</option>}
                  {documents.map((doc) => (
                    <option key={doc.path} value={doc.path}>
                      {doc.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {text('saveName')}
                <input value={saveName} onChange={(event) => setSaveName(event.target.value)} />
              </label>
              <label>
                {text('saveCategory')}
                <select
                  value={saveCategory}
                  onChange={(event) => setSaveCategory(event.target.value as CategoryId)}
                >
                  {CATEGORY_IDS.map((id) => (
                    <option key={id} value={id}>
                      {text(CATEGORY_KEY[id])}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {text('saveDescription')}
                <textarea
                  value={saveDescription}
                  onChange={(event) => setSaveDescription(event.target.value)}
                />
              </label>
            </div>
            {chosen?.dirty && <p className="tpl-note">{text('unsavedNote')}</p>}
            {error && <p className="tpl-error">{error}</p>}
            <div className="modal-buttons">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSaveOpen(false)}
              >
                {text('cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || documents.length === 0}
                onClick={() => void submitSave()}
              >
                {text('saveSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
