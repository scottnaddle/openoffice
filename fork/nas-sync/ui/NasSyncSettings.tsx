import { useEffect, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { NasSyncSnapshot } from '../src/public'
import type { NasSettings, SyncStatus } from '../src/types'
import { nasCopy } from './strings'
import './nas-sync.css'

function messageFor(code: string | undefined, text: ReturnType<typeof nasCopy>): string {
  if (!code) return ''
  if (code === 'keychain-unavailable') return text.keychainUnavailable
  if (code === 'bad-url') return text.badUrl
  if (code === 'bad-smb-url') return text.badSmb
  if (code === 'paths-overlap') return text.overlap
  return text.error
}

/** Settings → General. The password field is not written into the settings file. */
export function NasSyncSettings({ lang }: { lang: Lang }) {
  const text = nasCopy(lang)
  const [draft, setDraft] = useState<NasSettings | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [password, setPassword] = useState('')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.ieumNasSync
    if (!api) return
    let alive = true
    void api.get().then((next: NasSyncSnapshot) => {
      if (!alive) return
      setDraft(next.settings)
      setHasPassword(next.hasPassword)
      setStatus(next.status)
    })
    const off = api.onStatus((next) => {
      if (!alive) return
      setStatus(next.status)
      setHasPassword(next.hasPassword)
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  if (!draft) return null

  const patch = (partial: Partial<NasSettings>) => setDraft({ ...draft, ...partial })

  const save = async (andSync: boolean) => {
    const api = window.ieumNasSync
    if (!api) return
    setBusy(true)
    setNote('')
    setNoteError(false)
    try {
      const result = await api.save({ ...draft, password: password || undefined })
      setHasPassword(result.snapshot.hasPassword)
      setStatus(result.snapshot.status)
      if (!result.ok) {
        setNote(messageFor(result.error, text))
        setNoteError(true)
        return
      }
      setDraft(result.snapshot.settings)
      setPassword('')
      setNote(text.saved)
      if (andSync) {
        const next = await api.syncNow()
        setStatus(next.status)
      }
    } catch {
      setNote(text.error)
      setNoteError(true)
    } finally {
      setBusy(false)
    }
  }

  const pickWorkspace = async () => {
    const api = window.ieumNasSync
    if (!api) return
    const picked = await api.pickWorkspace()
    if (picked) patch({ workspacePath: picked })
  }

  return (
    <div className="nas-sync-block">
      <div className="set-field set-field-top">
        <div className="set-field-text">
          <div className="set-field-stack">
            <div className="set-field-label">{text.title}</div>
            <div className="set-field-desc">{text.intro}</div>
          </div>
        </div>
        <button
          type="button"
          className="set-switch"
          role="switch"
          aria-checked={draft.enabled}
          aria-label={text.enable}
          onClick={() => patch({ enabled: !draft.enabled })}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <label className="set-field-label" htmlFor="nas-backend">
            {text.backend}
          </label>
        </div>
        <select
          id="nas-backend"
          className="set-input"
          value={draft.backend}
          onChange={(event) =>
            patch({ backend: event.target.value === 'webdav' ? 'webdav' : 'smb' })
          }
        >
          <option value="smb">{text.backendSmb}</option>
          <option value="webdav">{text.backendWebdav}</option>
        </select>
      </div>
      {draft.backend === 'smb' ? (
        <>
          <div className="set-field">
            <div className="set-field-text">
              <label className="set-field-label" htmlFor="nas-smb-path">
                {text.smbPath}
              </label>
            </div>
            <input
              id="nas-smb-path"
              className="set-input"
              value={draft.smbPath}
              placeholder="/Volumes/Share/Office"
              onChange={(event) => patch({ smbPath: event.target.value })}
            />
          </div>
          <div className="set-field set-field-top">
            <div className="set-field-text">
              <div className="set-field-stack">
                <label className="set-field-label" htmlFor="nas-smb-url">
                  {text.smbUrl}
                </label>
                <div className="set-field-desc">{text.smbUrlHint}</div>
              </div>
            </div>
            <input
              id="nas-smb-url"
              className="set-input"
              value={draft.smbUrl}
              placeholder="smb://nas.example.com/Share"
              onChange={(event) => patch({ smbUrl: event.target.value })}
            />
          </div>
        </>
      ) : (
        <>
          <div className="set-field set-field-top">
            <div className="set-field-text">
              <div className="set-field-stack">
                <label className="set-field-label" htmlFor="nas-webdav-url">
                  {text.webdavUrl}
                </label>
                <div className="set-field-desc">{text.webdavHint}</div>
              </div>
            </div>
            <input
              id="nas-webdav-url"
              className="set-input"
              value={draft.webdavUrl}
              placeholder="https://nas.example.com:5006/office"
              onChange={(event) => patch({ webdavUrl: event.target.value })}
            />
          </div>
          <div className="set-field set-field-top">
            <div className="set-field-text">
              <div className="set-field-stack">
                <div className="set-field-label">{text.insecure}</div>
                <div className="set-field-desc">{text.insecureHint}</div>
              </div>
            </div>
            <button
              type="button"
              className="set-switch"
              role="switch"
              aria-checked={draft.allowInsecureTls}
              aria-label={text.insecure}
              onClick={() => patch({ allowInsecureTls: !draft.allowInsecureTls })}
            />
          </div>
        </>
      )}
      <div className="set-field">
        <div className="set-field-text">
          <label className="set-field-label" htmlFor="nas-user">
            {text.user}
          </label>
        </div>
        <input
          id="nas-user"
          className="set-input"
          value={draft.username}
          autoComplete="off"
          onChange={(event) => patch({ username: event.target.value })}
        />
      </div>
      <div className="set-field set-field-top">
        <div className="set-field-text">
          <div className="set-field-stack">
            <label className="set-field-label" htmlFor="nas-password">
              {text.password}
            </label>
            <div className="set-field-desc">
              {hasPassword ? `${text.passwordSet} ${text.passwordKeep}` : ''}
            </div>
          </div>
        </div>
        <input
          id="nas-password"
          className="set-input"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <label className="set-field-label" htmlFor="nas-interval">
            {text.interval}
          </label>
        </div>
        <input
          id="nas-interval"
          className="set-input set-num-input"
          type="number"
          min={1}
          max={1440}
          value={draft.intervalMinutes}
          onChange={(event) => patch({ intervalMinutes: Number(event.target.value) })}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <div className="set-field-label">{text.workspace}</div>
            <div className="set-field-desc">{draft.workspacePath || '—'}</div>
          </div>
        </div>
        <button type="button" className="set-btn" onClick={() => void pickWorkspace()}>
          {text.change}
        </button>
      </div>
      <p className="nas-sync-note">{text.trashHint}</p>
      {status && status.conflictCount > 0 && (
        <p className="nas-sync-note error">
          {text.conflicts.replaceAll('{n}', String(status.conflictCount))}
        </p>
      )}
      {note && <p className={`nas-sync-note${noteError ? ' error' : ''}`}>{note}</p>}
      <div className="nas-sync-actions">
        <button type="button" className="set-btn" disabled={busy} onClick={() => void save(false)}>
          {text.save}
        </button>
        <button
          type="button"
          className="set-btn primary"
          disabled={busy}
          onClick={() => void save(true)}
        >
          {text.syncNow}
        </button>
      </div>
    </div>
  )
}
