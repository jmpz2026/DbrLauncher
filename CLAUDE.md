# DBR-ASSETS

Plan activo: [PLAN-mirror-robusto.md](PLAN-mirror-robusto.md). Hace el mirror de assets robusto: validador de manifests, pre-commit, poner-jar y actualizar.bat. Lee el plan para ver su estado y el siguiente paso.

Regla: nunca edites a mano el sha1 o el size de un manifest. Para un jar, usa `node tools/poner-jar.mjs <canales> <jar>`. Para cambios grandes, usa `actualizar.bat`. Ver README.md, sección "Publicar cambios".
