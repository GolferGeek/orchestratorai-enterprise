import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JsonRpcResponseService } from '../json-rpc-response.service';

describe('JsonRpcResponseService', () => {
  let service: JsonRpcResponseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JsonRpcResponseService],
    }).compile();

    service = module.get<JsonRpcResponseService>(JsonRpcResponseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildJsonRpcError', () => {
    it('should build error envelope from HttpException with string id', () => {
      const error = new BadRequestException('Invalid input');
      const result = service.buildJsonRpcError('req-1', error);

      expect(result.jsonrpc).toBe('2.0');
      expect(result.id).toBe('req-1');
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(-32602);
    });

    it('should build error envelope with numeric id', () => {
      const error = new NotFoundException('Not found');
      const result = service.buildJsonRpcError(42, error);

      expect(result.id).toBe(42);
      expect(result.error.code).toBe(-32004);
    });

    it('should build error envelope with null id', () => {
      const error = new Error('Something failed');
      const result = service.buildJsonRpcError(null, error);

      expect(result.id).toBeNull();
      expect(result.error.code).toBe(-32603);
    });
  });

  describe('statusToJsonRpcCode', () => {
    const cases: Array<[number, number]> = [
      [400, -32602],
      [422, -32602],
      [401, -32001],
      [403, -32003],
      [404, -32004],
      [409, -32009],
      [429, -32042],
      [500, -32603],
      [503, -32603], // >=500 → -32603
      [418, -32000], // unknown 4xx → -32000
    ];

    it.each(cases)(
      'should map HTTP status %i to JSON-RPC code %i',
      (status, expectedCode) => {
        expect(service.statusToJsonRpcCode(status)).toBe(expectedCode);
      },
    );
  });

  describe('mapExceptionToError', () => {
    it('should map BadRequestException (400)', () => {
      const error = new BadRequestException('Bad input');
      const result = service.mapExceptionToError(error);

      expect(result.code).toBe(-32602);
      expect(result.message).toBe('Bad input');
    });

    it('should map UnauthorizedException (401)', () => {
      const error = new UnauthorizedException('Not authorized');
      const result = service.mapExceptionToError(error);

      expect(result.code).toBe(-32001);
    });

    it('should map ForbiddenException (403)', () => {
      const error = new ForbiddenException('Forbidden');
      const result = service.mapExceptionToError(error);

      expect(result.code).toBe(-32003);
    });

    it('should map NotFoundException (404)', () => {
      const error = new NotFoundException('Not found');
      const result = service.mapExceptionToError(error);

      expect(result.code).toBe(-32004);
      expect(result.message).toBe('Not found');
    });

    it('should map HttpException with status 409', () => {
      const error = new HttpException('Conflict', 409);
      const result = service.mapExceptionToError(error);

      expect(result.code).toBe(-32009);
    });

    it('should map HttpException with status 429', () => {
      const error = new HttpException('Rate limited', 429);
      const result = service.mapExceptionToError(error);

      expect(result.code).toBe(-32042);
    });

    it('should map HttpException with status 500', () => {
      const error = new HttpException('Server error', 500);
      const result = service.mapExceptionToError(error);

      expect(result.code).toBe(-32603);
    });

    it('should map generic Error to -32603', () => {
      const error = new Error('Unexpected failure');
      const result = service.mapExceptionToError(error);

      expect(result.code).toBe(-32603);
      expect(result.message).toBe('Unexpected failure');
    });

    it('should map unknown error type to -32603 with fallback message', () => {
      const result = service.mapExceptionToError('a plain string error');

      expect(result.code).toBe(-32603);
      expect(result.message).toBe('Internal server error');
    });

    it('should extract message from object HttpException response', () => {
      const error = new BadRequestException({
        message: 'Detailed error message',
        statusCode: 400,
      });
      const result = service.mapExceptionToError(error);

      expect(result.message).toBe('Detailed error message');
    });

    it('should extract joined message from array HttpException response', () => {
      const error = new BadRequestException({
        message: ['Field A is required', 'Field B is invalid'],
        statusCode: 400,
      });
      const result = service.mapExceptionToError(error);

      expect(result.message).toBe('Field A is required, Field B is invalid');
    });

    it('should include data payload in result', () => {
      const error = new BadRequestException('Validation failed');
      const result = service.mapExceptionToError(error);

      expect(result.data).toBeDefined();
    });
  });

  describe('extractMessage edge cases (via mapExceptionToError)', () => {
    it('should handle string response payload in HttpException', () => {
      const error = new HttpException('Plain string response', 400);
      const result = service.mapExceptionToError(error);

      expect(result.message).toBe('Plain string response');
    });

    it('should handle null-ish error gracefully', () => {
      const result = service.mapExceptionToError(null);

      expect(result.code).toBe(-32603);
      expect(result.message).toBe('Internal server error');
    });

    it('should handle undefined error gracefully', () => {
      const result = service.mapExceptionToError(undefined);

      expect(result.code).toBe(-32603);
      expect(result.message).toBe('Internal server error');
    });
  });
});
