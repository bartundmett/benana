# App Icons

Place the app icon files here:

- `app-icon.png` (recommended: 1024x1024 PNG)
- `app-icon.ico` (Windows app/window icon)
- alternatively: `app-icon.jpg` / `app-icon.jpeg`

The Electron main process will automatically use these files for:

- macOS Dock icon (`app-icon.png`)
- Linux/Windows window icon (`app-icon.png`/`app-icon.ico`)

If only `app-icon.png` is present, macOS and Linux icon usage works immediately.
For Windows packaging, add `app-icon.ico` as well.
