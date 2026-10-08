import {Controller, Get} from '@nestjs/common';
import {DatabaseService} from './database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async getHealth() {
    await this.database.query('SELECT 1');
    return {status: 'ok', database: 'connected'};
  }
}
