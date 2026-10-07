# LTW (Large Thin Wrapper)

`libltw.so` en `ZalithLauncher2/ZalithLauncher/src/main/jniLibs/<abi>/` es LTW **sin modificar**,
compilado desde https://github.com/MojoLauncher/LTW en el commit
`9dc80cb121bd1a1ba9f3b18d10c811753d4261e3` con su propio build:

```bash
git clone https://github.com/MojoLauncher/LTW && cd LTW
git checkout 9dc80cb121bd1a1ba9f3b18d10c811753d4261e3
./gradlew :ltw:assembleRelease   # NDK 28.2.13676358, CMake 3.22.1
# las .so salen en ltw/build/outputs/aar/ltw-release.aar (jni/<abi>/libltw.so)
```

Licencia: LGPL-3.0 (ver `LICENSE`). Autores: artDev, SerpentSpirale, CADIndie y colaboradores.
Lo usa el modpack experimental (Angelica necesita LTW). Se registra como renderizador en
`game/renderer/renderers/LTWRenderer.kt`.

SHA-256 de arm64-v8a: `9292a152ab65649370c88ed41762d207731174f67386b482ec090bc5bc8ef004`
