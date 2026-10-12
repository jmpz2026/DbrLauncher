// Textos del launcher en castellano, inglés y portugués de Brasil. El idioma es el mismo que
// el del juego (lang: de options.txt): elegirlo en el launcher cambia los dos, y si el jugador
// lo cambia dentro de Minecraft el launcher lo sigue al volver a abrirse. Lo comparten main
// (errores) y renderer (pantallas).

export type Lang = 'es' | 'en' | 'pt'

export const LANGS: Lang[] = ['es', 'en', 'pt']

/** Código de idioma de Minecraft 1.7.10 que corresponde a cada idioma del launcher. */
export const MC_LANG: Record<Lang, string> = { es: 'es_ES', en: 'en_US', pt: 'pt_BR' }

/** Nombre de cada idioma en sí mismo (para el selector). */
export const LANG_NAME: Record<Lang, string> = { es: 'Español', en: 'English', pt: 'Português' }

/**
 * Idioma del launcher para un código de Minecraft ("pt_PT", "es_MX") o un locale del sistema
 * ("pt-BR", "es-419"). Misma cadena que el servidor: es_* castellano, pt_* portugués de
 * Brasil y el resto inglés.
 */
export function langDe(codigo: string | null | undefined): Lang {
  const c = (codigo || '').toLowerCase()
  if (c.startsWith('es')) return 'es'
  if (c.startsWith('pt')) return 'pt'
  return 'en'
}

/** Estado del idioma que main le pasa al renderer. */
export interface IdiomaInfo {
  lang: Lang
  /** lang: del options.txt del juego, o null si todavía no existe. */
  juego: string | null
}

type Textos = Record<Lang, string>

