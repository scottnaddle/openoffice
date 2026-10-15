import { useEffect, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import { nasLoginName } from '../src/entra/profile'
import type { MicrosoftAccountView, NasSyncSnapshot } from '../src/public'
import type { NasNameKind, NasSettings, SyncStatus, WebdavAuthKind } from '../src/types'
import { nasCopy } from './strings'
import './nas-sync.css'

function messageFor(code: string | undefined, text: ReturnType<typeof nasCopy>): string {
  if (!code) return ''
  if (code === 'keychain-unavailable') return text.keychainUnavailable
  if (code === 'bad-url') return text.badUrl
  if (code === 'bad-smb-url') return text.badSmb
  if (code === 'paths-overlap') return text.overlap
  if (code === 'entra-config') return text.entraConfig
  if (code === 'entra-cancelled') return text.entraCancelled
  if (code === 'bearer-scope') return text.webdavScopeHint
  if (code === 'entra-failed') return text.entraFailed
  return text.error
}

/** Settings → General. The password field is not written into the settings file. */
export function NasSyncSettings({ lang }: { lang: Lang }) {
  const text = nasCopy(lang)
  const [draft, setDraft] = useState<NasSettings | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [account, setAccount] = useState<MicrosoftAccountView | null>(null)
  const [defaults, setDefaults] = useState({ tenantId: '', clientId: '' })
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
      setAccount(next.account)
      setDefaults(next.entraDefaults)
    })
    const off = api.onStatus((next) => {
      if (!alive) return
      setStatus(next.status)
      setHasPassword(next.hasPassword)
      setAccount(next.account)
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
      setAccount(result.snapshot.account)
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

  const signIn = async () => {
    const api = window.ieumNasSync
    if (!api) return
    setBusy(true)
    setNote('')
    setNoteError(false)
    try {
      const saved = await api.save({ ...draft, password: password || undefined })
      setHasPassword(saved.snapshot.hasPassword)
      setAccount(saved.snapshot.account)
      if (!saved.ok) {
        setNote(messageFor(saved.error, text))
        setNoteError(true)
        return
      }
      setDraft(saved.snapshot.settings)
      setPassword('')
      const signed = await api.signIn()
      setDraft(signed.snapshot.settings)
      setAccount(signed.snapshot.account)
      setHasPassword(signed.snapshot.hasPassword)
      if (!signed.ok) {
        setNote(messageFor(signed.error, text))
        setNoteError(true)
        return
      }
      setNote(text.saved)
    } catch {
      setNote(text.entraFailed)
      setNoteError(true)
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    const api = window.ieumNasSync
    if (!api) return
    const next = await api.signOut()
    setAccount(next.account)
    setDraft(next.settings)
    setStatus(next.status)
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
      <div className="set-field set-field-top">
        <div className="set-field-text">
          <div className="set-field-stack">
            <div className="set-field-label">{text.microsoftTitle}</div>
            <div className="set-field-desc">{text.microsoftIntro}</div>
            {account ? (
              <div className="nas-sync-account">
                <strong>
                  {text.microsoftName}: {account.displayName}
                </strong>
                <span>
                  {text.microsoftEmail}: {account.email}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        {account ? (
          <button type="button" className="set-btn" disabled={busy} onClick={() => void signOut()}>
            {text.microsoftSignOut}
          </button>
        ) : (
          <button type="button" className="set-btn" disabled={busy} onClick={() => void signIn()}>
            {text.microsoftSignIn}
          </button>
        )}
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <label className="set-field-label" htmlFor="nas-tenant">
              {text.tenantId}
            </label>
            <div className="set-field-desc">{text.tenantHint}</div>
          </div>
        </div>
        <input
          id="nas-tenant"
          className="set-input"
          value={draft.entraTenantId}
          placeholder={defaults.tenantId}
          autoComplete="off"
          onChange={(event) => patch({ entraTenantId: event.target.value })}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <label className="set-field-label" htmlFor="nas-client">
              {text.clientId}
            </label>
            <div className="set-field-desc">{text.clientHint}</div>
          </div>
        </div>
        <input
          id="nas-client"
          className="set-input"
          value={draft.entraClientId}
          placeholder={defaults.clientId}
          autoComplete="off"
          onChange={(event) => patch({ entraClientId: event.target.value })}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <label className="set-field-label" htmlFor="nas-name-kind">
            {text.nasNameKind}
          </label>
          <div className="set-field-desc">{text.nasNameHint}</div>
        </div>
        <select
          id="nas-name-kind"
          className="set-input"
          value={draft.nasNameKind}
          onChange={(event) => {
            const nasNameKind: NasNameKind = event.target.value === 'sam' ? 'sam' : 'upn'
            const next: Partial<NasSettings> = { nasNameKind }
            if (draft.usernameFollowsAccount && account) {
              next.username = nasLoginName(account, nasNameKind)
            }
            patch(next)
          }}
        >
          <option value="upn">{text.nasNameUpn}</option>
          <option value="sam">{text.nasNameSam}</option>
        </select>
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
          <div className="set-field">
            <div className="set-field-text">
              <label className="set-field-label" htmlFor="nas-webdav-auth">
                {text.webdavAuth}
              </label>
            </div>
            <select
              id="nas-webdav-auth"
              className="set-input"
              value={draft.webdavAuth}
              onChange={(event) =>
                patch({
                  webdavAuth: (event.target.value === 'bearer'
                    ? 'bearer'
                    : 'basic') as WebdavAuthKind,
                })
              }
            >
              <option value="basic">{text.webdavBasic}</option>
              <option value="bearer">{text.webdavBearer}</option>
            </select>
          </div>
          {draft.webdavAuth === 'bearer' ? (
            <div className="set-field set-field-top">
              <div className="set-field-text">
                <div className="set-field-stack">
                  <label className="set-field-label" htmlFor="nas-scope">
                    {text.webdavScope}
                  </label>
                  <div className="set-field-desc">{text.webdavScopeHint}</div>
                </div>
              </div>
              <input
                id="nas-scope"
                className="set-input"
                value={draft.webdavScope}
                autoComplete="off"
                onChange={(event) => patch({ webdavScope: event.target.value })}
              />
            </div>
          ) : null}
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
          onChange={(event) =>
            patch({ username: event.target.value, usernameFollowsAccount: false })
          }
        />
      </div>
      {account ? (
        <div className="set-field">
          <div className="set-field-text">
            <div className="set-field-desc">{text.passwordStillNeeded}</div>
          </div>
          <button
            type="button"
            className="set-btn"
            onClick={() =>
              patch({
                username: nasLoginName(account, draft.nasNameKind),
                usernameFollowsAccount: true,
              })
            }
          >
            {text.useAccountName}
          </button>
        </div>
      ) : null}
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
