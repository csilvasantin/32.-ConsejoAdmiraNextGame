/* admira-idioma-paginas.js — diccionario ES→EN del texto fijo de las subpáginas de www.admira.live
 * (Control, Fleet → /control, Vista previa, Players). 06-10-2026.
 *
 * Carlos (10:11): «sigo sin ver el cambio de idioma». /idioma ENG cambiaba la barra pero no los
 * rótulos propios de cada página. admira-idioma.js lo descarga la primera vez que alguien pide
 * inglés (mismo ?v=) y traduce con esto cada nodo de texto y los title/placeholder/aria-label.
 *  · dicc: frase exacta en castellano (sin el adorno de delante «📸 », «— », ni el cierre «:», «…»).
 *    Una frase «a · b · c» que no esté entera se traduce trozo a trozo.
 *  · reglas: [RegExp, reemplazo | función(m, traducir)] para lo que lleva números.
 * Los datos (nombres, tareas, equipos, misiones) NO se traducen.
 */
(function (G) {
  "use strict";
  var I = G.AdmiraIdioma;
  if (!I || !I.diccionario) return;

  var dicc = {
    // ── Comunes ──
    "Opciones": "Options", "Avanzado": "Advanced", "Experto": "Expert", "OPCIONES": "OPTIONS", "AVANZADO": "ADVANCED", "EXPERTO": "EXPERT",
    "Opciones (izquierda)": "Options (left)", "Avanzado (derecha)": "Advanced (right)", "Modo experto (inferior)": "Expert mode (bottom)",
    "limpiar": "clear", "cerrar": "close", "Cerrar": "Close", "Enviar": "Send", "cambiar": "change", "en vivo": "live", "Leyenda": "Legend",
    "Cargando": "Loading", "Cargando…": "Loading…", "cargando": "loading", "cargando…": "loading…", "conectando…": "connecting…",
    "sin respuesta": "no response", "sin señal": "no signal", "SIN SEÑAL": "NO SIGNAL", "ficha →": "card →", "ficha": "card",
    "Mensaje": "Message", "Sin resultados todavía.": "No results yet.", "Pantalla completa": "Full screen", "Cerrar (Esc)": "Close (Esc)",
    "estado de conexión": "connection status", "sesión": "session", "actualizado por": "updated by", "Siguiente": "Next", "Anterior": "Previous",
    "Hecho": "Done", "En curso": "In progress", "Por hacer": "To do", "Bloqueadas": "Blocked", "Bloqueada": "Blocked",

    // ── Control ──
    "control de la flota · AdmiraNext": "fleet control · AdmiraNext",
    "Acciones de Equipos": "Machine actions", "Capturar todas": "Capture all", "repetir cada": "repeat every",
    "Capturar ahora todas las pantallas online": "Capture all online screens now",
    "Repetir la captura automáticamente cada X segundos": "Repeat the capture automatically every X seconds",
    "Mosaico": "Mosaic", "Pared de pantallas: mosaico a pantalla completa de todas las capturas": "Screen wall: full-screen mosaic of every capture",
    "HACKEO": "HACK", "HACKEO · secuencia de intrusión sobre toda la flota (cinemática + acción real)": "HACK · intrusion sequence over the whole fleet (cinematic + real action)",
    "CONSEJEROS": "COUNSELLORS", "Fondos leyendas por silla: Azul Jobs · Plata Wozniak · Rosa Lucas · Crema Disney": "Legend wallpapers per chair: Blue Jobs · Silver Wozniak · Pink Lucas · Cream Disney",
    "Fondos DeepAgent por silla: Azul Neo · Plata Trinity · Rosa Morfeo · Crema Oráculo": "DeepAgent wallpapers per chair: Blue Neo · Silver Trinity · Pink Morfeo · Cream Oráculo",
    "Elegir a qué equipos afecta el hackeo": "Choose which machines the hack affects", "elegir equipos": "choose machines",
    "Comprueba acceso real, plataforma, player/executor, versión, captura, screen, circuito y heartbeat antes de arrancar": "Checks real access, platform, player/executor, version, capture, screen, circuit and heartbeat before starting",
    "Arrancar DS": "Start DS", "Apagar DS": "Stop DS", "preflight pendiente": "preflight pending",
    "Arranca Digital Signage solo en equipos elegibles tras un preflight real": "Starts Digital Signage only on eligible machines after a real preflight",
    "Para el player de Digital Signage en los equipos que emiten ahora (respeta el desplegable «elegir equipos»)": "Stops the Digital Signage player on the machines broadcasting now (respects the «choose machines» dropdown)",
    "Elegir a qué equipos afecta el botón": "Choose which machines the button affects",
    "Apagar todas": "Turn all off", "ENCENDIDAS": "ON", "APAGADAS": "OFF", "Dormir todos": "Sleep all", "Encender todos": "Wake all",
    "Apagar o encender la pantalla de TODA la flota online (toggle)": "Turn the screen of the WHOLE online fleet off or on (toggle)",
    "Dormir TODOS los equipos online (vuelven con ⚡ Encender todos por Wake-on-LAN)": "Put ALL online machines to sleep (they come back with ⚡ Wake all via Wake-on-LAN)",
    "Encender/despertar TODOS los equipos del censo: los que responden despiertan la pantalla; los dormidos reciben Wake-on-LAN desde un vecino": "Power on/wake ALL machines in the census: responsive ones wake their screen; sleeping ones get Wake-on-LAN from a neighbour",
    "Salva ON": "Saver ON", "Salva OFF": "Saver OFF", "Activar o quitar el salvapantallas en TODA la flota online (toggle)": "Turn the screensaver on or off on the WHOLE online fleet (toggle)",
    "Elegir a qué equipos afecta el salvapantallas": "Choose which machines the screensaver affects",
    "Standby players": "Standby players", "EMITIENDO": "BROADCASTING",
    "Standby/Reactivar los PLAYERS de toda la flota (mac/win/linux/ios/android) por canal de comandos — pone el canal en negro sin cerrar la app": "Standby/Resume the PLAYERS of the whole fleet (mac/win/linux/ios/android) via the command channel — blacks out the channel without closing the app",
    "Mensaje a todos": "Message everyone", "Enviar un mensaje/encargo a TODOS los equipos vivos (broadcast por el router de encargos AdmiraNeXT — con ACK y traza en Telegram)": "Send a message/task to ALL live machines (broadcast through the AdmiraNeXT task router — with ACK and Telegram trace)",
    "Tablero TAREAS": "TASKS board", "Tablero TAREAS — VISOR de las misiones FLT de yokup por máquina (toda la flota): presencia + misiones + enlace a yokup": "TASKS board — VIEWER of yokup FLT missions per machine (whole fleet): presence + missions + yokup link",
    "sonido": "sound", "Beep cuando un equipo se cae o su captura empieza a fallar": "Beep when a machine goes down or its capture starts failing",
    "solo encendidos": "only powered on", "Mostrar solo los equipos encendidos (los apagados se listan al pie)": "Show only powered-on machines (powered-off ones are listed at the bottom)",
    "desplegar todas": "expand all", "Desplegar todas las tarjetas (solo esta visita)": "Expand all cards (this visit only)",
    "arreglar todas": "fix all", "Enviar el arreglo de captura por SSH a todos los equipos que fallan": "Send the capture fix over SSH to every failing machine",
    "para monitorizar qué emite cada pantalla": "to monitor what each screen is broadcasting",
    "MONITOR REMOTO": "REMOTE MONITOR", "Zoom del monitor (útil en pantalla completa con equipos 4K)": "Monitor zoom (useful in full screen with 4K machines)",
    "Mover": "Pan", "Mover — arrastra para desplazar lo que se ve del monitor (solo cuando hay zoom)": "Pan — drag to move the visible part of the monitor (only when zoomed)",
    "Capturar pantalla": "Capture screen", "Captura toda la pantalla remota y la copia al portapapeles": "Captures the whole remote screen and copies it to the clipboard",
    "Pegar": "Paste", "Pegar el portapapeles local en el equipo remoto (lo teclea el agente)": "Paste the local clipboard on the remote machine (the agent types it)",
    "Control Total": "Full Control", "Control Total — teclado y ratón en vivo sobre el equipo, como si estuvieras delante (requiere AdmiraRemoteAgent)": "Full Control — live keyboard and mouse on the machine, as if you were in front of it (requires AdmiraRemoteAgent)",
    "Cerrar el monitor y volver a las zonas": "Close the monitor and go back to the zones",
    "Sillas del Consejo": "Council chairs", "Leyendas": "Legends", "Coetáneos": "Contemporaries", "Racional": "Rational", "Creativo": "Creative",
    "Sillas rojas": "Red chairs", "Sillas azules": "Blue chairs",
    "Ideas": "Ideas", "objetivos ↗": "goals ↗", "objetivos": "goals", "idea": "idea", "IDEAS VIVAS": "LIVE IDEAS", "NORTE POR SILLA": "NORTH STAR PER CHAIR",
    "Rutas y dependencias": "Routes and dependencies",
    "Consola · modo experto": "Console · expert mode", "monitor": "monitor", "ejecutar": "run",
    "Monitor remoto — ver un equipo en vivo en un CRT retro en la zona central": "Remote monitor — watch a machine live on a retro CRT in the central zone",
    "comando shell… (p.ej. uptime; df -h /)": "shell command… (e.g. uptime; df -h /)",
    "El comando se ejecuta de verdad en la máquina elegida (MacMini local · resto por SSH). Acceso por tu login de Google.": "The command really runs on the chosen machine (MacMini local · the rest over SSH). Access via your Google login.",
    "mensajería a equipos": "machine messaging", "tareas (visor yokup)": "tasks (yokup viewer)",
    "Sello único de la página (normativa 07): mensajería, tareas y fichas salen juntas en cada release": "Single page stamp (rule 07): messaging, tasks and cards ship together in every release",
    "Escribe el encargo… (llegará al agente con ACK obligatorio y quedará en la traza de Telegram)": "Write the task… (it reaches the agent with mandatory ACK and stays in the Telegram trace)",
    "Canal: router de encargos AdmiraNeXT · traza viva en": "Channel: AdmiraNeXT task router · live trace at",
    "Pared de pantallas": "Screen wall", "cerrar (Esc)": "close (Esc)", "TAREAS · misiones de la flota": "TASKS · fleet missions",
    "misiones FLT por máquina · fuente única: yokup · clic en una misión → abrir en yokup": "FLT missions per machine · single source: yokup · click a mission → open in yokup",
    "refrescar": "refresh", "Refrescar ahora (se auto-refresca cada 30s)": "Refresh now (auto-refreshes every 30s)",
    "Volver al control": "Back to control", "Volver al panel de control": "Back to the control panel",
    "Velocidad del hackeo en todos los equipos": "Hack speed on every machine", "Qué teclean los terminales": "What the terminals type",
    "Guion de intrusión de siempre": "The usual intrusion script", "INTRUSIÓN": "INTRUSION", "CÓDIGO": "CODE",
    "Código real de www.admira.live, como si se escribiera": "Real www.admira.live code, as if being typed",

    // ── Vista previa ──
    "MISIONES": "MISSIONS", "¿En qué estamos?": "What are we on?", "silicio ↔ carbono": "silicon ↔ carbon",
    "Quién eres (clic para cambiar)": "Who you are (click to change)", "Modo de equipo de la flota": "Fleet team mode",
    "MODO DE EQUIPO": "TEAM MODE", "En qué andamos": "What we're up to", "Tú por tu cuenta": "On your own", "Trabajando": "Working",
    "quién y cuándo lo fijó": "who set it and when", "No se pudo leer": "Could not read", "¿Está el servidor sirviendo la carpeta": "Is the server serving the folder",
    "Opciones · Estado": "Options · Status", "Foco": "Focus", "En qué anda cada agente": "What each agent is doing",
    "Mientras no estabas": "While you were away", "Cerrar aviso «Mientras no estabas»": "Close the «While you were away» notice",
    "LÍNEA DE TIEMPO · HOY": "TIMELINE · TODAY", "Elegir agente": "Choose agent", "Ir a una hora con actividad": "Go to an hour with activity",
    "Vista de agentes": "Agents view", "Vista de tarjetas": "Cards view", "Tarjetas": "Cards", "Vista de listado": "List view", "Listado": "List",
    "Cargando agentes…": "Loading agents…", "Ver todas las misiones FLT y consultar otros días →": "See all FLT missions and check other days →",
    "Este panel muestra coordinación de agentes y tareas del equipo. El registro global está en Misiones.": "This panel shows agent coordination and team tasks. The global log is in Missions.",
    "Tablero de tareas de la flota": "Fleet task board", "Cargando tareas…": "Loading tasks…", "entra con Google para editar": "sign in with Google to edit",
    "Avanzado · desglose de tareas": "Advanced · task breakdown", "Experto · carbono y riesgos": "Expert · carbon and risks",
    "Necesita carbono": "Needs carbon", "pulsa una necesidad y responde aquí (Enter envía al LLM)…": "click a need and answer here (Enter sends to the LLM)…",
    "Enviar la respuesta al LLM": "Send the answer to the LLM", "Riesgos abiertos": "Open risks",
    "¿Quién eres?": "Who are you?", "Elige este equipo para personalizar el tablero. Se recuerda en este navegador. (En el panel local de Claude Code se detecta solo.)": "Choose this machine to personalise the board. It is remembered in this browser. (In the local Claude Code panel it is detected automatically.)",
    "por su cuenta · modo pasivo": "on their own · passive mode", "por su cuenta": "on their own", "modo pasivo": "passive mode",
    "sin reportar foco": "no focus reported", "commit pendiente": "commit pending", "fijado por": "set by",
    "Presentación EN PRODUCCIÓN": "Presentation IN PRODUCTION", "Panel de flota (demo en vivo)": "Fleet panel (live demo)",

    // ── Players ──
    "Mostrar solo online": "Show online only", "Plataforma": "Platform", "Todas las plataformas": "All platforms", "Otras": "Others",
    "Circuito / localización": "Circuit / location", "Todos los circuitos": "All circuits", "Ordenar por": "Sort by",
    "Estado (online primero)": "Status (online first)", "Nombre (A→Z)": "Name (A→Z)", "Intervalo de refresco": "Refresh interval",
    "Previo por tarjeta · modo": "Preview per card · mode", "Contenido en antena": "On-air content", "Captura real (cristal)": "Real capture (glass)",
    "Off (sólo texto)": "Off (text only)", "Refresco del previo": "Preview refresh", "Cada 5 s": "Every 5 s", "Cada 10 s": "Every 10 s", "Cada 30 s": "Every 30 s",
    "Reproducir vídeo (si no, póster)": "Play video (otherwise poster)", "Contenido": "Content", "Captura real": "Real capture",
    "miniatura del creativo que reporta el player.": "thumbnail of the creative reported by the player.",
    "foto del cristal que sube el propio player (fase 2). El refresco aplica a ambos. Vídeo por defecto = póster estático.": "photo of the glass uploaded by the player itself (phase 2). The refresh applies to both. Default video = static poster.",
    "Acción en lote → pantallas visibles": "Batch action → visible screens", "Primera": "First", "Pausa / Play": "Pause / Play", "Última": "Last",
    "Silencio": "Mute", "Volumen −": "Volume −", "Volumen +": "Volume +", "Siempre encima": "Always on top",
    "Envía el comando a TODAS las pantallas del filtro actual": "Sends the command to ALL screens in the current filter",
    "Respeta el filtro (circuito/plataforma/online). Enviará a": "Respects the filter (circuit/platform/online). It will send to", "pantalla(s).": "screen(s).",
    "Umbral «online» (age_seconds)": "«Online» threshold (age_seconds)", "Por encima de este latido la pantalla se marca": "Above this heartbeat the screen is marked as",
    "rezagada": "lagging", "(punto ámbar).": "(amber dot).", "punto ámbar).": "amber dot).", "Mostrar campos técnicos en las tarjetas": "Show technical fields on the cards",
    "online (latido reciente)": "online (recent heartbeat)", "online pero rezagada": "online but lagging",
    "Consola de mando · doble tick + latencia": "Command console · double tick + latency", "colas": "queues",
    "pantallas · último /signage/screens": "screens · last /signage/screens", "(crudo)": "(raw)", "crudo)": "raw)",
    "Equipos emitiendo · mando en vivo · doble tick": "Machines broadcasting · live control · double tick",
    "Canales DS": "DS channels", "flota AdmiraNeXT": "AdmiraNeXT fleet", "Mando remoto de la red · abrir · cerrar · recargar · navegar": "Network remote control · open · close · reload · navigate",
    "Cargando canales DS de la flota…": "Loading the fleet's DS channels…", "Pantallas en antena": "Screens on air", "plano de contenido": "content plane",
    "Lo que emite cada cristal · mando de transporte + previo": "What each glass is broadcasting · transport control + preview",
    "Cargando pantallas vivas…": "Loading live screens…", "en antena": "on air",
    "Sin equipos que mostrar. El backend de flota respondió vacío.": "No machines to show. The fleet backend returned nothing.",
    "Recarga la página para entrar con tu cuenta de Google.": "Reload the page to sign in with your Google account.",
    "Encender todas": "Turn all on", "Reactivar players": "Resume players", "capturando todas…": "capturing all…",
    "Sin mensajes todavía. Escribe abajo y pulsa Enviar.": "No messages yet. Type below and press Send.",
    "sin equipos disponibles": "no machines available", "sin equipos en el grupo": "no machines in the group", "ejecuta 🧪 Preflight DS": "run 🧪 Preflight DS",
    "inicia sesión Google": "sign in with Google", "sesión caducada — toca para re-entrar": "session expired — tap to sign in again",
    "sin ruta de control": "no control route", "sesión terminada": "session ended", "sin imagen": "no image", "sin relay": "no relay", "carbono": "carbon", "silicio": "silicon"
  };

  var reglas = [
    [/^Arrancar DS · (\d+)\/(\d+)$/, "Start DS · $1/$2"],
    [/^Apagar DS · (\d+)\/(\d+)$/, "Stop DS · $1/$2"],
    [/^hace (\d+) ?(s|min|h|d)$/, "$1 $2 ago"],
    [/^hace (\d+) ?min$/, "$1 min ago"],
    [/^(\d+) online$/, "$1 online"],
    [/^(\d+) abiertas$/, "$1 open"],
    [/^de (\d+) pantallas · (\d+) online$/, "of $1 screens · $2 online"],
    [/^visibles \/ (\d+) · (\d+) online$/, "visible / $1 · $2 online"],
    [/^(\d+) visibles$/, "$1 visible"],
    [/^(.+) — TAREA PRINCIPAL de (\S+)$/, "$1 — MAIN TASK of $2"],
    [/^([\s\S]+) \(crudo\)$/, "$1 (raw)"],
    [/^preparando el panel · (\d+) equipo\(s\) del último arranque$/, "preparing the panel · $1 machine(s) from the last start"],
    [/^descargando capturas · (\d+) de (\d+)…$/, "downloading captures · $1 of $2…"],
    [/^capturas listas · (\d+) equipo\(s\)$/, "captures ready · $1 machine(s)"],
    [/^(\d+) sin captura$/, "$1 without capture"],
    [/^arreglar todas \((\d+)\)$/, "fix all ($1)"],
    [/^Ningún equipo encendido de (\d+) \(desmarca «solo encendidos» para ver los apagados\)\.$/, "No powered-on machine out of $1 (untick «only powered on» to see the powered-off ones)."],
    [/^fijado por (\S+)$/, "set by $1"]
  ];

  I.diccionario(dicc, reglas);
})(typeof globalThis !== "undefined" ? globalThis : this);
