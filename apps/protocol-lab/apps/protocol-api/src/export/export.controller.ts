import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';

@Controller('api/export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('messages.json')
  getMessagesJson() {
    return this.exportService.getAllMessages();
  }

  @Get('messages.csv')
  getMessagesCsv(@Res() res: Response) {
    const messages = this.exportService.getAllMessages();
    const csv = this.exportService.messagesToCsv(messages);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=messages.csv');
    res.send(csv);
  }

  @Get('metrics.json')
  getMetricsJson() {
    return this.exportService.getMetrics();
  }

  @Get('events.json')
  getEventsJson() {
    return this.exportService.getEvents();
  }

  @Get('events.csv')
  getEventsCsv(@Res() res: Response) {
    const events = this.exportService.getEvents();
    const csv = this.exportService.eventsToCsv(events);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=events.csv');
    res.send(csv);
  }
}