const T = {
  // Comunes
  'comun.cargando': { es: 'Cargando', en: 'Loading', pt: 'Carregando' },
  'comun.preparando': { es: 'Preparando…', en: 'Preparing…', pt: 'Preparando…' },
  'comun.cerrar': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },
  'comun.copiar': { es: 'Copiar', en: 'Copy', pt: 'Copiar' },
  'comun.copiado': { es: 'Copiado', en: 'Copied', pt: 'Copiado' },
  'comun.cancelar': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'comun.instalando': { es: 'Instalando…', en: 'Installing…', pt: 'Instalando…' },
  'comun.error': { es: 'Error', en: 'Error', pt: 'Erro' },
  'comun.error_desconocido': { es: 'Error desconocido', en: 'Unknown error', pt: 'Erro desconhecido' },

  // Barra de título y navegación
  'titulo.salir': { es: 'Salir', en: 'Log out', pt: 'Sair' },
  'titulo.cerrar_sesion': { es: 'Cerrar sesión', en: 'Log out', pt: 'Encerrar sessão' },
  'titulo.minimizar': { es: 'Minimizar', en: 'Minimize', pt: 'Minimizar' },
  'titulo.idioma': { es: 'Idioma del launcher y del juego', en: 'Launcher and game language', pt: 'Idioma do launcher e do jogo' },
  'nav.jugar': { es: 'Jugar', en: 'Play', pt: 'Jogar' },
  'nav.ajustes': { es: 'Ajustes', en: 'Settings', pt: 'Ajustes' },
  'nav.carpeta': { es: 'Carpeta', en: 'Folder', pt: 'Pasta' },
  'nav.discord': { es: 'Únete al Discord', en: 'Join the Discord', pt: 'Entre no Discord' },

  // Login
  'login.elige': { es: 'Elige cómo entrar', en: 'Choose how to log in', pt: 'Escolha como entrar' },
  'login.titulo': { es: 'Iniciar sesión', en: 'Log in', pt: 'Entrar' },
  'login.no_premium_desc': {
    es: 'Sin cuenta de Mojang. Solo elige tu nombre en el servidor.',
    en: 'No Mojang account needed. Just pick your name on the server.',
    pt: 'Sem conta da Mojang. Só escolha seu nome no servidor.'
  },
  'login.tu_nombre': { es: 'Tu nombre', en: 'Your name', pt: 'Seu nome' },
  'login.entrar': { es: 'Entrar', en: 'Log in', pt: 'Entrar' },
  'login.premium_desc': {
    es: 'Cuenta oficial de Minecraft (Microsoft). Se abrirá tu navegador.',
    en: 'Official Minecraft account (Microsoft). Your browser will open.',
    pt: 'Conta oficial do Minecraft (Microsoft). Seu navegador vai abrir.'
  },
  'login.conectando': { es: 'Conectando…', en: 'Connecting…', pt: 'Conectando…' },
  'login.con_microsoft': { es: 'Entrar con Microsoft', en: 'Log in with Microsoft', pt: 'Entrar com Microsoft' },
  'login.abre': { es: 'Abre', en: 'Open', pt: 'Abra' },
  'login.introduce_codigo': {
    es: 'e introduce este código:',
    en: 'and enter this code:',
    pt: 'e digite este código:'
  },
  'login.esperando': { es: 'Esperando autorización', en: 'Waiting for authorization', pt: 'Aguardando autorização' },

  // Inicio
  'home.bienvenido': { es: 'Bienvenido de vuelta', en: 'Welcome back', pt: 'Bem-vindo de volta' },
  'home.jugador': { es: 'Jugador', en: 'Player', pt: 'Jogador' },
  'home.jugando': { es: 'Jugando…', en: 'Playing…', pt: 'Jogando…' },
  'home.sincronizando': { es: 'Sincronizando…', en: 'Syncing…', pt: 'Sincronizando…' },
  'home.jugar': { es: 'Jugar', en: 'Play', pt: 'Jogar' },
  'home.experimental': {
    es: 'Modpack experimental activo: no está diseñado para jugar en el servidor. Cámbialo en Ajustes para jugar normal.',
    en: 'Experimental modpack active: it is not meant for playing on the server. Change it in Settings to play normally.',
    pt: 'Modpack experimental ativo: não foi feito para jogar no servidor. Troque em Ajustes para jogar normalmente.'
  },
  'home.crash': {
    es: 'El juego se cerró con errores en el último arranque',
    en: 'The game closed with errors the last time it ran',
    pt: 'O jogo fechou com erros na última vez que abriu'
  },
  'home.ver_log': { es: 'Ver log', en: 'View log', pt: 'Ver log' },
  'home.descartar': { es: 'Descartar', en: 'Dismiss', pt: 'Descartar' },
  'home.en_marcha': { es: 'Minecraft en marcha', en: 'Minecraft is running', pt: 'Minecraft em execução' },
  'home.mods_al_dia': { es: 'Mods al día', en: 'Mods up to date', pt: 'Mods em dia' },
  'home.listo_version': {
    es: 'Listo · v{version} — {updated} actualizados',
    en: 'Ready · v{version} — {updated} updated',
    pt: 'Pronto · v{version} — {updated} atualizados'
  },
  'home.eliminados': { es: ', {n} eliminados', en: ', {n} removed', pt: ', {n} removidos' },
  'home.servidor': { es: 'Servidor…', en: 'Server…', pt: 'Servidor…' },
  'home.en_linea': { es: '{players}/{max} en línea', en: '{players}/{max} online', pt: '{players}/{max} online' },
  'home.servidor_offline': { es: 'Servidor offline', en: 'Server offline', pt: 'Servidor offline' },

  // Progreso del lanzamiento
  'launch.version': { es: 'Resolviendo versión', en: 'Resolving version', pt: 'Resolvendo versão' },
  'launch.libraries': { es: 'Descargando librerías', en: 'Downloading libraries', pt: 'Baixando bibliotecas' },
  'launch.natives': { es: 'Extrayendo natives', en: 'Extracting natives', pt: 'Extraindo natives' },
  'launch.assets': { es: 'Descargando assets', en: 'Downloading assets', pt: 'Baixando assets' },
  'launch.client': { es: 'Descargando cliente', en: 'Downloading client', pt: 'Baixando cliente' },
  'launch.java': { es: 'Preparando Java', en: 'Preparing Java', pt: 'Preparando Java' },
  'launch.launching': { es: 'Arrancando Minecraft', en: 'Starting Minecraft', pt: 'Iniciando Minecraft' },
  'launch.running': { es: 'En marcha', en: 'Running', pt: 'Em execução' },

  // Progreso de la sincronización
  'sync.comprobando': { es: 'Comprobando archivos…', en: 'Checking files…', pt: 'Verificando arquivos…' },
  'sync.descargando_archivo': {
    es: 'Descargando {file}{others} — {done}/{total}',
    en: 'Downloading {file}{others} — {done}/{total}',
    pt: 'Baixando {file}{others} — {done}/{total}'
  },
  'sync.descargando': { es: 'Descargando — {done}/{total}', en: 'Downloading — {done}/{total}', pt: 'Baixando — {done}/{total}' },
  'sync.limpiando': { es: 'Limpiando {done}/{total}', en: 'Cleaning up {done}/{total}', pt: 'Limpando {done}/{total}' },
  'sync.listo': { es: 'Listo', en: 'Done', pt: 'Pronto' },

  // Ajustes
  'ajustes.titulo': { es: 'Ajustes', en: 'Settings', pt: 'Ajustes' },
  'ajustes.idioma': { es: 'Idioma', en: 'Language', pt: 'Idioma' },
  'ajustes.idioma_desc': {
    es: 'Cambia el idioma del launcher y el del juego. El servidor te habla en el idioma de tu Minecraft.',
    en: 'Changes the language of the launcher and of the game. The server talks to you in your Minecraft language.',
    pt: 'Muda o idioma do launcher e do jogo. O servidor fala com você no idioma do seu Minecraft.'
  },
  'ajustes.idioma_otro': {
    es: 'Ahora el juego está en {juego} (elegido dentro de Minecraft); el launcher se muestra en inglés.',
    en: 'The game is currently in {juego} (chosen inside Minecraft); the launcher is shown in English.',
    pt: 'Agora o jogo está em {juego} (escolhido dentro do Minecraft); o launcher aparece em inglês.'
  },
  'ajustes.ram': { es: 'Memoria RAM', en: 'RAM', pt: 'Memória RAM' },
  'ajustes.ram_equipo': {
    es: 'Tu equipo tiene {total} GB. Máximo asignable: {max} GB (se reservan 2 GB para el sistema).',
    en: 'Your computer has {total} GB. Maximum you can assign: {max} GB (2 GB are kept for the system).',
    pt: 'Seu computador tem {total} GB. Máximo que pode usar: {max} GB (2 GB ficam para o sistema).'
  },
  'ajustes.ram_generico': {
    es: 'Asigna solo parte de tu RAM; deja memoria libre para el sistema.',
    en: 'Assign only part of your RAM; leave some free for the system.',
    pt: 'Use só parte da sua RAM; deixe memória livre para o sistema.'
  },
  'ajustes.ram_maximo': {
    es: ' Estás en el máximo recomendado para tu equipo.',
    en: ' You are at the recommended maximum for your computer.',
    pt: ' Você está no máximo recomendado para o seu computador.'
  },
  'ajustes.creditos': { es: 'Créditos y permisos', en: 'Credits and permissions', pt: 'Créditos e permissões' },
  'ajustes.credito_npcdbc': {
    es: 'Gracias a KAMKEEL (Kam), autor del addon junto con bigguy345 (Goatee) y somehussar (Hussar), por permitirnos distribuir a los jugadores, a través de este launcher, nuestra versión modificada (un fork no oficial) con los créditos a sus autores. Concedido el 05/10/2026.',
    en: 'Thanks to KAMKEEL (Kam), author of the addon together with bigguy345 (Goatee) and somehussar (Hussar), for allowing us to distribute to players, through this launcher, our modified version (an unofficial fork) with credit to its authors. Granted on 2026-10-05.',
    pt: 'Obrigado a KAMKEEL (Kam), autor do addon junto com bigguy345 (Goatee) e somehussar (Hussar), por nos permitir distribuir aos jogadores, por meio deste launcher, a nossa versão modificada (um fork não oficial) com os créditos aos autores. Concedido em 05/10/2026.'
  },
  'ajustes.credito_jingames': {
    es: 'Gracias a Benjámin Nagy (Ben), de JinGames, autores de Dragon Block C, JRMCore, JBRA Client, Family C y Years C, por permitirnos crear y usar addons que extienden sus mods. Concedido el 06/10/2026. Sus mods se usan sin modificar.',
    en: 'Thanks to Benjámin Nagy (Ben), of JinGames, authors of Dragon Block C, JRMCore, JBRA Client, Family C and Years C, for allowing us to create and use addons that extend their mods. Granted on 2026-10-06. Their mods are used unmodified.',
    pt: 'Obrigado a Benjámin Nagy (Ben), da JinGames, autores de Dragon Block C, JRMCore, JBRA Client, Family C e Years C, por nos permitir criar e usar addons que estendem os mods deles. Concedido em 06/10/2026. Os mods deles são usados sem modificações.'
  },
  'ajustes.proyecto_original': { es: 'Proyecto original', en: 'Original project', pt: 'Projeto original' },
  'ajustes.nuestro_fork': { es: 'Nuestro fork', en: 'Our fork', pt: 'Nosso fork' },
  'ajustes.independiente': {
    es: 'Dragon Block Resurrection es un proyecto independiente: no está afiliado a JinGames ni a KAMKEEL.',
    en: 'Dragon Block Resurrection is an independent project: it is not affiliated with JinGames or KAMKEEL.',
    pt: 'Dragon Block Resurrection é um projeto independente: não tem vínculo com a JinGames nem com KAMKEEL.'
  },
  'ajustes.diagnostico': { es: 'Diagnóstico', en: 'Diagnostics', pt: 'Diagnóstico' },
  'ajustes.diagnostico_desc': {
    es: 'Revisa el log del último arranque del juego si algo falló.',
    en: 'Check the log of the last game launch if something went wrong.',
    pt: 'Veja o log da última abertura do jogo se algo deu errado.'
  },
  'ajustes.ver_ultimo_log': { es: 'Ver último log', en: 'View last log', pt: 'Ver último log' },
  'ajustes.modpack': { es: 'Versión del modpack', en: 'Modpack version', pt: 'Versão do modpack' },
  'ajustes.full': { es: 'Completo', en: 'Full', pt: 'Completo' },
  'ajustes.full_desc': { es: 'Todos los mods (recomendado)', en: 'All mods (recommended)', pt: 'Todos os mods (recomendado)' },
  'ajustes.lite': { es: 'Lite', en: 'Lite', pt: 'Lite' },
  'ajustes.lite_desc': { es: 'Menos mods, para equipos justos', en: 'Fewer mods, for low-end computers', pt: 'Menos mods, para computadores mais fracos' },
  'ajustes.experimental': { es: 'Experimental', en: 'Experimental', pt: 'Experimental' },
  'ajustes.experimental_desc': {
    es: 'Mods en pruebas, no para el servidor',
    en: 'Mods being tested, not for the server',
    pt: 'Mods em teste, não para o servidor'
  },
  'ajustes.modpack_nota': {
    es: 'Al cambiar de versión, los mods se re-sincronizan la próxima vez que le des a Jugar.',
    en: 'When you change version, the mods are synced again the next time you press Play.',
    pt: 'Ao trocar de versão, os mods são sincronizados de novo na próxima vez que você clicar em Jogar.'
  },
  'ajustes.cambiar_a': { es: 'Cambiar a {variante}', en: 'Switch to {variante}', pt: 'Mudar para {variante}' },
  'ajustes.exp_aviso': {
    es: 'Esta versión NO está diseñada para jugar en el servidor.',
    en: 'This version is NOT meant for playing on the server.',
    pt: 'Esta versão NÃO foi feita para jogar no servidor.'
  },
  'ajustes.exp_detalle': {
    es: 'Trae mods en pruebas para que los testees. Puede fallar, perder datos de tu configuración o no dejarte entrar al servidor. Para jugar normal, vuelve a Completo o Lite.',
    en: 'It brings mods being tested so you can try them. It may fail, lose your settings or not let you join the server. To play normally, go back to Full or Lite.',
    pt: 'Traz mods em teste para você testar. Pode falhar, perder dados da sua configuração ou não deixar você entrar no servidor. Para jogar normalmente, volte para Completo ou Lite.'
  },
  'ajustes.exp_entiendo': {
    es: 'Entiendo que no es para jugar en el servidor',
    en: 'I understand it is not for playing on the server',
    pt: 'Entendo que não é para jogar no servidor'
  },
  'ajustes.config_recomendada': {
    es: '¿Quieres aplicar también la configuración recomendada de esta versión (opciones gráficas y ajustes de mods)? Sobrescribe la configuración que tengas ahora.',
    en: 'Do you also want to apply the recommended settings of this version (graphics options and mod settings)? It overwrites your current settings.',
    pt: 'Quer aplicar também a configuração recomendada desta versão (opções gráficas e ajustes dos mods)? Ela substitui a configuração que você tem agora.'
  },
  'ajustes.si_aplicar': { es: 'Sí, aplicarla', en: 'Yes, apply it', pt: 'Sim, aplicar' },
  'ajustes.conservar': { es: 'Conservar la mía', en: 'Keep mine', pt: 'Manter a minha' },
  'ajustes.autosync': { es: 'Actualización automática de mods', en: 'Automatic mod updates', pt: 'Atualização automática dos mods' },
  'ajustes.autosync_on': {
    es: 'Al dar Jugar se descargan e instalan los últimos mods del servidor.',
    en: 'When you press Play, the latest server mods are downloaded and installed.',
    pt: 'Ao clicar em Jogar, os mods mais recentes do servidor são baixados e instalados.'
  },
  'ajustes.autosync_off': {
    es: 'Desactivada: se juega con los mods ya instalados, sin descargar cambios.',
    en: 'Off: you play with the mods already installed, without downloading changes.',
    pt: 'Desativada: você joga com os mods já instalados, sem baixar mudanças.'
  },
  'ajustes.activada': { es: 'Activada', en: 'On', pt: 'Ativada' },
  'ajustes.desactivada': { es: 'Desactivada', en: 'Off', pt: 'Desativada' },
  'ajustes.ventana': { es: 'Ventana y JVM', en: 'Window and JVM', pt: 'Janela e JVM' },
  'ajustes.ancho': { es: 'Ancho', en: 'Width', pt: 'Largura' },
  'ajustes.alto': { es: 'Alto', en: 'Height', pt: 'Altura' },
  'ajustes.pantalla_completa': { es: 'Pantalla completa', en: 'Fullscreen', pt: 'Tela cheia' },
  'ajustes.jvm': { es: 'Argumentos JVM extra', en: 'Extra JVM arguments', pt: 'Argumentos extras da JVM' },
  'ajustes.java': { es: 'Java 8 (runtime)', en: 'Java 8 (runtime)', pt: 'Java 8 (runtime)' },
  'ajustes.java_no_instalado': { es: 'No instalado', en: 'Not installed', pt: 'Não instalado' },
  'ajustes.java_descargando': { es: 'Descargando… {pct}%', en: 'Downloading… {pct}%', pt: 'Baixando… {pct}%' },
  'ajustes.java_extrayendo': { es: 'Extrayendo…', en: 'Extracting…', pt: 'Extraindo…' },
  'ajustes.java_verificando': { es: 'Verificando…', en: 'Verifying…', pt: 'Verificando…' },
  'ajustes.java_listo': {
    es: 'Listo. Se usará para lanzar Minecraft 1.7.10.',
    en: 'Ready. It will be used to launch Minecraft 1.7.10.',
    pt: 'Pronto. Será usado para abrir o Minecraft 1.7.10.'
  },
  'ajustes.java_auto': {
    es: 'Se descargará automáticamente (Temurin/Adoptium) según tu sistema.',
    en: 'It will be downloaded automatically (Temurin/Adoptium) for your system.',
    pt: 'Será baixado automaticamente (Temurin/Adoptium) para o seu sistema.'
  },
  'ajustes.java_reinstalar': { es: 'Reinstalar', en: 'Reinstall', pt: 'Reinstalar' },
  'ajustes.java_descargar': { es: 'Descargar Java 8', en: 'Download Java 8', pt: 'Baixar Java 8' },

  // Visor de log
  'log.titulo': { es: 'Log del juego', en: 'Game log', pt: 'Log do jogo' },
  'log.vacio': { es: 'No hay log del último arranque.', en: 'There is no log from the last launch.', pt: 'Não há log da última abertura.' },
  'log.abrir_carpeta': { es: 'Abrir carpeta', en: 'Open folder', pt: 'Abrir pasta' },

  // Propuesta de Lite
  'lite.titulo': { es: 'Tu equipo parece justo', en: 'Your computer seems low-end', pt: 'Seu computador parece fraco' },
  'lite.texto': {
    es: '¿Pasar a la versión Lite? Usa ajustes gráficos más ligeros y activa el modo ligero del juego, así irá más fluido. Aplica su configuración recomendada (opciones gráficas y ajustes de mods). Puedes volver a Completo cuando quieras desde Ajustes.',
    en: 'Switch to the Lite version? It uses lighter graphics settings and turns on the game\'s light mode, so it runs smoother. It applies its recommended settings (graphics options and mod settings). You can go back to Full whenever you want from Settings.',
    pt: 'Mudar para a versão Lite? Ela usa ajustes gráficos mais leves e ativa o modo leve do jogo, assim fica mais fluido. Aplica a configuração recomendada dela (opções gráficas e ajustes dos mods). Você pode voltar para Completo quando quiser em Ajustes.'
  },
  'lite.pasar': { es: 'Pasar a Lite', en: 'Switch to Lite', pt: 'Mudar para Lite' },
  'lite.seguir': { es: 'Seguir en Completo', en: 'Stay on Full', pt: 'Continuar no Completo' },
  'lite.motivo_juego': {
    es: 'El juego activó su modo ligero en este equipo.',
    en: 'The game turned on its light mode on this computer.',
    pt: 'O jogo ativou o modo leve neste computador.'
  },
  'lite.detectado': { es: 'Detectado: {senales}.', en: 'Detected: {senales}.', pt: 'Detectado: {senales}.' },
  'lite.ram': { es: '{gb} GB de RAM', en: '{gb} GB of RAM', pt: '{gb} GB de RAM' },
  'lite.nucleos': { es: '{n} núcleos', en: '{n} cores', pt: '{n} núcleos' },
  'lite.gpu_software': { es: 'GPU por software', en: 'software GPU', pt: 'GPU por software' },
  'lite.gpu_antigua': { es: 'GPU integrada antigua', en: 'old integrated GPU', pt: 'GPU integrada antiga' },

  // Actualización del launcher
  'update.descargando': { es: 'Descargando actualización…', en: 'Downloading update…', pt: 'Baixando atualização…' },
  'update.reiniciando': { es: 'Reiniciando…', en: 'Restarting…', pt: 'Reiniciando…' },
  'update.lista': { es: 'Lista para instalar', en: 'Ready to install', pt: 'Pronta para instalar' },
  'update.titulo': { es: 'Actualizando launcher', en: 'Updating launcher', pt: 'Atualizando launcher' },
  'update.reintentar': { es: 'Reintentar', en: 'Try again', pt: 'Tentar de novo' },
  'update.ahora': { es: 'Actualizar ahora', en: 'Update now', pt: 'Atualizar agora' },
  'update.fallo': {
    es: 'No se pudo instalar. Vuelve a intentarlo e introduce tu contraseña.',
    en: 'Could not install. Try again and enter your password.',
    pt: 'Não foi possível instalar. Tente de novo e digite sua senha.'
  },
  'update.password': {
    es: 'Se pedirá la contraseña de tu usuario para instalar el paquete.',
    en: 'Your user password will be asked to install the package.',
    pt: 'A senha do seu usuário será pedida para instalar o pacote.'
  },

  // libfuse2 (Linux)
  'fuse.titulo': { es: 'Falta libfuse2', en: 'libfuse2 is missing', pt: 'Falta a libfuse2' },
  'fuse.texto': {
    es: 'Tu sistema no tiene libfuse2. Sin ella el launcher puede no abrir con doble-click. Instálala para que funcione y se actualice bien.',
    en: 'Your system does not have libfuse2. Without it the launcher may not open with a double-click. Install it so it works and updates properly.',
    pt: 'Seu sistema não tem a libfuse2. Sem ela o launcher pode não abrir com clique duplo. Instale para que funcione e atualize direito.'
  },
  'fuse.instalar': { es: 'Instalar ahora', en: 'Install now', pt: 'Instalar agora' },
  'fuse.no_instalada': { es: 'No se pudo instalar', en: 'Could not install', pt: 'Não foi possível instalar' },
  'fuse.solo_linux': { es: 'Solo disponible en Linux', en: 'Only available on Linux', pt: 'Disponível só no Linux' },
  'fuse.distro': { es: 'Distribución no reconocida', en: 'Unrecognized distribution', pt: 'Distribuição não reconhecida' },

  // Errores de main
  'err.nombre': {
    es: 'El nombre debe tener 3-16 caracteres: letras, números o guion bajo.',
    en: 'The name must have 3-16 characters: letters, numbers or underscore.',
    pt: 'O nome deve ter de 3 a 16 caracteres: letras, números ou sublinhado.'
  },
  'err.ms_iniciar': {
    es: 'No se pudo iniciar el login de Microsoft: {detalle}',
    en: 'Could not start the Microsoft login: {detalle}',
    pt: 'Não foi possível iniciar o login da Microsoft: {detalle}'
  },
  'err.ms_cancelado': { es: 'Autorización cancelada en Microsoft.', en: 'Authorization cancelled on Microsoft.', pt: 'Autorização cancelada na Microsoft.' },
  'err.ms_expiro': { es: 'El código expiró. Intenta de nuevo.', en: 'The code expired. Try again.', pt: 'O código expirou. Tente de novo.' },
  'err.ms_error': { es: 'Error de Microsoft: {detalle}', en: 'Microsoft error: {detalle}', pt: 'Erro da Microsoft: {detalle}' },
  'err.ms_sesion': {
    es: 'La sesión de Microsoft expiró. Vuelve a iniciar sesión.',
    en: 'The Microsoft session expired. Log in again.',
    pt: 'A sessão da Microsoft expirou. Entre de novo.'
  },
  'err.xbox': { es: 'Fallo al autenticar con Xbox Live.', en: 'Xbox Live authentication failed.', pt: 'Falha ao autenticar no Xbox Live.' },
  'err.xbox_sin_perfil': {
    es: 'Esta cuenta Microsoft no tiene un perfil de Xbox. Crea uno en xbox.com.',
    en: 'This Microsoft account has no Xbox profile. Create one at xbox.com.',
    pt: 'Esta conta Microsoft não tem perfil do Xbox. Crie um em xbox.com.'
  },
  'err.xbox_pais': {
    es: 'Xbox Live no está disponible en tu país/región.',
    en: 'Xbox Live is not available in your country/region.',
    pt: 'O Xbox Live não está disponível no seu país/região.'
  },
  'err.xbox_adulto': {
    es: 'La cuenta requiere verificación de adulto (South Korea).',
    en: 'The account requires adult verification (South Korea).',
    pt: 'A conta exige verificação de adulto (South Korea).'
  },
  'err.xbox_menor': {
    es: 'Cuenta de menor: debe añadirse a una Familia para usar Xbox Live.',
    en: 'Child account: it must be added to a Family to use Xbox Live.',
    pt: 'Conta de menor: precisa ser adicionada a uma Família para usar o Xbox Live.'
  },
  'err.xsts': { es: 'Fallo de autorización XSTS con Xbox Live.', en: 'Xbox Live XSTS authorization failed.', pt: 'Falha de autorização XSTS no Xbox Live.' },
  'err.mc_login': {
    es: 'Fallo al iniciar sesión en los servicios de Minecraft.',
    en: 'Failed to log in to the Minecraft services.',
    pt: 'Falha ao entrar nos serviços do Minecraft.'
  },
  'err.mc_sin_juego': {
    es: 'Esta cuenta Microsoft no posee Minecraft: Java Edition.',
    en: 'This Microsoft account does not own Minecraft: Java Edition.',
    pt: 'Esta conta Microsoft não tem o Minecraft: Java Edition.'
  },
  'err.mc_perfil': {
    es: 'No se pudo obtener el perfil de Minecraft.',
    en: 'Could not get the Minecraft profile.',
    pt: 'Não foi possível obter o perfil do Minecraft.'
  },
  'err.sin_sesion': { es: 'No hay sesión iniciada.', en: 'You are not logged in.', pt: 'Você não está logado.' },
  'err.java_descarga': { es: 'Descarga de Java falló ({status}).', en: 'Java download failed ({status}).', pt: 'O download do Java falhou ({status}).' },
  'err.java_no_8': {
    es: 'El runtime descargado no es Java 8: {detalle}',
    en: 'The downloaded runtime is not Java 8: {detalle}',
    pt: 'O runtime baixado não é Java 8: {detalle}'
  },
  'err.java_iniciar': { es: 'No se pudo iniciar java: {detalle}', en: 'Could not start java: {detalle}', pt: 'Não foi possível iniciar o java: {detalle}' },
  'err.manifest': {
    es: 'No se pudo descargar el manifest ({status}).',
    en: 'Could not download the manifest ({status}).',
    pt: 'Não foi possível baixar o manifest ({status}).'
  },
  'err.descarga': { es: 'Descarga falló ({status}): {url}', en: 'Download failed ({status}): {url}', pt: 'O download falhou ({status}): {url}' },
  'err.conectar': { es: 'No se pudo conectar con {host}: {detalle}', en: 'Could not connect to {host}: {detalle}', pt: 'Não foi possível conectar a {host}: {detalle}' },
  'err.ping_timeout': { es: 'Tiempo de espera agotado', en: 'Timed out', pt: 'Tempo esgotado' },
  'err.ping_invalido': { es: 'Respuesta inválida del servidor', en: 'Invalid response from the server', pt: 'Resposta inválida do servidor' },

  // Pistas de errores de red (main/http.ts)
  'red.ERR_NAME_NOT_RESOLVED': {
    es: 'el DNS no resolvió el dominio (tu proveedor de internet puede estar bloqueándolo; prueba con DNS 1.1.1.1)',
    en: 'DNS did not resolve the domain (your internet provider may be blocking it; try DNS 1.1.1.1)',
    pt: 'o DNS não resolveu o domínio (seu provedor de internet pode estar bloqueando; tente o DNS 1.1.1.1)'
  },
  'red.ERR_INTERNET_DISCONNECTED': { es: 'no hay conexión a internet', en: 'there is no internet connection', pt: 'não há conexão com a internet' },
  'red.ERR_CONNECTION_TIMED_OUT': {
    es: 'la conexión expiró (red lenta o firewall)',
    en: 'the connection timed out (slow network or firewall)',
    pt: 'a conexão expirou (rede lenta ou firewall)'
  },
  'red.ERR_CONNECTION_REFUSED': { es: 'el servidor rechazó la conexión', en: 'the server refused the connection', pt: 'o servidor recusou a conexão' },
  'red.ERR_CONNECTION_RESET': {
    es: 'la conexión se cortó a mitad (firewall o antivirus)',
    en: 'the connection was cut halfway (firewall or antivirus)',
    pt: 'a conexão caiu no meio (firewall ou antivírus)'
  },
  'red.ERR_CERT_AUTHORITY_INVALID': {
    es: 'certificado no confiable: desactiva el escaneo HTTPS/SSL de tu antivirus o añade su certificado al sistema',
    en: 'untrusted certificate: turn off the HTTPS/SSL scanning of your antivirus or add its certificate to the system',
    pt: 'certificado não confiável: desative a verificação HTTPS/SSL do seu antivírus ou adicione o certificado dele ao sistema'
  },
  'red.ERR_CERT_COMMON_NAME_INVALID': {
    es: 'el certificado no corresponde al dominio (algo está interceptando la conexión)',
    en: 'the certificate does not match the domain (something is intercepting the connection)',
    pt: 'o certificado não corresponde ao domínio (algo está interceptando a conexão)'
  },
  'red.ERR_CERT_DATE_INVALID': {
    es: 'certificado fuera de fecha: revisa la fecha y hora de tu PC',
    en: 'certificate out of date: check the date and time of your PC',
    pt: 'certificado fora da validade: confira a data e a hora do seu PC'
  },
  'red.ERR_SSL_PROTOCOL_ERROR': {
    es: 'fallo de TLS (antivirus, proxy o Windows sin actualizar)',
    en: 'TLS failure (antivirus, proxy or outdated Windows)',
    pt: 'falha de TLS (antivírus, proxy ou Windows desatualizado)'
  },
  'red.ERR_PROXY_CONNECTION_FAILED': {
    es: 'el proxy configurado en Windows no responde',
    en: 'the proxy configured in Windows does not respond',
    pt: 'o proxy configurado no Windows não responde'
  },
  'red.sin_respuesta': { es: '{s}s sin respuesta', en: 'no response for {s}s', pt: '{s}s sem resposta' }
} satisfies Record<string, Textos>

export type Clave = keyof typeof T

/** ¿Hay texto para esta clave? (para claves armadas en runtime, como las pistas de red). */
export function existe(clave: string): clave is Clave {
  return Object.prototype.hasOwnProperty.call(T, clave)
}

/** Texto de [clave] en [lang] con {nombre} reemplazado por vars.nombre. */
export function t(lang: Lang, clave: Clave, vars?: Record<string, string | number>): string {
  const texto = T[clave][lang]
  if (!vars) return texto
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}
