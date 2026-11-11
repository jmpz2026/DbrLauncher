# Auditoria de plugin.yml (plugins Dbr, MC 1.7.10)

Fecha: 2026-11-10. Solo lectura, no se toco ningun plugin.
Alcance: 64 carpetas `Dbr*` con `src/main/resources/plugin.yml` (no hay `Chamo*` con plugin.yml). Se ignoran `target/`, `decompiled/`, `build/`.
Metodo: parseo de cada plugin.yml (comandos, aliases, permisos, defaults) mas grep del Java (`getCommand`, `setExecutor`, `hasPermission`, `PermUtil`, `isOp`). Es analisis estatico: el registro dinamico (bucles, `bind(...)`, `registrar(...)`) se verifico a mano en los plugins que lo usan.

## Resumen

- Alta: 0. Media: 6 hallazgos (10 entradas por plugin). Baja: 46.
- Punto 1 (comandos de staff sin chequeo): ninguno queda sin check. Los que no tienen `permission:` lo comprueban en el codigo (PermUtil / hasPermission / solo consola). Solo dos usan `isOp()` en vez de permiso (ver Baja y Media 3).
- Punto 2 (`default: true` con poderes de staff/economia/give/admin): ninguno otorga staff. Los `true` son de jugador (`*.use`, `*.user`, `*.jugar`, `rebirth`, `report`, `enderchest.propio`). Solo se anotan los de economia (Baja).
- Punto 3 (colisiones entre plugins Dbr): una sola real, `historial`. Contra Essentials/vanilla: DbrStaff toma ban/kick/etc. a proposito con `CommandTakeover`.
- Punto 4 (staff con default distinto de op/false): ninguno. Todos los `reload`, `give/dar`, `set`, `reset`, `admin` son `op` o `false`.
- Punto 5 (comandos fantasma): ninguno real. Los 13 plugins que el grep marca como "declarado pero sin getCommand" registran por variable (`bind(name)`, bucle `for (String c : {...})`, `registerCommand`, `registrar`) o el propio plugin es el executor (DbrAntiCommand). Verificado uno a uno. `DbrPlugin` hace `getCommand("menu")` sin declararlo: es el comando de DbrMenu, lo usa para abrir el menu sin pasar por el commandMap; no es fantasma.

## Alta

Sin hallazgos.

## Media

1. DbrGachaPlugin / DbrStaffPlugin — alias `historial` — choque entre plugins Dbr. Gacha lo declara en `CartelesHistorial` (historial de tiradas, jugadores) y Staff en `warns` (historial de sanciones, staff). Gana el que cargue primero; el otro queda como `/<plugin>:historial`. — Quitar `historial` de uno de los dos (sugerido: del alias de `warns`, que ya tiene `warnlist`).
2. DbrBendicionPlugin, DbrLogrosPlugin — permiso heredado `Admin` — nombre generico y sin declarar en ningun plugin.yml. `DbrBendicionPlugin.java:207` y `Permisos.ADMIN_LEGACY` lo aceptan como admin (ComprarBS, RecompensaBS, EliminarBS, RegistrarLogro, ReclamarLogro...). Cualquier grupo o plugin que conceda `Admin` o `*` da poder de dar recompensas; al no estar declarado, Bukkit lo trata como `op`. — Migrar los scripts de Skript a `dbrbendicion.admin` / `dbrlogros.admin` y quitar el permiso legado (o dejarlo tras una opcion de config.yml apagada por defecto).
3. DbrPlugin — `TestSkriptCommand` (comando de depuracion) — queda en produccion, solo lo protege `isOp()` (no el sistema de permisos) y hace `bc ...` por consola con datos del jugador. Sin `permission:`. — Borrar el comando y su entrada en plugin.yml, o ponerle `permission: dbrplugin.debug` con `default: false`.
4. DbrQuestionPlugin, DbrBattlePassPlugin, DbrPoderPlugin — permiso `VipGlobal` — nombre compartido sin prefijo. DbrQuestion lo declara (`default: false`), BattlePass lo lee de `config.yml` (`vip.permiso`) y Poder de `comandos.poder.permiso`. Tres plugins dependen del mismo nombre y solo uno lo declara; cambiarlo o cambiar su default en uno afecta a los otros. — Declararlo una sola vez (por ejemplo `dbr.vip.global`) o declararlo en cada plugin con el mismo default, y documentarlo.
5. DbrStaffPlugin — `ban`, `kick`, `tempban`, `unban` (alias `pardon`), `broadcast` (`bc`), `enderchest` (`ec`), `vanish` (`v`), `freeze`, `invsee`, `warn`, `report` — pisan nombres vanilla/Essentials. Es intencional (`CommandTakeover` re-apunta la clave corta a DbrStaff), pero `dbrstaff.ban` y `dbrstaff.unban` son `default: false`: si el takeover pisa `/ban`, ningun op puede banear hasta recibir el permiso explicito. — Confirmar que la lista de takeover en config.yml es la deseada y que el grupo staff tiene `dbrstaff.ban`/`dbrstaff.unban`; documentar que `/ec` y `/v` son de DbrStaff.
6. DbrPoderPlugin — `poder`, `poderu`, `darpoder`, `darpoderu` — comandos que dan poder (propio o a otro jugador) sin `permission:` y sin permiso declarado en plugin.yml: el acceso depende de nombres de `config.yml` (`VipGlobal`, `Resurrection*`) que no estan declarados, asi que Bukkit los resuelve como `op` y un op cumple todos los rangos a la vez. El chequeo existe en el codigo, por eso no es Alta. — Declarar en plugin.yml `dbrpoder.poder`, `dbrpoder.poderu`, `dbrpoder.dar` (default `false`) y que el config mapee rangos a esos nodos.

