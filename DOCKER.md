# Docker Setup Guide

## 🐳 Services

This project uses Docker Compose with the following services:

- **PostgreSQL 13** - Main database
- **Redis 7** - Cache and idempotency layer (with AOF persistence)
- **App** - NestJS application

## 🚀 Quick Start

### Development (Local without Docker)

```bash
# Start PostgreSQL and Redis only
docker-compose up db redis -d

# Run migrations
npm run migration:latest

# Start app locally
npm run start:dev
```

**Environment variables (.env):**
```bash
DATABASE_HOST=localhost
REDIS_HOST=localhost
```

---

### Development (Full Docker Compose)

```bash
# Start all services (db, redis, app)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

**Environment variables:** Defined in `docker-compose.yml`

---

## 📦 Redis Configuration

### Persistence (AOF - Append Only File)

Redis is configured with AOF persistence:

```yaml
command: redis-server --appendonly yes
volumes:
  - redis_data:/data
```

**What this means:**
- Every write operation is logged to disk
- Data survives container restarts
- Slower than no persistence, but safer for idempotency

### Health Checks

Both PostgreSQL and Redis have health checks:

```yaml
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 10s
  timeout: 3s
  retries: 3
```

The app waits for both services to be healthy before starting.

---

## 🔧 Useful Commands

### Redis CLI

```bash
# Connect to Redis CLI
docker exec -it redis redis-cli

# Check all webhook keys
docker exec -it redis redis-cli KEYS 'webhook:*'

# Get a specific key
docker exec -it redis redis-cli GET 'webhook:evt_stripe_123'

# Flush all keys (⚠️ testing only)
docker exec -it redis redis-cli FLUSHDB

# Check Redis info
docker exec -it redis redis-cli INFO
```

### PostgreSQL

```bash
# Connect to PostgreSQL
docker exec -it postgres psql -U postgres -d payment-orchestrator

# List tables
docker exec -it postgres psql -U postgres -d payment-orchestrator -c "\dt"

# Query webhook_events
docker exec -it postgres psql -U postgres -d payment-orchestrator -c "SELECT * FROM webhook_events LIMIT 10;"
```

### Docker Compose

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Rebuild app image
docker-compose up -d --build app

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f redis

# Remove volumes (⚠️ deletes all data)
docker-compose down -v
```

---

## 🗄️ Data Persistence

Data is persisted in Docker volumes:

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect payment-processing-app-nest_redis_data

# Remove volumes (⚠️ data loss)
docker volume rm payment-processing-app-nest_redis_data
docker volume rm payment-processing-app-nest_db_data
```

---

## 🔍 Troubleshooting

### Redis not connecting

```bash
# Check if Redis is running
docker-compose ps

# Check Redis logs
docker-compose logs redis

# Test Redis connection
docker exec -it redis redis-cli ping
# Expected: PONG
```

### PostgreSQL not connecting

```bash
# Check if PostgreSQL is ready
docker exec -it postgres pg_isready -U postgres

# Check PostgreSQL logs
docker-compose logs db
```

### App not starting

```bash
# Check app logs
docker-compose logs app

# Rebuild app
docker-compose up -d --build app

# Check environment variables
docker exec -it payment-orchestrator-app env | grep REDIS
```

---

## 🎯 Recommended Workflow

### For Development

1. **Start infrastructure only:**
   ```bash
   docker-compose up db redis -d
   ```

2. **Run app locally:**
   ```bash
   npm run start:dev
   ```

3. **Benefits:**
   - Fast hot-reload
   - Easy debugging
   - Full TypeScript support in IDE

### For Testing (Full Docker)

1. **Start everything:**
   ```bash
   docker-compose up -d
   ```

2. **Run migrations:**
   ```bash
   docker exec -it payment-orchestrator-app npm run migration:latest
   ```

3. **Test API:**
   ```bash
   curl http://localhost:3000/health
   ```

---

## 🔐 Production Considerations

For production, you should:

1. **Add Redis password:**
   ```yaml
   redis:
     command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
   ```

2. **Use environment files:**
   ```bash
   docker-compose --env-file .env.production up -d
   ```

3. **Enable TLS for PostgreSQL and Redis**

4. **Use managed services (AWS ElastiCache, RDS)**

---

## 📊 Monitoring

### Check Redis Memory Usage

```bash
docker exec -it redis redis-cli INFO memory
```

### Check PostgreSQL Connections

```bash
docker exec -it postgres psql -U postgres -d payment-orchestrator -c "SELECT count(*) FROM pg_stat_activity;"
```

### Check Disk Usage

```bash
docker system df -v
```
