# Parches al upstream vendorizado (ZalithLauncher2)

Cambios propios sobre la fuente de ZalithLauncher2 (`UPSTREAM.txt` = commit base).
Mantener esta lista al día para poder re-aplicar tras sincronizar upstream.

## 1) `formatted="false"` en strings multi-sustitución (2026-07-22)
**Motivo:** AAPT2 de `build-tools;37.0.0` trata como ERROR los strings con múltiples `%`
no posicionales (`Multiple substitutions specified in non-positional format`). El upstream
no compilaba con build-tools 37 sin esto.

**Cambio:** añadido `formatted="false"` a estos dos strings en los 23 archivos de recursos
(`values/` y todos los `values-*/`):
- `terracotta_notification_desc` (`.../res/**/terracotta.xml`)
- `file_invalid_length` (`.../res/**/strings.xml`)

Inocuo en runtime (siguen usándose con `String.format` posicional en orden).
