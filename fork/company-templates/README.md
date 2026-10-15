# Company document templates

Fork-only library for the home-screen template gallery. Wording, scanning, placeholder filling and the settings block live in this folder. The shell only starts and stops the host, exposes `window.ieumTemplates`, and mounts the gallery and settings.

The company folder is an absolute path in `userData/company-templates.json`. It may be a directory that NAS sync keeps current. This package does not import `fork/nas-sync`.

How to add a template is written in Korean in the repository `README.md` and `FORK.md`.