## Baja

### Aliases redundantes (alias igual al nombre del comando, solo cambia mayusculas; Bukkit compara en minusculas, no hace nada)
Arreglo comun: borrar el alias repetido.
- DbrAldeasPlugin — `DbrAldeas` alias `dbraldeas` — redundante — quitar alias.
- DbrBattlePassPlugin — `PaseZ` alias `pasez` — redundante — quitar alias.
- DbrCasinoPlugin — `Casino` alias `casino`; `DbrCasino` alias `dbrcasino` — redundante — quitar ambos.
- DbrClansPlugin — `Clan` alias `clan`; `DbrClan` alias `dbrclan` — redundante — quitar ambos.
- DbrCombatTagPlugin — `DbrCombatTag` alias `dbrcombattag` — redundante — quitar alias.
- DbrDoomPlugin — `DbrDoom` alias `dbrdoom` — redundante — quitar alias.
- DbrEquipoPlugin — `DbrEquipo` alias `dbrequipo` — redundante — quitar alias.
- DbrFoodPlugin — `Comida` alias `comida`; `DbrFood` alias `dbrfood` — redundante — quitar ambos.
- DbrFormasPlugin — `DbrFormas` alias `dbrformas` — redundante — quitar alias.
- DbrGachaPlugin — `RC` alias `Rc`; `Carteles` alias `carteles`; `CartelesHistorial` alias `carteleshistorial`; `CartelesInfo` alias `cartelesinfo`; `DbrGacha` alias `dbrgacha` — redundantes — quitar.
- DbrInvasionPlugin — `DbrInvasion` alias `dbrinvasion` — redundante — quitar alias.
- DbrIslaPlugin — `DbrIsla` alias `dbrisla` — redundante — quitar alias.
- DbrRepararPlugin — `DbrReparar` alias `dbrreparar` — redundante — quitar alias.
- DbrTalentosPlugin — `AutoSenzu` alias `autosenzu` — redundante — quitar alias.
- DbrTierraPlugin — `DbrTierra` alias `dbrtierra` — redundante — quitar alias.
- DbrViajesPlugin — `DbrViajes` alias `dbrviajes` — redundante — quitar alias.

### Nombres genericos que pueden chocar con plugins de terceros (no hay choque entre plugins Dbr)
- DbrGuiaPlugin — `guia` alias `ayuda` — `ayuda` es alias de `/help` en muchos servidores y en Essentials en espanol — conservar solo si se decide pisar `/help`; si no, quitarlo.
- DbrQuickShop — `qs` alias `shop` — `shop` es nombre comun en plugins de tienda — quitar o conservar con takeover explicito.
- DbrMenuPlugin — `menu` — nombre muy comun (DbrPlugin ya lo protege abriendolo por `getCommand`) — dejar asi o darle takeover como en DbrStaff.
- DbrTagPlugin — `tag` — nombre comun (tags/prefijos) — confirmar que no hay otro plugin de tags.
- DbrTradePlugin — `trade` — nombre comun — confirmar que no hay otro plugin de comercio.
- DbrStackPlugin — `stack` alias `apilar` — nombre comun — confirmar.

