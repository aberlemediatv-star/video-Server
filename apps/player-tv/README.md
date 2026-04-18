# Smart-TV-Wrapper (Tizen & webOS)

Diese Ordner enthalten nur die **Verpackung** — die eigentliche App ist der bereits gebaute
`apps/player-web/dist/`. Build vorher dort erzeugen:

```bash
cd ../player-web && npm run build
```

## Tizen (Samsung)

Ordner: `tizen/`. Die Datei `config.xml` referenziert die Web-App via `<content src="index.html"/>`.
Vor dem Packaging einmal die `player-web`-Buildartefakte nach `tizen/www/` kopieren:

```bash
rm -rf tizen/www && mkdir -p tizen/www
cp -r ../player-web/dist/* tizen/www/
```

Packen & signieren mit **Tizen Studio** (Samsung):

```bash
tizen package -t wgt -s <SamsungCertProfile> -- tizen
# Installation auf Gerät/Emulator via `tizen install -n *.wgt -t <target>`
```

## webOS (LG)

Ordner: `webos/`. `appinfo.json` zeigt auf `index.html` (gleicher Build).

```bash
rm -rf webos/www && mkdir -p webos/www
cp -r ../player-web/dist/* webos/www/
ares-package webos
# Installation via ares-install <ipk> -d <device>
```

## Realität

- Beide Plattformen benötigen die **jeweilige SDK** (Tizen Studio / webOS CLI) sowie **Geräte-Zertifikate**; das ist nicht automatisierbar.
- Apple **tvOS** ist **keine** Web-App-Plattform — tvOS-Apps sind native Swift/Objective-C (TVMLKit wurde zurückgefahren). Dafür müsste ein separates Xcode-Projekt angelegt werden; ist hier **nicht** enthalten.
- Android TV läuft das **bestehende** `player-web` problemlos im TV-Browser/WebView. Für einen „richtigen“ Android-TV-Store-Release wäre ein eigenes Android-Projekt nötig.
