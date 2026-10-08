import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Pool, QueryResult, QueryResultRow} from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (!connectionString) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({connectionString, max: 10, connectionTimeoutMillis: 5000});
  }

  async onModuleInit() {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: any[]): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }
}
