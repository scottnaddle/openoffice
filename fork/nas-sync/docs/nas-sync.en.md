# Company NAS sync

Documents stay in a folder on this Mac. When the company NAS can be reached, the app copies changes both ways. If the same file changed on both sides, both copies are kept. The copy that was on the NAS is saved as `name (conflict - user date).ext`. Removed files are moved into `.nas-sync-trash` on this Mac and on the NAS. They are not erased.

The NAS model is not detected. Pick SMB when the share is mounted on this Mac, or WebDAV over HTTPS when you are away from the office.

## Local folder

1. Open Settings, then General, then Company NAS.
2. Choose **Folder on this computer**. New and edited documents you want on the NAS should be saved in this folder.
3. The app's own save location is separate. Point that at the same folder if you want new documents to start there.

## SMB (in the office)

Finder shows a mounted share under `/Volumes`.

1. In Finder, choose Go, then Connect to Server.
2. Enter `smb://hostname/ShareName` or `smb://192.168.0.20/ShareName`. Do not put a password in that address. macOS asks for it and can store it in the Keychain.
3. After it connects, the disk is `/Volumes/ShareName`. A subfolder is `/Volumes/ShareName/Office`.
4. Paste that path into **Mounted folder**.
5. Optional: paste the same `smb://...` address into **SMB address**. If the share is not mounted, the app asks macOS to open it.

### Synology

1. Control Panel, File Services, SMB. Turn SMB on.
2. Control Panel, Shared Folder. The folder name is the share name.
3. On the Mac, connect to `smb://SERVER.local/ShareName` or `smb://<LAN-IP>/ShareName`.
4. The path to paste is `/Volumes/ShareName`.

SMB from another country usually needs a VPN. QuickConnect does not give you an SMB path. Use WebDAV when you are traveling.

### QNAP

1. Control Panel, Network & File Services, Win/Mac/NFS (or Microsoft Networking). Turn SMB on.
2. The shared-folder name is the share name.
3. On the Mac, connect to `smb://NAS.local/ShareName` or the LAN IP.
4. The path to paste is `/Volumes/ShareName`.

### Other NAS

Connect from Finder as above. The path is `/Volumes/` plus the name shown on the desktop or in the Finder sidebar. The SMB address is `smb://host/share`.

## WebDAV over HTTPS (away from the office)

Use the HTTPS address that answers WebDAV. It must start with `https://` and must not contain the password. Type the user name and password in the fields. The password is stored in the macOS Keychain, not in a settings file.

Turn on **Trust this NAS certificate** only when the NAS uses a certificate macOS does not already trust.

### Synology

1. Control Panel, File Services, WebDAV. Turn on WebDAV and HTTPS.
2. The HTTPS port is often `5006`.
3. The URL is `https://hostname:5006/ShareName`.
4. If you use DDNS or a reverse proxy, use that host and port instead.

`https://quickconnect.to/<id>` is a relay page. It often does not speak WebDAV. Prefer the NAS host name, a DDNS name, or a VPN. If your remote-access setup publishes a real WebDAV HTTPS URL, paste that URL.

### QNAP

1. Control Panel, Web Server or Network & File Services, WebDAV (the menu name depends on the QTS version). Turn on WebDAV over HTTPS.
2. The URL is often `https://hostname:5006/ShareName` or `https://hostname/ShareName`.
3. For myQNAPcloud, use the HTTPS address that speaks WebDAV, not a page that only opens in a browser.

### Other NAS

The URL is the HTTPS address of the share root. The same address should ask for a user and password, or show the folder, when opened carefully in a browser. The app sends Basic authentication to that address.

## In the app

1. Turn on **Sync with the company NAS**.
2. Choose SMB or WebDAV and fill in the path or URL.
3. Set the user name, password, and minutes between syncs.
4. Save, then **Sync now**.
5. The home sidebar shows Synced, Syncing, NAS offline, or a conflict count. Offline work stays in the local folder and is copied after the NAS is reachable again. Plugging the network back in starts another pass.

## What is skipped

Office lock files (`~$...`), LibreOffice lock files, names ending in `.tmp`, `.lock`, or `~`, and everything under `.nas-sync-trash`.