### Permisos declarados que ningun codigo ni plugin.yml usa (sin efecto; los `true` dan falsa sensacion de control)
- DbrBattlePassPlugin — `pasez.user` (true) — sin uso — quitar o usarlo en `PaseZ`.
- DbrDiagPlugin — `dbrdiag.use` (true) — sin uso — quitar.
- DbrIdiomaPlugin — `dbridioma.use` (true) — sin uso — quitar.
- DbrKiPlugin — `dbrki.admin` (op) — sin uso; el comando `dbrki` no tiene `permission:` y solo `dbrki.info`/`dbrki.recargar` se comprueban — hacerlo padre (children) de los dos o quitarlo.
- DbrSenzuPlugin — `dbrsenzu.use` (true) — sin uso — quitar.
- DbrStackPlugin — `dbrstack.admin` (op) — sin uso (se usan `dbrstack.reload`/`force`) — hacerlo padre de ambos o quitar.
- DbrStaffPlugin — `dbrstaff.alerta` (op) — sin uso en el Java — quitar o implementar.
- DbrTalentosPlugin — `dbrtalentos.use` (true) — sin uso — quitar.
- DbrTutorialPlugin — `dbrtutorial.use` (true) — sin uso — quitar.
- DbrVoicePlugin — `dbrvoiceplugin.use` (true) y `dbrvoiceplugin.admin` (op) — sin uso (el codigo usa `dbrvoice.mute`/`broadcast`) — quitar o alinear nombres.
- DbrPetsPlugin — `dbrpets.incubator2` (false) — sin uso — quitar o implementar.
- DbrRebirthPlugin — `dbrrebirth.internal` (op) — sin uso en el codigo — quitar.
- DbrCasinoPlugin — `casino.sala.silver/gold/diamond` (false) — sin uso — quitar o implementar.

### Permisos usados en el codigo pero sin declarar (Bukkit los trata como `op`; no salen en LuckPerms ni tienen descripcion)
- DbrQuickShop — `quickshop.reload`, `quickshop.delete`, `quickshop.clean`, `quickshop.info`, `quickshop.create.changeprice`, `quickshop.bypass.` — sin declarar; ademas `quickshop.bypass.<itemID>` en plugin.yml no es un nodo valido — declarar con `default: op` y quitar el nodo con `<itemID>`.
- DbrCasinoPlugin — `Raza` — nodo sin prefijo y sin declarar — declarar `casino.raza` o documentar.
- DbrCombatPlugin — `Resurrection1..9`, `InicioResurrection0` — rangos sin declarar; un op los cumple todos a la vez — declararlos o usar un sistema de rango propio.
- DbrCorePlugin — `Resurrection` — igual que arriba — declarar.
- DbrStaffPlugin — `AntiAFKPlus.bypass` — permiso de otro plugin leido sin declarar — mantener, pero documentarlo.
- DbrGachaPlugin — `dbrforja.use` (`ClientSyncService.java:470`) — permiso de DbrForja leido desde Gacha — acoplamiento entre plugins; mover a un nodo de Gacha o a un servicio compartido.

### Otros
- DbrTopsPlugin — `TopCheckUp` / `TopCheckDown` (`TopCheckCommand`) — comprueban `isOp()` en vez de permiso — usar `PermUtil` con un nodo `dbrtops.check` (default op).
- DbrIslaPlugin — comandos `MensajeNpcNoMercadoPiñata` y `MensajeNpcMuertoMercadoPiñata` — nombres con `ñ`; el Java ya usa `startsWith("...pi")` para esquivar problemas de codificacion — renombrar a ASCII (`...Pinata`) y actualizar los scripts del NPC.
- DbrCasinoPlugin — `casino.chips.buy` / `casino.chips.sell` (default true) — economia por defecto; tambien se chequean en `ClientChannelListener` (canal del mod), no solo en el mueble — confirmar que es deliberado; si no, `default: false`.
- DbrBallClickerPlugin — `dbresferas.cobrar` (default true) — cobra recompensas de hitos; es de jugador pero es economia — confirmar que el servidor valida los hitos.
- DbrPlugin — `MainCommand` — solo imprime un mensaje a consola y no hace nada mas — borrarlo si ya no se usa.

