# Hoppscotch Backend Development

This directory contains the Hoppscotch NestJS backend service.

## Quick Start with Docker (Recommended for Backend Development)

The fastest way to run the backend locally with hot-reload is using the standalone Docker setup:

```bash
# From the repository root
docker compose -f docker-compose.backend-dev.yml up
```

This will:
- Start a PostgreSQL database on port 5432
- Run database migrations automatically
- Start the backend on port 3170 with hot-reload enabled
- Mount your source code so changes trigger automatic restarts

The backend GraphQL playground will be available at: http://localhost:3170/graphql

### Prerequisites

1. **Docker and Docker Compose** installed
2. **Environment configuration**: Copy `.env.example` to `.env` in the repository root and configure:
   ```bash
   cp .env.example .env
   ```

   **CRITICAL**: Set a 32-character `DATA_ENCRYPTION_KEY` in `.env`:
   ```
   DATA_ENCRYPTION_KEY=your-32-character-key-here-now
   ```
   
   The backend will fail to start without this key. You can generate one with:
   ```bash
   openssl rand -base64 32 | cut -c1-32
   ```

### Stopping the Services

```bash
docker compose -f docker-compose.backend-dev.yml down
```

To remove the database volume (WARNING: deletes all data):
```bash
docker compose -f docker-compose.backend-dev.yml down -v
```

### Port Conflicts

**WARNING**: Do not run `docker-compose.backend-dev.yml` and the main `docker-compose.yml` simultaneously. They both use ports 3170 and 5432, which will cause conflicts.

If you see "port is already allocated" errors:
```bash
# Check what's using port 3170
lsof -i :3170  # On Mac/Linux
netstat -ano | findstr :3170  # On Windows

# Stop any existing Hoppscotch services
docker compose down  # Stop main services if running
```

## Development Workflow

### Hot-Reload

Code changes in `packages/hoppscotch-backend/src/` will automatically trigger a backend restart. You'll see:
```
[Nest] 123 - 07/02/2026, 12:34:56 PM   LOG [NestApplication] Nest application successfully started
```

**Note**: On Windows and Mac with Docker Desktop, file change detection can be slow (5-10 seconds). This is a Docker filesystem limitation, not a bug in this setup.

### Environment Variable Overrides

The `docker-compose.backend-dev.yml` loads `.env` and `.env.local` by default. To override specific variables, create a `.env.local` file (git-ignored) in the repository root:

```bash
# .env.local
POSTGRES_PASSWORD=mypass
DATABASE_URL=postgresql://postgres:mypass@backend-db:5432/hoppscotch
DATA_ENCRYPTION_KEY=my-local-32-character-key-here
```

The `.env.local` file takes precedence over `.env` for any variables defined in both files.

### Database Access

Connect to the database directly:
```bash
docker exec -it hoppscotch-backend-dev-db psql -U postgres -d hoppscotch
```

### Running Migrations Manually

Migrations run automatically on startup, but to run them manually:
```bash
docker compose -f docker-compose.backend-dev.yml run --rm backend pnpm exec prisma migrate dev
```

## Troubleshooting

### Backend won't start: "Cannot find module '@prisma/client'"

The Prisma client wasn't generated. Rebuild the image:
```bash
docker compose -f docker-compose.backend-dev.yml up --build
```

If that doesn't work, rebuild without cache:
```bash
docker compose -f docker-compose.backend-dev.yml build --no-cache backend
docker compose -f docker-compose.backend-dev.yml up
```

### "relation does not exist" errors

Database schema is out of sync. Reset the database:
```bash
docker compose -f docker-compose.backend-dev.yml down -v  # Remove database volume
docker compose -f docker-compose.backend-dev.yml up       # Recreate and migrate
```

### Changes not triggering hot-reload

1. Verify the source code is mounted: `docker compose -f docker-compose.backend-dev.yml config`
2. Check the backend logs: `docker compose -f docker-compose.backend-dev.yml logs backend`
3. On Windows/Mac, file change detection can be delayed by Docker Desktop's filesystem layer

### Native module errors (isolated-vm, etc.)

The anonymous volume for `node_modules/` prevents this, but if you still see errors, rebuild without cache:
```bash
docker compose -f docker-compose.backend-dev.yml down
docker compose -f docker-compose.backend-dev.yml build --no-cache backend
docker compose -f docker-compose.backend-dev.yml up
```

## Alternative: Running Without Docker

See the root `CLAUDE.md` for instructions on running the backend directly with Node.js and a local PostgreSQL instance.

## Differences from Main docker-compose.yml

- **Standalone**: Includes only backend + database, no frontend/admin/agent services
- **Hot-reload enabled**: Source code is mounted for live reloading
- **Development target**: Uses Dockerfile's `dev` target instead of `prod`
- **Isolated network**: Uses a separate Docker network to avoid conflicts
- **Lightweight**: Faster startup and lower resource usage for backend-only work
