# Prode Mundial 2026 - API Backend

Backend REST para un prode del Mundial 2026. Obtiene los partidos de la fase de grupos desde [OpenFootball](https://github.com/openfootball/worldcup.json) (open source, sin API key) y permite a los usuarios registrar sus pronósticos.

## Stack

- **Runtime:** Node.js 18+ (ESModules)
- **Framework:** Express 5
- **Base de datos:** MongoDB Atlas
- **Auth:** JWT (Bearer token)
- **Datos de partidos:** [OpenFootball worldcup.json](https://github.com/openfootball/worldcup.json) (gratuito, sin API key)

## Configuración

1. Crear el archivo `.env` con las siguientes variables:

```env
PORT=3000
MONGODB_URI=<tu_mongo_uri>
JWT_SECRET=<tu_secreto_jwt>
```

> Los datos de los partidos se obtienen de **OpenFootball** (GitHub raw JSON), sin necesidad de API key ni registro. Los fixtures se cachean 1 hora en MongoDB.

2. Instalar dependencias e iniciar:

```bash
npm install
npm run dev   # desarrollo con nodemon
npm start     # producción
```

## Cómo funciona un pronóstico

### ¿Quién es "home" y quién es "away"?

En el Mundial **no hay local real**: todos los partidos se juegan en estadios neutrales. La API-Football igualmente asigna un equipo como `home` y otro como `away`; es simplemente el **orden en que lista el partido** (primer equipo vs segundo equipo), sin implicar ventaja de localía.

```json
"teams": {
    "home": { "name": "Spain" },
    "away": { "name": "Morocco" }
}
```

Un pronóstico `homeGoals: 2, awayGoals: 1` significa **España 2 - 1 Marruecos**.

### ¿Sobre qué partido se apuesta?

Cada partido tiene un `fixtureId` único en API-Football. El flujo es:

**1. Consultar los partidos disponibles:**
```
GET /api/matches
```
Cada partido devuelve su `fixture.id`:
```json
{
    "fixture": {
        "id": 1035038,
        "date": "2026-06-11T20:00:00+00:00"
    },
    "teams": {
        "home": { "name": "Spain" },
        "away": { "name": "Morocco" }
    }
}
```

**2. Apostar usando ese ID:**
```json
POST /api/predictions
{
    "fixtureId": 1035038,
    "homeGoals": 2,
    "awayGoals": 1
}
```

### Flujo completo del usuario

```
1. POST /api/auth/register      → crear cuenta
2. POST /api/auth/login         → obtener token JWT
3. GET  /api/matches            → ver partidos y sus fixtureId
4. POST /api/predictions        → apostar (usando el fixtureId del paso anterior)
5. GET  /api/predictions        → ver mis pronósticos y puntos obtenidos
6. GET  /api/predictions/ranking → ver tabla de posiciones del prode
```

---

## Sistema de Puntos

| Resultado | Puntos |
|-----------|--------|
| Marcador exacto | 3 |
| Ganador/empate correcto | 1 |
| Incorrecto | 0 |

Los puntos se calculan automáticamente una vez que el partido finaliza (status `FT`, `AET` o `PEN`).

## Caché

Los datos de la API-Football se cachean **15 minutos** en MongoDB para respetar el límite de 100 req/día del plan gratuito. Se puede forzar la actualización con `POST /api/matches/refresh-cache`.

---

## Endpoints

### Auth — `/api/auth`

#### `POST /api/auth/register`
Registra un nuevo usuario.

**Body:**
```json
{
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "password": "password123"
}
```

**Respuesta 201:**
```json
{
    "message": "Usuario registrado exitosamente",
    "userId": "665abc123..."
}
```

---

#### `POST /api/auth/login`
Autentica al usuario y devuelve un JWT.

**Body:**
```json
{
    "email": "juan@example.com",
    "password": "password123"
}
```

**Respuesta 200:**
```json
{
    "message": "Login exitoso",
    "user": { "_id": "...", "name": "Juan Pérez", "email": "juan@example.com" },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

> Guardar el `token` para usarlo en los headers: `Authorization: Bearer <token>`

---

#### `GET /api/auth/me` 🔒
Devuelve el perfil del usuario autenticado.

**Respuesta 200:**
```json
{
    "data": { "_id": "...", "email": "juan@example.com" }
}
```

---

### Partidos — `/api/matches`

> Todos los endpoints de partidos son **públicos** (no requieren token).

#### `GET /api/matches`
Devuelve todos los partidos de la fase de grupos del Mundial 2026.

**Query params opcionales:**

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `round` | Filtra por jornada | `Group Stage - 1` |
| `status` | Filtra por estado | `NS`, `FT`, `1H`, `HT`, `2H` |

**Respuesta 200:**
```json
{
    "total": 48,
    "data": [
        {
            "fixture": {
                "id": 1035038,
                "date": "2026-06-11T20:00:00+00:00",
                "status": { "long": "Not Started", "short": "NS", "elapsed": null }
            },
            "league": { "round": "Group Stage - 1" },
            "teams": {
                "home": { "id": 9, "name": "Spain", "logo": "..." },
                "away": { "id": 34, "name": "Morocco", "logo": "..." }
            },
            "goals": { "home": null, "away": null }
        }
    ]
}
```

---

#### `GET /api/matches/rounds`
Lista todas las jornadas de la fase de grupos.

**Respuesta 200:**
```json
{
    "total": 3,
    "data": ["Group Stage - 1", "Group Stage - 2", "Group Stage - 3"]
}
```

---

#### `GET /api/matches/standings`
Tabla de posiciones de todos los grupos.

**Respuesta 200:**
```json
{
    "total": 12,
    "data": [
        [
            { "rank": 1, "team": { "name": "USA" }, "points": 6, "goalsDiff": 4, ... },
            { "rank": 2, "team": { "name": "Mexico" }, "points": 3, ... }
        ]
    ]
}
```

---

#### `GET /api/matches/:fixtureId`
Detalle completo de un partido por su ID de API-Football.

**Respuesta 200:**
```json
{
    "data": { "fixture": {...}, "teams": {...}, "goals": {...}, "score": {...} }
}
```

**Respuesta 404:** Partido no encontrado.

---

#### `POST /api/matches/refresh-cache` 🔒
Fuerza la recarga de los partidos desde API-Football invalidando el caché.

**Respuesta 200:**
```json
{
    "message": "Caché de partidos actualizada",
    "total": 48
}
```

---

### Pronósticos — `/api/predictions` 🔒

> Todos los endpoints de pronósticos **requieren** `Authorization: Bearer <token>`.

#### `POST /api/predictions`
Crea o actualiza el pronóstico del usuario para un partido.
No se puede apostar en partidos que ya comenzaron o finalizaron.

**Body:**
```json
{
    "fixtureId": 1035038,
    "homeGoals": 2,
    "awayGoals": 1
}
```

**Respuesta 200:**
```json
{
    "message": "Pronóstico guardado exitosamente",
    "data": { "fixtureId": 1035038, "homeGoals": 2, "awayGoals": 1 }
}
```

**Errores posibles:**
- `400` — Campos faltantes, valores inválidos o partido ya iniciado.
- `404` — Partido no encontrado.

---

#### `GET /api/predictions`
Devuelve todos los pronósticos del usuario con los puntos obtenidos.

**Respuesta 200:**
```json
{
    "totalPoints": 7,
    "total": 5,
    "data": [
        {
            "_id": "...",
            "fixtureId": 1035038,
            "homeGoals": 2,
            "awayGoals": 1,
            "points": 3,
            "fixture": {
                "id": 1035038,
                "date": "2026-06-11T20:00:00+00:00",
                "status": { "short": "FT" },
                "homeTeam": "Spain",
                "awayTeam": "Morocco",
                "goals": { "home": 2, "away": 1 },
                "round": "Group Stage - 1"
            }
        }
    ]
}
```

> `points`: `3` = marcador exacto, `1` = resultado correcto, `0` = incorrecto, `null` = partido no finalizado.

---

#### `GET /api/predictions/ranking`
Ranking global de todos los usuarios ordenado por puntos.

**Respuesta 200:**
```json
{
    "total": 10,
    "data": [
        {
            "position": 1,
            "userId": "...",
            "name": "Juan Pérez",
            "email": "juan@example.com",
            "totalPoints": 18,
            "exactScores": 4,
            "correctResults": 7,
            "totalPredictions": 10
        }
    ]
}
```

En caso de empate en puntos, el desempate es por cantidad de resultados exactos (`exactScores`).

---

#### `GET /api/predictions/:fixtureId`
Pronóstico del usuario para un partido específico.

**Respuesta 200:**
```json
{
    "data": {
        "_id": "...",
        "fixtureId": 1035038,
        "homeGoals": 2,
        "awayGoals": 1,
        "points": 3
    }
}
```

**Respuesta 404:** No hay pronóstico para ese partido.

---

#### `DELETE /api/predictions/:fixtureId`
Elimina el pronóstico de un partido. Solo posible si el partido aún no comenzó.

**Respuesta 200:**
```json
{ "message": "Pronóstico eliminado" }
```

---

## Postman

Importar `postman_collection.json` en Postman. El script del endpoint **Login** guarda el token automáticamente en la variable de colección `token`.

---

## Códigos de estado de partidos (API-Football)

| Código | Estado |
|--------|--------|
| `NS` | No iniciado |
| `1H` | Primer tiempo |
| `HT` | Descanso |
| `2H` | Segundo tiempo |
| `ET` | Tiempo extra |
| `BT` | Penales (espera) |
| `P` | Penales |
| `FT` | Finalizado |
| `AET` | Finalizado (tiempo extra) |
| `PEN` | Finalizado (penales) |
| `PST` | Postpuesto |
| `CANC` | Cancelado |
