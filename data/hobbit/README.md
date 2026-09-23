# Fase «The Hobbit» del HACKEO

Tras media pantalla de hackeo, cada uno de estos Air teclea su fichero en bucle
y suelta al azar un dibujo de `ascii.txt`:

| Equipo | Fichero |
|---|---|
| MacBook Air Plata | `codigo-maquina.txt` |
| MacBook Air Azul | `ensamblador.txt` |
| MacBook Air Crema | `pascal.txt` |
| MacBook Air Rosa | `lingo.txt` |

- Los ficheros se leen **en el Mac Mini** (`~/32.-ConsejoAdmiraNextGame/data/hobbit/`)
  y viajan con cada lanzamiento: basta con editarlos ahí, sin reiniciar nada.
- `ascii.txt`: un dibujo por bloque, separados por una línea que contenga solo `%`.
- Si un fichero falta o está vacío, ese equipo sigue con el hackeo clásico.
- El mapa equipo → lenguaje está en `_HK_HOBBIT_LANG` (council-api.py).
