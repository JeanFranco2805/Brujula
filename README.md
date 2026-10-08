# Brújula

Aplicación móvil en Expo/React Native y API REST en NestJS. La primera etapa del backend cubre registro, inicio de sesión, recuperación de sesión y guardado de preferencias de estudio en PostgreSQL.

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

Las rutas privadas reciben `Authorization: Bearer <token>`. El servidor guarda contraseñas como hashes bcrypt y la aplicación conserva el token usando almacenamiento seguro nativo. En web se usa almacenamiento local del navegador.

Si la API no responde, el registro y el login por correo usan el modo local del dispositivo. Esas cuentas y sus preferencias no se sincronizan con otros dispositivos. Al iniciar la API, las cuentas creadas localmente siguen disponibles en este dispositivo.

### Continuar con Google

La pantalla incluye el flujo OAuth de Google. Para activarlo, configura los Client IDs de Android, iOS y web en el `.env` raíz (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`) y los mismos IDs, separados por comas, en `backend/.env` (`GOOGLE_CLIENT_IDS`). El backend valida el ID token de Google y emite la sesión propia de Brújula. Se requiere API activa y una build nativa con el esquema `brujula`; los IDs de ejemplo deben reemplazarse por los de tu proyecto de Google Cloud.

## Estructura

- `src/app/`: rutas móviles con Expo Router.
- `src/auth/`: sesión, token y sincronización del perfil.
- `backend/src/`: API NestJS, autenticación JWT, módulo de usuarios y perfiles.
- `backend/migrations/`: cambios SQL versionados.
- `docker-compose.yml`: PostgreSQL local con volumen persistente.

## Alcance de esta etapa

La autenticación y las preferencias ya usan el backend. El procesamiento de PDFs con IA, generación de planes desde documentos, sincronización con calendarios y notificaciones quedan para la siguiente etapa. También faltan recuperación/verificación de correo y renovación de tokens.
