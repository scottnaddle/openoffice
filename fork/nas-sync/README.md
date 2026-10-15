# Company NAS sync (fork only)

Documents stay in a folder on this computer. A background pass mirrors that folder to the company NAS when the NAS can be reached.

This folder is not part of upstream. Keep the engine, the settings screen, the wording, and these notes here. The shell only imports the host, the settings screen, and the status chip.

- SMB uses a folder macOS has mounted, usually `/Volumes/<share>`. If you also set an `smb://` address with no password in it, a missing mount is opened with `/usr/bin/open`.
- WebDAV uses HTTPS. The usual mode is Basic authentication. If the NAS accepts an Entra access token, a bearer hook can send it instead. The client is the TypeScript in `src/backends/webdav.ts`.
- The NAS password and the Microsoft token cache are sealed with Electron `safeStorage` (macOS Keychain). `settings.json` has neither.
- Microsoft sign-in is optional. It uses `@azure/msal-node` (public client, authorization code, PKCE, the system browser, and a loopback redirect). Skipping it leaves NAS sync unchanged.
- The signed-in name and email are shown in the app. The NAS user name defaults to the account UPN, or to sAMAccountName when that option is selected. Conflict file names use that user name.
- Sync state (last hash, size, and mtime for each file) is `state.json` under the app's `nas-sync` directory.
- A content conflict keeps the local bytes at the original name and writes the other bytes to `name (conflict - <user> <date>).ext` on both sides.
- A deletion moves the file into `.nas-sync-trash`. It is not unlinked. A deletion does not discard an edit on the other side.
- Office lock files, temp files, and the trash folder are skipped.
- If the NAS is offline, the pass is marked pending and retried with backoff. Coming back online starts another pass.

Setup steps for Synology, QNAP, and a generic NAS are in `docs/nas-sync.en.md` and `docs/nas-sync.ko.md`.
