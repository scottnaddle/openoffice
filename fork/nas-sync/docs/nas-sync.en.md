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

If the size and modification time match the last sync, the file is not read again.
