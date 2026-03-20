import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  NotFoundException,
  HttpCode,
  InternalServerErrorException,
} from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { MessagesService } from './messages.service';
import { ProtocolMessage } from '@agent-communication/shared-types';

@Controller('api')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('messages')
  getMessages(
    @Query('source') source?: string,
    @Query('target') target?: string,
    @Query('method') method?: string,
    @Query('status') status?: 'pending' | 'success' | 'error' | 'timeout',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.messagesService.getMessages({
      source,
      target,
      method,
      status,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('messages/:id')
  getMessage(@Param('id') id: string) {
    const message = this.messagesService.getMessage(id);
    if (!message) {
      throw new NotFoundException(`Message ${id} not found`);
    }
    return message;
  }

  @Post('messages')
  @HttpCode(201)
  recordMessage(@Body() body: ProtocolMessage) {
    return this.messagesService.recordMessage(body);
  }

  @Get('data/payment-gates')
  getPaymentGates() {
    const filePath = join(process.cwd(), 'data/payment-gates.json');
    if (!existsSync(filePath)) {
      throw new NotFoundException('payment-gates.json not found');
    }
    try {
      const raw = readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      throw new InternalServerErrorException(`Failed to read payment-gates.json: ${err}`);
    }
  }

  @Get('data/payment-receipts')
  getPaymentReceipts() {
    const filePath = join(process.cwd(), 'data/payment-receipts.json');
    if (!existsSync(filePath)) {
      throw new NotFoundException('payment-receipts.json not found');
    }
    try {
      const raw = readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      throw new InternalServerErrorException(`Failed to read payment-receipts.json: ${err}`);
    }
  }
}
