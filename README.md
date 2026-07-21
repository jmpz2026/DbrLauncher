# DBR-ASSETS

Assets del modpack **Dbr Resurrection** (Minecraft Forge 1.7.10) que consume el
[DbrLauncher](https://github.com/jmpz2026).

| Archivo / carpeta | Qué es |
|-------------------|--------|
| `manifest.json` | Índice de mods/configs con SHA1 (lo lee la sync del launcher). |
| `forge-1.7.10.json` | JSON de versión de Forge (overlay `inheritsFrom: 1.7.10`). |
| `news.json` | Noticias que muestra el launcher. |
| `mods/` | Mods del modpack. |
| `config/` | Configuración del modpack. |

## URLs (raw)

- Manifest: `https://raw.githubusercontent.com/jmpz2026/DBR-ASSETS/main/manifest.json`
- Forge:    `https://raw.githubusercontent.com/jmpz2026/DBR-ASSETS/main/forge-1.7.10.json`
- Noticias: `https://raw.githubusercontent.com/jmpz2026/DBR-ASSETS/main/news.json`

## Regenerar el manifest

Tras cambiar mods/configs, desde el proyecto del launcher:

```bash
npm run manifest -- --dir /ruta/a/DBR-ASSETS \
  --base https://raw.githubusercontent.com/jmpz2026/DBR-ASSETS/main/ \
  --version 1.0.0 --forge 10.13.4.1614 --include mods,config \
  --out /ruta/a/DBR-ASSETS/manifest.json
```

Sube el `manifest.json` y los archivos nuevos. La sync del launcher descarga lo
que falte y borra los mods que ya no estén en el manifest.
