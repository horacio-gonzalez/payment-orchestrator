# Bruno Collections - Payment Processing App

Colecciones para testing manual de la API.

## Setup

1. **Instala Bruno:** https://www.usebruno.com/downloads
2. **Abre collection:** File → Open Collection → Selecciona carpeta `bruno/`
3. **Variables:** Editadas en `collection.bru`
   - `baseUrl`: http://localhost:3001
   - Agrega más según necesites

## Estructura

```
bruno/
├── webhooks/
│   ├── stripe/
│   │   ├── payment-succeeded.bru   # Pago exitoso
│   │   ├── payment-failed.bru      # Pago fallido
│   │   └── charge-refunded.bru     # Reembolso
│   └── test-idempotency.bru        # Test duplicados
├── payments/
│   ├── create-payment.bru          # Crear payment
│   └── get-payment.bru             # Consultar payment
└── accounts/
    └── get-balance.bru             # Ver balance
```

## Testing Flow Recomendado

### 1. Test Happy Path
```
1. POST /payments (create-payment) → Guarda el payment_id
2. POST /webhooks/stripe (payment-succeeded) 
   → Usa payment_id en metadata
3. GET /admin/queues → Verifica job procesado
4. GET /accounts/:id/balance → Verifica balance actualizado
```

### 2. Test Idempotency
```
1. POST /webhooks/stripe (test-idempotency) 
   → Response: { status: 'accepted' }
2. POST mismo request → Response: { status: 'duplicate' }
3. Verificar en DB: Solo un webhook_event creado
```

### 3. Test Failure
```
1. POST /payments (create-payment)
2. POST /webhooks/stripe (payment-failed) con payment_id
3. GET /payments/:id → Status debe ser 'failed'
4. GET /accounts/:id/balance → Balance sin cambios
```

## Monitoring

- **Bull Board:** {{bullBoardUrl}} (http://localhost:3001/admin/queues)
  - Ver jobs en tiempo real
  - Retry failed jobs
  - Inspect job data
  - Monitor queue health y performance

## Tips

- **Cambiar IDs:** Cada request usa UUIDs de ejemplo, reemplázalos con IDs reales de tu DB
- **Docs embebidas:** Cada request tiene tab "Docs" con explicación
- **Variables:** Usa `{{baseUrl}}` para cambiar entre local/staging
- **Git-friendly:** Todos los `.bru` se versionan, el equipo comparte los requests

## Troubleshooting

**"Connection refused":**
- Verifica app corriendo: `npm run start:dev`
- Puerto correcto en `collection.bru`

**"Duplicate webhook" inmediato:**
- Cambia el `id` del evento en el JSON
- O limpia Redis: `redis-cli FLUSHDB`

**Job no procesa:**
- Verifica Redis corriendo: `docker ps | grep redis`
- Chequea logs: Bull Board → Failed jobs