A file larger than 256 MB is left in place and the status says sync needs attention.

## Microsoft 365 sign-in (optional)

Skip this if the NAS has its own user names. The app still syncs.

Sign-in is for a company whose NAS accounts are the same Microsoft 365 / Entra ID accounts. The NAS model is still unknown, so the app does not guess how the NAS is joined.

What the app does:

- Public client. Authorization code with PKCE. No client secret.
- The system browser opens the Microsoft login page. The reply comes back to `http://localhost` on a free port (MSAL's loopback server).
- The only scope required for the name and email is Microsoft Graph `User.Read`.
- Tokens are sealed with the macOS Keychain (`safeStorage`). They are not written into `settings.json`.
- Settings shows the signed-in name and email. The home sidebar shows them too.
- The NAS user name is filled from the UPN (`ada@contoso.com`). Choose **Windows account name** to use `sAMAccountName` when the directory has one. If it does not, the part before `@` is used. Conflict files use that name: `name (conflict - ada@contoso.com date).ext`.
- You can type a different NAS user name. That choice is kept.
- Sign out deletes the token cache on this Mac. It does not delete the NAS password. The browser may still have a Microsoft session.

### What IT registers

1. In the Microsoft Entra admin center, open **App registrations** and create a registration.
2. Supported accounts: this organization, unless IT wants another choice (`organizations` is the usual tenant value; a tenant GUID is finer).
3. Redirect URI: platform **Mobile and desktop applications**, URI `http://localhost`. The port is chosen at sign-in. Do not put a password or a secret in the URI.
4. Copy the **Application (client) ID** and the **Directory (tenant) ID** into Settings. A packaged build can also bake them in with `NAS_SYNC_ENTRA_TENANT_ID` and `NAS_SYNC_ENTRA_CLIENT_ID`. Values typed in Settings win.
5. Turn on public client flows. Do not create a client secret.
6. API permissions: Microsoft Graph, delegated, `User.Read`. Grant admin consent if the tenant requires it.

### Passwords and tokens

SMB and most WebDAV servers cannot take an Entra access token.

**(a) Directory user name and password.** This is the path that works with a NAS joined to the same accounts.

- User name: the UPN or the sAMAccountName, already filled in.
- Password: the directory password, typed once in the app. It is stored in the macOS Keychain and sent only as WebDAV Basic authentication.
- The Microsoft password itself never reaches the app. The browser collects it.
- SMB on this Mac is a mounted folder. The app does not put the password in the `smb://` address. When macOS asks, use the same user name. macOS can store that password in the login keychain.

**(b) OAuth bearer token, only if the NAS WebDAV server accepts one.**

- Set **WebDAV authentication** to **OAuth bearer token** and enter the scope IT gives you.
- The app asks MSAL for a silent access token for that scope and sends `Authorization: Bearer ...` only to the WebDAV URL in Settings.
- The extension point is `WebdavBearerHook` in `src/entra/bearer.ts`. The default hook is that silent MSAL token. A different hook can be passed to `authorizationFromHook`.
- SMB still cannot use the token.

### Joining Synology, QNAP, or another NAS

The goal is that the same UPN or sAMAccountName and the same directory password open the share.

**Synology**

- Control Panel, **Domain/LDAP** (or **Domain**).
- Azure AD Domain Services (Entra Domain Services): join the NAS to that managed domain. Users then sign in with the UPN or the sAMAccountName from the domain.
- LDAP: if the company publishes LDAP (Azure AD DS secure LDAP, or another directory that mirrors Entra), bind Synology to that LDAP server.
- A Synology share does not accept a raw Entra token for SMB.

**QNAP**

- Control Panel, **Privilege**, **Domain Security** (wording varies by QTS).
- Join the Azure AD DS managed domain, or an Active Directory domain that is synced from Entra.
- LDAP: the same page, **LDAP**, using the company's LDAP address.
- QNAP SMB and ordinary WebDAV then use those directory accounts.

**Other NAS**

- Join it to Active Directory, to Azure AD Domain Services, or to the company LDAP.
- Confirm a person can open the share with the UPN or sAMAccountName and the directory password before turning sync on.

If the size and modification time match the last sync, the file is not read again.
