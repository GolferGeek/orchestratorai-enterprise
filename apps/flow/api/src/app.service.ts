import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Flow API — Productivity Suite Backend';
  }
}
