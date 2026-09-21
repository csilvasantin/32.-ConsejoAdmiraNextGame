# Ultradetalle del escritorio remoto

Al pulsar la pantalla del Mac en modo Escritorio, se abre un visor que ocupa el viewport. El botón Pantalla completa utiliza la API del navegador; Esc o Volver al Mac cierran el visor. Se conserva la proporción del escritorio y las bandas quedan fuera de las coordenadas interactivas.

El puente abre la computadora del consejero seleccionado mediante Abrir computadora. Captura exclusivamente el canvas de esa computadora dentro de la ventana exacta de GrokBot. No publica la URL privada de noVNC ni usa una captura alternativa de todo el monitor. El teclado se enfoca exclusivamente en Remote desktop keyboard input, fuera del compositor del chat.

La ruta autenticada mantiene la autorización de propietario existente y CSRF. Cada conexión se vincula a cuenta y sesión de login; cada entrada exige un fotograma reciente y el mismo consejero, proceso, ventana y geometría. Cerrar invalida el token. No hay reintentos automáticos de clics o escritura.

Admite clic, doble clic, botón derecho, arrastre, rueda, texto y teclas de edición/navegación. La imagen se renueva aproximadamente cada segundo más el tiempo de captura; no es vídeo en tiempo real. GrokBot y el puente del Mac Mini deben permanecer disponibles. No cambia tamaños ni posiciones de ventanas nativas.

Validación: 111 pruebas JS y 31 pruebas puras Swift. La comprobación funcional se hace desde la UI pública, sin mandar mensajes a consejeros ni ejecutar tareas en su computadora.

Los eventos de ratón enlazan coordenadas de pantalla y ventana, según el mecanismo de [axcli](https://github.com/andelf/axcli/blob/main/src/input.rs). El símbolo del sistema para la posición local se resuelve al ejecutar y, si falta, se rechaza la entrada; no se recurre a eventos globales.
