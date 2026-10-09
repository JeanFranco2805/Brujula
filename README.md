# Brújula

Aplicación móvil en Expo/React Native y API REST en NestJS con PostgreSQL. Incluye cuentas, preferencias, importación y organización de PDFs, planes de estudio, apuntes de voz, notificaciones locales y exportación de sesiones al calendario del dispositivo.

## Requisitos

- Node.js 24 o superior
- npm
- Docker Desktop con Docker Compose

## Preparar configuración local

Desde la raíz del proyecto, crea los archivos locales ignorados por Git:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item backend/.env.db.example backend/.env.db
```

`backend/.env` trae una clave JWT de ejemplo solo para desarrollo. Antes de desplegar, reemplázala por un secreto aleatorio y configura una base de datos segura. Para probar desde otro dispositivo, cambia `EXPO_PUBLIC_API_URL` en el `.env` raíz a la IP local de este computador, por ejemplo `http://192.168.1.20:4000/api/v1`.

Valores de red frecuentes para `EXPO_PUBLIC_API_URL`:

- Navegador y simulador iOS: `http://localhost:4000/api/v1`
- Emulador Android: `http://10.0.2.2:4000/api/v1`
- Teléfono físico con Expo Go: `http://<IP-LAN-DEL-COMPUTADOR>:4000/api/v1`

## Iniciar PostgreSQL y la API

En una terminal, desde la raíz:

```powershell
docker compose up -d
```

En otra terminal:

```powershell
cd backend
npm install
npm run db:migrate
npm run start:dev
```

La API queda en `http://localhost:4000/api/v1`. El chequeo de salud es `GET /health`.

## Iniciar la aplicación móvil

En otra terminal, desde la raíz del proyecto:

```powershell
npm install
npm start
```

Abre el proyecto con Expo Go o con un emulador. Si usas teléfono físico, el computador y el teléfono deben estar en la misma red, y el firewall debe permitir conexiones al puerto 4000.

## Rutas disponibles

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/health` | Verifica que la API responde y puede consultar PostgreSQL |
| `POST` | `/auth/register` | Crea una cuenta y devuelve un token de acceso |
| `POST` | `/auth/login` | Inicia sesión |
| `POST` | `/auth/google` | Valida un ID token de Google y crea o inicia una sesión |
| `GET` | `/profile` | Devuelve el perfil del usuario autenticado |
| `PATCH` | `/profile/preferences` | Guarda formato, ritmo, minutos y objetivo de estudio |
| `POST` | `/materials` | Importa un PDF multipart (`file`), extrae texto y prepara resumen, ideas clave y temas |
| `GET` | `/materials` | Lista los materiales del usuario |
| `GET` | `/materials/:id` | Obtiene el resumen, ideas y temas de un material propio |
| `DELETE` | `/materials/:id` | Elimina un material propio y sus sesiones vinculadas |
| `GET` | `/study-plan` | Lista sesiones de estudio |
| `POST` | `/study-plan/generate` | Genera sesiones basadas en temas y preferencias del usuario |
| `PATCH` | `/study-plan/:id/complete` | Marca una sesión como completada |
| `PATCH` | `/study-plan/:id/schedule` | Cambia fecha y hora de una sesión pendiente |
| `POST` | `/voice-notes` | Transcribe una grabación multipart (`file`) y guarda transcripción y resumen |
| `GET` | `/voice-notes` | Lista apuntes de voz del usuario |
| `GET` | `/voice-notes/:id` | Obtiene una nota propia |
| `DELETE` | `/voice-notes/:id` | Elimina una nota propia |

Las rutas privadas reciben `Authorization: Bearer <token>`. El servidor guarda contraseñas como hashes bcrypt y la aplicación conserva el token usando almacenamiento seguro nativo. En web se usa almacenamiento local del navegador.

Si la API no responde, el registro y el login por correo usan el modo local del dispositivo. Esas cuentas y sus preferencias no se sincronizan con otros dispositivos. Al iniciar la API, las cuentas creadas localmente siguen disponibles en este dispositivo.

### Importar un PDF y crear un plan

Importar un PDF desde **Materiales** solo lo copia al almacenamiento privado del teléfono; esa acción no sube el archivo. Para generar un plan, toca **Crear plan de estudio** en el PDF. En ese momento la app envía una copia al backend, extrae sus temas y crea sesiones con el formato y la duración definidos en las preferencias. El PDF original sigue en el teléfono. Los PDFs escaneados sin texto seleccionable requieren OCR y todavía no se pueden analizar.

Si la cuenta está en modo local, Brújula pide la contraseña una sola vez para crear o conectar la cuenta del servidor. El backend guarda la copia analizada y sus temas para que las sesiones y lecciones puedan abrirse desde la app. Esta build usa HTTP para alcanzar la API local configurada en `.env`; el teléfono debe estar en la misma red del computador y la API debe estar encendida.

### IA y apuntes de voz

`backend/.env` puede configurar `OPENAI_API_KEY`, `OPENAI_STUDY_MODEL` y `OPENAI_TRANSCRIPTION_MODEL`. Sin clave, los PDFs se organizan con extracción local de texto; la transcripción de voz requiere la clave. Los PDFs escaneados que no contienen texto seleccionable todavía necesitan OCR. Se aceptan archivos de hasta 12 MB para PDF y 25 MB para audio.

### Plan y recordatorios

El plan se genera desde los temas de los PDFs y usa las preferencias del perfil. La app puede pedir permiso para programar notificaciones locales y agregar o actualizar las sesiones en el calendario editable del dispositivo. No se sincroniza con Google Calendar mediante OAuth; para eso hacen falta credenciales y un flujo OAuth de calendario independiente.

### Continuar con Google

La pantalla incluye el flujo OAuth de Google. Para activarlo, configura los Client IDs de Android, iOS y web en el `.env` raíz (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`) y los mismos IDs, separados por comas, en `backend/.env` (`GOOGLE_CLIENT_IDS`). El backend valida el ID token de Google y emite la sesión propia de Brújula. Se requiere API activa y una build nativa con el esquema `brujula`; los IDs de ejemplo deben reemplazarse por los de tu proyecto de Google Cloud.

## Estructura

- `src/app/`: rutas móviles con Expo Router.
- `src/auth/`: sesión, token y sincronización del perfil.
- `backend/src/`: API NestJS, autenticación JWT, módulo de usuarios y perfiles.
- `backend/migrations/`: cambios SQL versionados.
- `docker-compose.yml`: PostgreSQL local con volumen persistente.

## Pruebas

Desde `backend/`, ejecuta `npm test` para las pruebas de servicios y rutas HTTP con dobles de base de datos/proveedores, `npm run test:coverage` para cobertura y `npm run build` para compilar. Para una prueba con PostgreSQL real, levanta Docker, aplica `npm run db:migrate` y usa la app con `EXPO_PUBLIC_API_URL` apuntando al servidor.

La integración real requiere configurar PostgreSQL, la clave OpenAI para transcripción, y los Client IDs de Google para OAuth de inicio de sesión. Recuperación/verificación de correo, renovación de tokens, OCR de PDFs escaneados y OAuth de Google Calendar no están implementados todavía.
