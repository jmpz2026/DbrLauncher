# DBR-ASSETS

Assets del modpack **Dbr Resurrection** (Minecraft Forge 1.7.10) que consume el DbrLauncher

## Publicar cambios

Hay dos formas de tocar el modpack. Las dos validan los manifests antes de subir.

- **Muchos cambios (mods, config, resourcepacks):** copia los archivos a la carpeta del canal
  (`mods/`, `lite/`, `experimental/`) y corre `actualizar.bat [version]`. Regenera los tres
  manifests, valida, commitea, hace push y espera la Action del mirror.
- **Un solo jar en uno o varios canales:** `node tools/poner-jar.mjs full,lite,experimental <jar>`.
  Copia el jar, borra la versión vieja y recalcula sha1 y size. No commitea.

**Nunca edites a mano el sha1 ni el size de un manifest**, ni con `sed` o `replace` desde un
script. `sha1sum` de Git Bash antepone `\` al hash cuando la ruta lleva `\`, y ese manifest roto
llega al instante a todos los jugadores por raw.githubusercontent.

Red de seguridad:

- `tools/check-manifests.mjs` valida JSON, sha1, size y que cada archivo exista.
- `tools/hooks/pre-commit` lo corre en cada commit. `actualizar.bat` activa el hook con
  `git config core.hooksPath tools/hooks`.
- La Action `mirror-assets.yml` lo corre antes de tocar el release `assets-files` y R2.