## Tabla por plugin (hallazgos Alta / Media / Baja)

Solo plugins con hallazgos. Los 64 plugins se revisaron.

| Plugin | Alta | Media | Baja |
|---|---|---|---|
| DbrAldeasPlugin | 0 | 0 | 1 |
| DbrBallClickerPlugin | 0 | 0 | 1 |
| DbrBattlePassPlugin | 0 | 1 | 2 |
| DbrBendicionPlugin | 0 | 1 | 0 |
| DbrCasinoPlugin | 0 | 0 | 4 |
| DbrClansPlugin | 0 | 0 | 1 |
| DbrCombatPlugin | 0 | 0 | 1 |
| DbrCombatTagPlugin | 0 | 0 | 1 |
| DbrCorePlugin | 0 | 0 | 1 |
| DbrDiagPlugin | 0 | 0 | 1 |
| DbrDoomPlugin | 0 | 0 | 1 |
| DbrEquipoPlugin | 0 | 0 | 1 |
| DbrFoodPlugin | 0 | 0 | 1 |
| DbrFormasPlugin | 0 | 0 | 1 |
| DbrGachaPlugin | 0 | 1 | 2 |
| DbrGuiaPlugin | 0 | 0 | 1 |
| DbrIdiomaPlugin | 0 | 0 | 1 |
| DbrInvasionPlugin | 0 | 0 | 1 |
| DbrIslaPlugin | 0 | 0 | 2 |
| DbrKiPlugin | 0 | 0 | 1 |
| DbrLogrosPlugin | 0 | 1 | 0 |
| DbrMenuPlugin | 0 | 0 | 1 |
| DbrPetsPlugin | 0 | 0 | 1 |
| DbrPlugin | 0 | 1 | 1 |
| DbrPoderPlugin | 0 | 2 | 0 |
| DbrQuestionPlugin | 0 | 1 | 0 |
| DbrQuickShop | 0 | 0 | 2 |
| DbrRebirthPlugin | 0 | 0 | 1 |
| DbrRepararPlugin | 0 | 0 | 1 |
| DbrSenzuPlugin | 0 | 0 | 1 |
| DbrStackPlugin | 0 | 0 | 2 |
| DbrStaffPlugin | 0 | 2 | 2 |
| DbrTagPlugin | 0 | 0 | 1 |
| DbrTalentosPlugin | 0 | 0 | 2 |
| DbrTierraPlugin | 0 | 0 | 1 |
| DbrTopsPlugin | 0 | 0 | 1 |
| DbrTradePlugin | 0 | 0 | 1 |
| DbrTutorialPlugin | 0 | 0 | 1 |
| DbrViajesPlugin | 0 | 0 | 1 |
| DbrVoicePlugin | 0 | 0 | 1 |
| **Total** | **0** | **10*** | **46** |

\* Los hallazgos Media 1 (2 plugins), 2 (2 plugins) y 4 (3 plugins) afectan a varios plugins; por eso 10 entradas por plugin corresponden a 6 hallazgos distintos.

## Notas

- Plugins sin hallazgos: los 64 menos los de la tabla (DbrAnnouncesPlugin, DbrAntiCommand, DbrArenaPlugin, DbrBackpacksPlugin, DbrBatallasPlugin, DbrCofreMagicoPlugin, DbrCouponsPlugin, DbrCreadoresPlugin, DbrDatabasePlugin, DbrDojosPlugin, DbrEleccionesPlugin, DbrExcavacionesPlugin, DbrForjaPlugin, DbrHologramasPlugin, DbrLabsPlugin, DbrMaestriasPlugin, DbrMiningPlugin, DbrMoonsPlugin, DbrQuestsPlugin, DbrRaceLockPlugin, DbrRuletaPlugin, DbrSellosPlugin, DbrShieldKiPlugin, DbrTPersonalPlugin, DbrTpsItemPlugin).
- Colisiones contra Essentials/vanilla: solo DbrStaff (Media 5) y los nombres genericos de Baja; el resto de comandos de jugador no choca con la lista usada (home, spawn, warp, bal, pay, msg, tp, kit, etc.).
- Limite del metodo: al ser estatico no se probo el arranque. Para confirmar fantasmas y choques en vivo, revisar el log de `onEnable` (avisos "no esta en plugin.yml") con el servidor TESTEO.
