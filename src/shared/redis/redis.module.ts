import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS',
      useFactory: async (configService: ConfigService): Promise<Redis> => {
        const logger = new Logger('RedisModule');

        const redis = new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
          // Retry strategy
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            logger.warn(`Redis retry attempt ${times}, delay: ${delay}ms`);
            return delay;
          },
          // Graceful degradation: no encolar si Redis está caído
          enableOfflineQueue: false,
          maxRetriesPerRequest: 3,
          // Connection timeout
          connectTimeout: 10000,
          // Lazy connect (no bloquear el inicio si Redis no está disponible)
          lazyConnect: true,
        });

        // Event handlers
        redis.on('connect', () => {
          logger.log('Redis client connected');
        });

        redis.on('ready', () => {
          logger.log('Redis client ready');
        });

        redis.on('error', (err) => {
          logger.error('Redis client error:', err);
        });

        redis.on('close', () => {
          logger.warn('Redis client connection closed');
        });

        redis.on('reconnecting', () => {
          logger.warn('Redis client reconnecting...');
        });

        // Intentar conectar
        try {
          await redis.connect();
          logger.log('Redis connection established successfully');
        } catch (error) {
          logger.error(
            'Failed to connect to Redis. Application will continue with degraded performance.',
            error,
          );
          // No lanzar error - permitir que la app inicie sin Redis
          // El sistema usará fallback a DB para idempotencia
        }

        return redis;
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: ['REDIS', RedisService],
})
export class RedisModule { }
