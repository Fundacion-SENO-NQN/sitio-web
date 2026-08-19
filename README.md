> This README was generated with AI.

# Fundación S.E.N.O. — Official Website & Administration Platform

Official web platform for **Fundación S.E.N.O.**, built to provide a modern public website and an internal administration area that allows the foundation to manage its own content.

The project is organized as a monorepo with two main applications:

- **Frontend:** Astro + TypeScript, prepared for Cloudflare.
- **Backend:** Rust + Axum + PostgreSQL, prepared for Fly.io.
- **Media storage:** Cloudflare R2.
- **Authentication:** JWT with role- and permission-based authorization.
- **Email:** SMTP, currently used for volunteer applications.

> Production website: [fundacionseno.org](https://fundacionseno.org)

---

## Table of contents

- [About the project](#about-the-project)
- [Main features](#main-features)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Frontend](#frontend)
- [Backend](#backend)
- [Authentication and authorization](#authentication-and-authorization)
- [API overview](#api-overview)
- [Media storage](#media-storage)
- [Frontend rebuild system](#frontend-rebuild-system)
- [SEO](#seo)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Production builds](#production-builds)
- [Deployment](#deployment)
- [Health check](#health-check)
- [Database note](#database-note)
- [Security notes](#security-notes)
- [Contributing](#contributing)

---

## About the project

This repository contains the official digital platform of **Fundación S.E.N.O.**

The website has two major responsibilities:

1. **Public website**
   - Present the foundation and its work.
   - Publish news, events and achievements.
   - Explain how people can request help.
   - Explain the different ways people and organizations can collaborate.
   - Provide information related to wigs and their care.
   - Receive volunteer applications.
   - Publish donation information and payment methods.

2. **Administration platform**
   - Allow authorized members of the foundation to manage public content.
   - Manage users, roles and permissions.
   - Upload and replace media.
   - Update donation methods.
   - Manage news, events, achievements and team members without editing source code.

The project is designed so that the public site can remain lightweight while the administration platform communicates with a separate API.

---

## Main features

### Public website

The Astro frontend currently includes sections for:

- Home.
- **Dónde estamos**.
- **Necesito ayuda**.
- **Quiénes somos**.
- News.
- Events.
- Achievements.
- Team members.
- **Quiero ayudar**.
- Donations.
- Volunteer applications.
- Wigs and wig-care information.
- Terms and conditions.
- Custom 404 page.

Dynamic information is obtained from the backend API while other institutional content is stored directly in the frontend.

### Administration platform

The platform includes backend support for managing:

- News.
- Events.
- Achievements.
- Featured achievements.
- Team members.
- Donation/payment methods.
- Donation images.
- Users.
- Roles.
- Role/service relationships.
- Permissions/services.

Administrative operations are protected through JWT authentication and service-based permissions.

### Volunteer applications

The backend exposes an endpoint for volunteer applications and includes an SMTP email service.

When a volunteer request is submitted, the backend can generate an email for the foundation containing the applicant's information and configure the applicant as the `Reply-To` address.

---

## Architecture

```mermaid
flowchart LR
    U[Visitor / Foundation member]

    subgraph CF[Cloudflare]
        F[Astro Frontend]
        R2[Cloudflare R2]
    end

    subgraph API[Backend]
        A[Axum HTTP API]
        AUTH[JWT Authentication]
        H[Handlers]
        REP[Repositories]
        EMAIL[SMTP Email Service]
        REBUILD[Frontend Rebuild Service]
    end

    DB[(PostgreSQL)]

    U --> F
    F --> A
    A --> AUTH
    A --> H
    H --> REP
    REP --> DB
    H --> R2
    H --> EMAIL
    H --> REBUILD
    REBUILD --> DB
    REBUILD --> CF
```

### Typical public request

```text
Browser
  ↓
Astro page
  ↓
Frontend API client
  ↓
Axum route
  ↓
Handler
  ↓
Repository
  ↓
PostgreSQL
```

### Typical administrative request

```text
Administration page
  ↓
Authorization: Bearer <JWT>
  ↓
Axum AuthUser extractor
  ↓
JWT validation
  ↓
Load user + permissions
  ↓
Permission check
  ↓
Handler
  ↓
Repository / R2 / other service
```

---

## Technology stack

### Frontend

| Technology | Purpose |
| --- | --- |
| [Astro](https://astro.build/) | Main frontend framework |
| TypeScript / JavaScript | Client-side logic and API access |
| HTML / CSS | Interface and responsive layout |
| `@astrojs/cloudflare` | Cloudflare adapter |
| `@astrojs/sitemap` | Sitemap generation |
| Wrangler | Cloudflare configuration/tooling |

The frontend package requires **Node.js >= 22.12.0**.

### Backend

| Technology | Purpose |
| --- | --- |
| Rust | Backend language |
| Axum | HTTP framework |
| Tokio | Async runtime |
| SQLx | PostgreSQL access |
| PostgreSQL | Main relational database |
| Serde | JSON serialization/deserialization |
| Argon2 | Password hashing |
| JSON Web Tokens | Authentication |
| Lettre | SMTP email |
| AWS S3 SDK | Cloudflare R2 access through its S3-compatible API |
| `image` | Image processing and AVIF generation |
| Reqwest | Outgoing HTTP requests |
| Tower HTTP | CORS and HTTP middleware |
| Validator | Input validation |

The backend crate uses the **Rust 2024 edition**.

### Infrastructure

| Service | Role |
| --- | --- |
| Cloudflare | Frontend hosting/tooling |
| Cloudflare R2 | Object and image storage |
| PostgreSQL | Persistent application data |
| Fly.io | Backend deployment configuration |
| SMTP server | Volunteer-request email delivery |

---

## Repository structure

```text
sitio-web/
├── backend/
│   ├── src/
│   │   ├── auth/          # JWT, passwords, AuthUser and permissions
│   │   ├── db/            # PostgreSQL connection
│   │   ├── error/         # API error types
│   │   ├── handlers/      # HTTP request business logic
│   │   ├── models/        # Request, response and database models
│   │   ├── repositories/  # SQL/database access
│   │   ├── routes/        # Axum route definitions
│   │   ├── services/      # Email and frontend rebuild services
│   │   ├── utils/         # Image, file, R2 and utility functions
│   │   └── main.rs        # Application entry point
│   ├── Cargo.toml
│   ├── Dockerfile
│   └── fly.toml
│
├── frontend/
│   ├── src/
│   │   ├── api/           # Backend API clients
│   │   ├── assets/        # Frontend assets
│   │   ├── components/    # Reusable Astro components
│   │   ├── data/          # Static/institutional data
│   │   ├── js/            # Client-side scripts
│   │   ├── layouts/       # Public, login and platform layouts
│   │   ├── pages/         # Astro file-based routes
│   │   ├── style/         # Global/shared styles
│   │   └── utils/         # Frontend utilities, including SEO
│   ├── astro.config.mjs
│   ├── package.json
│   └── wrangler.jsonc
│
├── Manual de uso.docx
├── .gitignore
└── README.md
```

---

## Frontend

The frontend is an Astro application using file-based routing.

The major page groups under `frontend/src/pages/` are:

```text
donde-estamos/
eventos/
login/
necesito-ayuda/
noticias/
pelucas/
plataforma/
quienes-somos/
quiero-ayudar/
terminos-y-condiciones/
```

It also contains:

- `index.astro`
- `404.astro`
- `sitemap-dynamic.xml.ts`

### Layouts

The project separates its principal interfaces into different layouts:

- `Layout.astro` — public website.
- `LayoutLogin.astro` — authentication page.
- `LayoutPlataforma.astro` — internal administration platform.

### API client

All frontend API calls are based on the `PUBLIC_API_URL` environment variable.

The common API helper:

1. Reads `PUBLIC_API_URL`.
2. Removes a trailing slash if present.
3. Concatenates the requested API path.
4. Throws an error when the HTTP response is not successful.
5. Parses successful responses as JSON.

---

## Backend

The backend follows a layered structure.

### Routes

Route files define the public HTTP interface.

```text
routes/
   ↓
handlers/
   ↓
repositories/
   ↓
PostgreSQL
```

### Handlers

Handlers contain request-level business logic, including:

- Parsing incoming data.
- Authentication extraction.
- Permission checks.
- Validation.
- Calls to repositories.
- Image/file handling.
- Calls to external services.
- API response generation.

### Repositories

Repositories isolate SQL and PostgreSQL operations from the HTTP layer.

Main repository domains include:

- Users.
- Roles.
- Services.
- News.
- Events.
- Achievements.
- Team members.
- Donation methods.
- Volunteer applications.

### Models

Models define the structures used by:

- SQLx.
- JSON requests and responses.
- Form/multipart requests.
- Authentication.
- Validation.

---

## Authentication and authorization

The administration platform uses **JWT authentication**.

### Login flow

```text
POST /login
    ↓
Find user by username
    ↓
Check that account is active
    ↓
Verify Argon2 password hash
    ↓
Generate JWT
    ↓
Return token + user information
```

JWTs contain the user's ID in the `sub` claim and currently expire after **30 days**.

### Authenticated requests

Protected handlers use the `AuthUser` extractor.

The extractor:

1. Reads the `Authorization` header.
2. Requires the `Bearer <token>` format.
3. Validates the JWT using `JWT_SECRET`.
4. Loads the current user from PostgreSQL.
5. Rejects inactive users.
6. Loads the services/permissions associated with the user's role.
7. Makes the authenticated user available to the handler.

### Permissions

The backend currently defines these service names:

| Permission | Purpose |
| --- | --- |
| `admin_noticias` | News administration |
| `admin_logros` | Achievement administration |
| `admin_miembros` | Team/member administration |
| `admin_users` | User administration |
| `upload_img_donacion` | Donation-image upload |
| `admin_metodos_pago_donacion` | Donation/payment-method administration |
| `admin_eventos` | Event administration |

The authorization helper supports:

- `has_permission(...)`
- `require(...)`
- `require_any(...)`
- `require_all(...)`

This allows endpoints to enforce permissions independently from authentication.

---

## API overview

The backend currently exposes the following route groups.

> This is a route overview, not a full request/response API specification. Validation and authorization rules are implemented in the corresponding handlers.

### Authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/login` | Authenticate a user and return a JWT |

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Basic backend health check |

### News

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/noticias` | Get all news |
| `POST` | `/noticias` | Create news |
| `PATCH` | `/noticias/order` | Change news order |
| `GET` | `/noticias/{id}` | Get news by ID |
| `PATCH` | `/noticias/{id}` | Update news |
| `DELETE` | `/noticias/{id}` | Delete news |
| `GET` | `/ultimas_noticias` | Get latest news |

### Events

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/eventos` | Get events |
| `POST` | `/eventos` | Create an event |
| `GET` | `/eventos/{id}` | Get event by ID |
| `PATCH` | `/eventos/{id}` | Update an event |
| `DELETE` | `/eventos/{id}` | Delete an event |
| `PUT` | `/eventos/order` | Change event order |

### Team

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/equipo` | Get team members |
| `POST` | `/equipo` | Create a team member |
| `GET` | `/equipo/{id}` | Get member by ID |
| `PATCH` | `/equipo/{id}` | Update a member |
| `DELETE` | `/equipo/{id}` | Delete a member |
| `PUT` | `/equipo/order` | Change member order |

### Achievements

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/logros` | Get achievements |
| `POST` | `/logros` | Create an achievement |
| `GET` | `/logros/{id}` | Get achievement by ID |
| `PATCH` | `/logros/{id}` | Update an achievement |
| `DELETE` | `/logros/{id}` | Delete an achievement |
| `PUT` | `/logros/order` | Change achievement order |

### Featured achievements

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/logros_fav` | Get featured achievements |
| `POST` | `/logros_fav` | Add a featured achievement |
| `PUT` | `/logros_fav` | Update featured-achievement order |
| `GET` | `/logros_fav/{id}` | Get featured achievement by ID |
| `DELETE` | `/logros_fav/{id}` | Remove a featured achievement |

### Donation methods

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/metodos_donacion` | Get donation methods |
| `POST` | `/metodos_donacion` | Create a donation method |
| `GET` | `/metodos_donacion/{id}` | Get donation method |
| `PATCH` | `/metodos_donacion/{id}` | Update donation method |
| `DELETE` | `/metodos_donacion/{id}` | Delete donation method |

### Donation images

| Method | Endpoint | Description |
| --- | --- | --- |
| `PUT` | `/donaciones/img` | Upload/replace a donation image |

### Volunteers

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/voluntariado/solicitud` | Submit a volunteer application |

### Users

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/users` | Get users |
| `POST` | `/users` | Create a user |
| `GET` | `/users/{id}` | Get user by ID |
| `PATCH` | `/users/{id}` | Update a user |
| `DELETE` | `/users/{id}` | Delete a user |
| `GET` | `/users/username/{username}` | Get user by username |
| `PATCH` | `/user/state/{id}` | Change active state |
| `GET` | `/user/permissions/{id}` | Get user permissions |
| `GET` | `/user/permissions/username/{username}` | Get permissions by username |
| `PATCH` | `/users/password/{id}` | Change user password |

### Roles and services

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/roles` | Get roles |
| `GET` | `/roles/{id}` | Get role |
| `PATCH` | `/roles/{id}` | Update role |
| `DELETE` | `/roles/{id}` | Delete role |
| `GET` | `/roles-services` | Get role/service relations |
| `POST` | `/roles-services` | Create role/service relation |
| `GET` | `/roles-service/{id}` | Get services associated with a role |
| `GET` | `/services` | Get available services/permissions |

---

## Media storage

The backend uses **Cloudflare R2** through its S3-compatible API.

The R2 storage utility supports:

- AVIF image uploads.
- SVG uploads.
- Single-object deletion.
- Multi-object deletion.

The backend uses the AWS S3 SDK configured with the Cloudflare R2 endpoint:

```text
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

Uploaded AVIF images are sent with the `image/avif` content type.

---

## Frontend rebuild system

The backend contains a `FrontendRebuildService` for content changes that need a new frontend build.

When enabled, it:

1. Uses PostgreSQL to coordinate pending rebuild state.
2. Polls for pending rebuilds.
3. Waits for a configurable delay so multiple nearby changes can be grouped.
4. Calls a Cloudflare Pages deploy hook.
5. Records success/failure state in PostgreSQL.
6. Retries failed rebuilds.

By default:

- Rebuild delay: **300 seconds**.
- Poll interval: **15 seconds**.
- Failed rebuild retry delay: **60 seconds**.

If `CLOUDFLARE_PAGES_DEPLOY_HOOK` is not configured, the rebuild worker is disabled.

---

## SEO

The frontend contains dedicated SEO support.

The Astro configuration sets:

```text
https://fundacionseno.org
```

as the canonical site URL.

The project uses `@astrojs/sitemap`, and the generated standard sitemap excludes:

- `/plataforma`
- `/login`

The repository also includes:

```text
frontend/src/pages/sitemap-dynamic.xml.ts
```

for dynamic sitemap generation.

This keeps administration/authentication pages out of the public sitemap while allowing public content to be indexed.

---

# Local development

## 1. Clone the repository

```bash
git clone https://github.com/Fundacion-SENO-NQN/sitio-web.git
cd sitio-web
```

---

## 2. Frontend setup

### Requirements

- Node.js **22.12.0 or newer**.
- npm.
- A running or remotely accessible backend API.

### Install dependencies

```bash
cd frontend
npm install
```

### Configure environment

Create a `.env` file inside `frontend/`:

```env
PUBLIC_API_URL=http://localhost:8080
```

Do not add a trailing slash unless necessary; the API client removes trailing slashes automatically.

### Start development server

```bash
npm run dev
```

Astro normally starts its development server at:

```text
http://localhost:4321
```

The backend's default CORS configuration already allows this origin.

### Other frontend commands

```bash
# Production build
npm run build

# Preview a production build
npm run preview

# Astro CLI
npm run astro -- <command>

# Generate Wrangler types
npm run generate-types
```

---

## 3. Backend setup

### Requirements

- Rust toolchain and Cargo.
- PostgreSQL database compatible with the application's expected schema.
- Cloudflare R2 bucket and API credentials.
- SMTP credentials.
- A secure JWT secret.

### Configure environment

Create a `.env` file inside `backend/`.

Example:

```env
# Server
PORT=8080
CORS_ALLOWED_ORIGINS=http://localhost:4321

# Database
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE

# Authentication
JWT_SECRET=replace-with-a-long-random-secret

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET=your-bucket-name

# SMTP
SMTP_HOST=smtp.example.com
SMTP_USERNAME=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_FROM_NAME=Fundación SENO
VOLUNTEER_TO_EMAIL=destination@example.com
SMTP_PORT=465
SMTP_SECURITY=tls

# Optional frontend rebuild worker
CLOUDFLARE_PAGES_DEPLOY_HOOK=
FRONTEND_REBUILD_DELAY_SECONDS=300
FRONTEND_REBUILD_POLL_SECONDS=15
```

### Run the backend

```bash
cd backend
cargo run
```

By default the server listens on:

```text
0.0.0.0:8080
```

---

# Environment variables

## Frontend

| Variable | Required | Description |
| --- | --- | --- |
| `PUBLIC_API_URL` | Yes | Base URL of the Rust backend |

## Backend — server/database/authentication

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `8080` | HTTP server port |
| `CORS_ALLOWED_ORIGINS` | No | `http://localhost:4321` | Comma-separated allowed frontend origins |
| `DATABASE_URL` | Yes | — | PostgreSQL connection URL |
| `JWT_SECRET` | For authentication | — | Secret used to sign and validate JWTs |

`CORS_ALLOWED_ORIGINS` accepts multiple comma-separated origins:

```env
CORS_ALLOWED_ORIGINS=http://localhost:4321,https://fundacionseno.org
```

Origins should not contain a trailing slash.

## Backend — Cloudflare R2

| Variable | Required | Description |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Yes | R2 API access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 API secret |
| `R2_BUCKET` | Yes | R2 bucket name |

The backend initializes R2 during startup, so these variables must be available for the application to start successfully.

## Backend — SMTP

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SMTP_HOST` | Yes | — | SMTP hostname |
| `SMTP_USERNAME` | Yes | — | SMTP username |
| `SMTP_PASSWORD` | Yes | — | SMTP password |
| `SMTP_FROM_EMAIL` | Yes | — | Sender email |
| `SMTP_FROM_NAME` | No | `Fundación SENO` | Sender display name |
| `VOLUNTEER_TO_EMAIL` | Yes | — | Destination for volunteer applications |
| `SMTP_PORT` | No | `465` | SMTP port |
| `SMTP_SECURITY` | No | `tls` | `tls` or `starttls` |

The email service is initialized at backend startup.

## Backend — frontend rebuild worker

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CLOUDFLARE_PAGES_DEPLOY_HOOK` | No | Disabled | Cloudflare Pages deploy-hook URL |
| `FRONTEND_REBUILD_DELAY_SECONDS` | No | `300` | Delay before executing a pending rebuild |
| `FRONTEND_REBUILD_POLL_SECONDS` | No | `15` | Database polling interval |

---

# Production builds

## Frontend

```bash
cd frontend
npm install
npm run build
```

The Astro project is configured with:

```js
output: 'static'
```

and uses the Cloudflare adapter.

## Backend

```bash
cd backend
cargo build --release
```

The resulting binary is located under:

```text
target/release/backend
```

### Docker

The repository includes a multi-stage `backend/Dockerfile` using `cargo-chef` to cache dependency compilation and producing a small Debian runtime image.

Example:

```bash
cd backend
docker build -t fundacion-seno-backend .
docker run --env-file .env -p 8080:8080 fundacion-seno-backend
```

---

# Deployment

## Frontend / Cloudflare

The frontend includes:

- `astro.config.mjs`
- `wrangler.jsonc`
- `@astrojs/cloudflare`
- Cloudflare-compatible build configuration.

The backend can optionally trigger frontend deployments through a Cloudflare Pages deploy hook.

Production environment variables should be configured in Cloudflare rather than committed to the repository.

## Backend / Fly.io

The repository includes `backend/fly.toml`.

Current Fly configuration defines:

- Application name: `sitio-web-fundacion-seno`
- Internal port: `8080`
- HTTPS enforcement.
- Automatic machine start/stop.
- Shared CPU.
- 1 GB memory.

Deployment requires the Fly CLI and access to the configured Fly.io application.

From the backend directory:

```bash
fly deploy
```

Sensitive backend configuration should be stored as Fly secrets rather than committed in `.env`.

---

# Health check

The backend exposes:

```http
GET /health
```

Successful response:

```text
OK
```

Example:

```bash
curl http://localhost:8080/health
```

---

# Database note

The backend connects to PostgreSQL through:

```env
DATABASE_URL=...
```

using `sqlx::PgPool`.

**This repository currently does not include a migrations directory or SQL schema in `backend/`.**

That means cloning the repository alone is not enough to create a new empty database from scratch. A compatible PostgreSQL schema must already exist or be provisioned separately.

The frontend rebuild feature also expects its rebuild-state data to exist in PostgreSQL.

A useful future improvement would be to add versioned SQL migrations, for example:

```text
backend/
└── migrations/
    ├── 0001_initial_schema.sql
    ├── 0002_...
    └── ...
```

This would make local development, testing and disaster recovery considerably easier.

---

# Security notes

### Secrets

Never commit any of the following:

- `DATABASE_URL`
- `JWT_SECRET`
- SMTP passwords.
- R2 access keys.
- Cloudflare deploy hooks.
- Production `.env` files.

### Passwords

User passwords are handled with **Argon2** rather than stored as plaintext.

### JWT

JWTs are signed using `JWT_SECRET`.

Use a long, randomly generated production secret and keep the same secret across instances that must accept the same tokens.

### CORS

Production deployments should explicitly configure:

```env
CORS_ALLOWED_ORIGINS=https://your-frontend-domain.example
```

Only trusted frontend origins should be included.

### Authorization

Authentication alone does not grant every administrative action.

Administrative handlers use named permissions loaded from the user's role, which allows different users to have different platform capabilities.

---

# Contributing

For changes to this project:

1. Create a new branch from the current development base.
2. Keep frontend and backend changes separated when possible.
3. Do not commit secrets or local `.env` files.
4. Run the relevant build/check commands before opening a pull request.

Frontend:

```bash
cd frontend
npm run build
```

Backend:

```bash
cd backend
cargo check
```

For backend changes, keep the existing separation between:

```text
routes → handlers → repositories → database
```

and place reusable infrastructure logic under `services/` or `utils/` when appropriate.

---

## Project links

- Website: [https://fundacionseno.org](https://fundacionseno.org)
- Repository: [https://github.com/Fundacion-SENO-NQN/sitio-web](https://github.com/Fundacion-SENO-NQN/sitio-web)

---

<p align="center">
  Developed for <strong>Fundación S.E.N.O.</strong>
</p>
