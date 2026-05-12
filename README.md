# 📖 TekstMaat

> Toegankelijk voorleessysteem voor dyslexie bij toetsen – Cloudflare Workers + R2 + D1

---

## Inhoudsopgave

1. [Wat is TekstMaat?](#1-wat-is-tekstmaat)
2. [Architectuur](#2-architectuur)
3. [Mapstructuur](#3-mapstructuur)
4. [Vereisten](#4-vereisten)
5. [Stap-voor-stap installatie](#5-stap-voor-stap-installatie)
6. [Configuratie](#6-configuratie)
7. [Portals & gebruikers](#7-portals--gebruikers)
8. [API referentie](#8-api-referentie)
9. [Eerste school aanmaken](#9-eerste-school-aanmaken)
10. [Productie deployment](#10-productie-deployment)

---

## 1. Wat is TekstMaat?

TekstMaat is een lichtgewicht alternatief voor Textaid, specifiek gericht op **het voorlezen van PDF-documenten tijdens toetsen** voor studenten met dyslexie. Het platform:

- Leest PDF/DOCX bestanden voor met **woord-voor-woord highlighting**
- Gebruikt de **Web Speech API** (browser-native TTS) met ondersteuning voor NL, EN, DE, FR, ES
- Herkent tekst in afbeeldingen via **Cloudflare AI OCR** (geen gemiste tekst)
- Behoudt de **originele opmaak** van documenten (PDF.js rendering)
- Biedt drie portals: **Superadmin**, **Schooladmin**, **Student**
- Draait volledig op **Cloudflare** (Workers, R2, D1, KV, AI)

---

## 2. Architectuur

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare Pages                       │
│  login.html │ superadmin/ │ admin/ │ student/               │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP (Bearer JWT)
┌───────────────────────▼─────────────────────────────────────┐
│              Cloudflare Worker (API)                        │
│  /api/auth  /api/documents  /api/sessions  /api/schools     │
│  /api/superadmin  /api/files                                │
└──────┬──────────────┬──────────────┬───────────────┬────────┘
       │              │              │               │
    ┌──▼──┐        ┌──▼──┐       ┌──▼──┐        ┌──▼──┐
    │  D1  │        │  R2  │       │  KV  │        │  AI  │
    │ SQLite│       │ Files│       │Cache │        │ OCR  │
    └──────┘        └──────┘       └──────┘        └──────┘
```

### Authenticatie flow
```
Login → JWT (HS256, 8u) → rol-check per endpoint
Rollen: superadmin > schooladmin > student
```

### OCR flow
```
Upload PDF → R2 opslaan → D1 record (status: pending)
→ Scheduled Worker → AI Vision model → JSON met woorden + coördinaten
→ D1 update (status: done) → Student kan document voorlezen
```

---

## 3. Mapstructuur

```
tekstmaat/
├── wrangler.toml              # Cloudflare Workers configuratie
├── README.md                  # Dit bestand
├── database/
│   └── schema.sql             # D1 database schema + seed
├── worker/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           # Hoofd router + scheduled handler
│       ├── routes/
│       │   ├── auth.ts        # Login, /me, wachtwoord reset
│       │   ├── documents.ts   # Upload, lijst, OCR status
│       │   ├── files.ts       # R2 bestanden beveiligd serveren
│       │   ├── sessions.ts    # Exam sessies CRUD
│       │   ├── schools.ts     # Scholen/users/groups beheer
│       │   ├── superadmin.ts  # Superadmin API
│       │   └── ...
│       └── utils/
│           ├── auth.ts        # JWT, wachtwoord hashing
│           └── responses.ts   # CORS, response helpers
└── frontend/
    ├── shared/
    │   └── styles.css         # Gedeelde CSS (light/dark theme)
    ├── login.html             # Gedeeld login scherm
    ├── superadmin/
    │   └── index.html         # Superadmin portal
    ├── admin/
    │   └── index.html         # Schooladmin portal
    └── student/
        └── index.html         # Student leesomgeving
```

---

## 4. Vereisten

- **Node.js** 18+ en **npm**
- **Cloudflare account** (gratis of betaald)
- **Wrangler CLI** (`npm i -g wrangler`)
- Cloudflare account is aangemeld voor **Workers AI** (gratis tier beschikbaar)

---

## 5. Stap-voor-stap installatie

### Stap 1: Wrangler installeren & inloggen

```bash
npm install -g wrangler
wrangler login
```

### Stap 2: D1 database aanmaken

```bash
wrangler d1 create tekstmaat-db
```

Kopieer de `database_id` uit de output en plak die in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "tekstmaat-db"
database_id = "JOUW-DATABASE-ID-HIER"
```

### Stap 3: R2 bucket aanmaken

```bash
wrangler r2 bucket create tekstmaat-files
```

### Stap 4: KV namespace aanmaken

```bash
wrangler kv:namespace create SESSIONS
wrangler kv:namespace create SESSIONS --preview
```

Plak de `id` en `preview_id` in `wrangler.toml`.

### Stap 5: Database schema toepassen

```bash
wrangler d1 execute tekstmaat-db --file=database/schema.sql
```

### Stap 6: Worker installeren en deployen

```bash
cd worker
npm install
wrangler deploy
```

### Stap 7: JWT secret instellen

```bash
wrangler secret put JWT_SECRET
# Voer een sterk willekeurig wachtwoord in (bijv. 64 tekens)
```

### Stap 8: Frontend deployen (Cloudflare Pages)

```bash
# Via Cloudflare dashboard: Pages > Create application > Upload
# Upload de 'frontend' map

# Of via Wrangler:
wrangler pages deploy frontend --project-name=tekstmaat
```

### Stap 9: API_URL instellen in frontend

In elk HTML-bestand staat bovenaan:
```javascript
const API = '/api';
```

Als de Worker op een apart domein draait, verander dit naar:
```javascript
const API = 'https://tekstmaat-worker.JOUWACCOUNT.workers.dev/api';
```

### Stap 10: Superadmin wachtwoord instellen

Genereer een wachtwoord hash en update de database:
```bash
# Via Worker endpoint (eenmalig):
curl -X POST https://jouw-worker.workers.dev/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"setup_key":"JOUW_SETUP_KEY","password":"NieuwWachtwoord123!"}'
```

Of directe D1 update:
```bash
wrangler d1 execute tekstmaat-db --command="UPDATE users SET password_hash='GEGENEREERDE_HASH' WHERE role='superadmin'"
```

---

## 6. Configuratie

### wrangler.toml

| Variabele | Beschrijving |
|-----------|-------------|
| `JWT_SECRET` | Secret voor JWT signing (via `wrangler secret`) |
| `DB` | D1 database binding |
| `FILES` | R2 bucket binding |
| `SESSIONS` | KV namespace binding voor sessies/cache |
| `AI` | Cloudflare AI binding voor OCR |

### Aanpassen per school (via superadmin portal)

| Instelling | Beschrijving |
|------------|-------------|
| `plan` | trial / basic / standard / enterprise |
| `storage_limit_gb` | Max opslagruimte in GB |
| `max_students` | Max aantal studenten |
| `license_expires` | Vervaldatum licentie |
| `allowed_languages` | JSON array met taalkodes |

---

## 7. Portals & gebruikers

### 🔵 Superadmin (`/superadmin/`)
- Volledige controle over alle scholen
- Scholen aanmaken/bewerken/verwijderen
- Licenties beheren
- Opslaggebruik monitoren
- Systeem health dashboard
- Audit logs bekijken
- Als schooladmin inloggen (impersonation)

### 🟢 Schooladmin (`/admin/`)
- Documenten uploaden (PDF/DOCX)
- OCR status volgen
- Toetssessies plannen (tijdvenster, groeptoegang)
- Studenten aanmaken/importeren
- Groepen/klassen beheren
- Statistieken van sessiegebruik

### 🟡 Student (`/student/`)
- Beschikbare sessies zien (alleen binnen tijdvenster)
- Document openen in PDF viewer
- Voorlezen starten/pauzeren/hervatten
- Woord-voor-woord highlighting volgen
- Snelheid aanpassen (0.5× – 2.0×)
- Taal/stem kiezen
- Spatiebalk = play/pause

---

## 8. API referentie

### Authenticatie
| Method | Path | Beschrijving |
|--------|------|-------------|
| POST | `/api/auth/login` | Inloggen, geeft JWT terug |
| GET | `/api/auth/me` | Huidige gebruiker ophalen |
| POST | `/api/auth/logout` | Uitloggen (KV sessie verwijderen) |

### Documenten
| Method | Path | Beschrijving |
|--------|------|-------------|
| GET | `/api/documents` | Lijst van documenten (school) |
| POST | `/api/documents` | Document uploaden |
| GET | `/api/documents/:id` | Document details + tekst |
| DELETE | `/api/documents/:id` | Document verwijderen |
| POST | `/api/documents/:id/reprocess` | OCR opnieuw starten |

### Sessies
| Method | Path | Beschrijving |
|--------|------|-------------|
| GET | `/api/sessions` | Sessies ophalen (gefilterd op rol) |
| POST | `/api/sessions` | Sessie aanmaken |
| PUT | `/api/sessions/:id` | Sessie bewerken |
| DELETE | `/api/sessions/:id` | Sessie verwijderen |
| GET | `/api/sessions/:id/text` | Tekst voor TTS ophalen |
| POST | `/api/sessions/:id/log` | Actie loggen |

### Scholen (schooladmin)
| Method | Path | Beschrijving |
|--------|------|-------------|
| GET | `/api/schools/users` | Gebruikers van school |
| POST | `/api/schools/users` | Gebruiker aanmaken |
| PUT | `/api/schools/users/:id` | Gebruiker bewerken |
| DELETE | `/api/schools/users/:id` | Gebruiker verwijderen |
| GET | `/api/schools/groups` | Groepen ophalen |
| POST | `/api/schools/groups` | Groep aanmaken |

### Superadmin
| Method | Path | Beschrijving |
|--------|------|-------------|
| GET | `/api/superadmin/stats` | Platform statistieken |
| GET | `/api/superadmin/schools` | Alle scholen |
| POST | `/api/superadmin/schools` | School aanmaken |
| PUT | `/api/superadmin/schools/:id` | School bewerken |
| DELETE | `/api/superadmin/schools/:id` | School verwijderen |
| PATCH | `/api/superadmin/schools/:id/license` | Licentie aanpassen |
| POST | `/api/superadmin/schools/:id/impersonate` | Als schooladmin inloggen |

---

## 9. Eerste school aanmaken

1. Login op `/login.html` als superadmin  
   - Email: `admin@tekstmaat.nl`  
   - Wachtwoord: stel in via setup endpoint (zie stap 10 installatie)

2. Ga naar **Scholen** → **+ School toevoegen**

3. Vul in:
   - Schoolnaam
   - Contactpersoon + email
   - Plan (start met "Proefperiode")
   - Eerste beheerder naam + email + wachtwoord

4. De schooladmin ontvangt (handmatig versturen, of via e-mailintegratie):
   - URL: `https://jouwdomein.nl/admin/`
   - Email + wachtwoord

5. De schooladmin kan inloggen en direct documenten uploaden + sessies plannen

6. Studenten loggen in op `/student/` met hun eigen credentials

---

## 10. Productie deployment

### Aanbevolen domeinstructuur

```
tekstmaat.nl/          → Cloudflare Pages (frontend)
tekstmaat.nl/api/*     → Cloudflare Worker (via Pages _routes.json)
```

### `_routes.json` (in frontend map plaatsen)

```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/api/*"]
}
```

### Cloudflare Worker route instellen

In wrangler.toml:
```toml
routes = [
  { pattern = "tekstmaat.nl/api/*", zone_name = "tekstmaat.nl" }
]
```

### Beveiliging checklist

- [ ] JWT_SECRET is sterk en uniek (gebruik `openssl rand -base64 64`)
- [ ] Superadmin standaard wachtwoord is gewijzigd
- [ ] CORS origins beperkt tot jouw domein in `responses.ts`
- [ ] R2 bucket is **niet** publiek toegankelijk (alleen via Worker)
- [ ] D1 database heeft geen publieke toegang
- [ ] Cloudflare WAF ingeschakeld op productiedomein

---

## Licentie

Dit project is ontwikkeld als intern systeem. Aanpassen voor eigen gebruik is toegestaan.

---

*TekstMaat – Omdat elk kind recht heeft op gelijkwaardige toegang tot onderwijs.*
