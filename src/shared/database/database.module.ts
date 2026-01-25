import { Module, Global } from '@nestjs/common';
import knex, { Knex } from 'knex';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  providers: [
    {
      provide: 'KNEX',
      useFactory: async (configService: ConfigService): Promise<Knex> => {
        const config: Knex.Config = {
          client: 'pg',
          connection: {
            host: configService.get<string>('DATABASE_HOST'),
            port: configService.get<number>('DATABASE_PORT'),
            user: configService.get<string>('DATABASE_USER'),
            password: configService.get<string>('DATABASE_PASSWORD'),
            database: configService.get<string>('DATABASE_NAME'),
          },
          pool: {
            min: 2,
            max: 10,
          },
          debug: configService.get<string>('NODE_ENV') === 'development',
        };
        const db = knex(config);
        return db;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['KNEX'],
})
export class DatabaseModule { }
