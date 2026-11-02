# GFC Floor Quote (iPhone + Android)

Gomez Flooring Company homeowner app. The app itself is `www/index.html`; Capacitor wraps it for iPhone (`ios/`) and Android (`android/`).

- Change the app: edit `www/index.html`, then `npx cap sync`.
- Android test build: every push to `main` builds an installable test APK in GitHub Actions (Actions tab > latest run > Artifacts).
- iPhone: needs the Apple Developer account; build runs on a macOS GitHub Actions runner once signing is set up.
- Store text and privacy policy: `docs/`.
