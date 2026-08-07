import { ValidationPipe } from '@nestjs/common';
import { configureApplication } from './app-bootstrap';

describe('platform API bootstrap hardening', () => {
  it('configures trusted proxy resolution, bounded parsers, and strict DTO validation', () => {
    const app = {
      disable: jest.fn(),
      set: jest.fn(),
      useBodyParser: jest.fn(),
      useGlobalPipes: jest.fn(),
    };

    configureApplication(app as never);

    expect(app.disable).toHaveBeenCalledWith('x-powered-by');
    expect(app.set).toHaveBeenCalledWith('trust proxy', 1);
    expect(app.useBodyParser).toHaveBeenCalledWith('json', {
      limit: '55mb',
      strict: true,
    });
    expect(app.useBodyParser).toHaveBeenCalledWith('urlencoded', {
      limit: '1mb',
      extended: true,
    });
    expect(app.useGlobalPipes.mock.calls[0][0]).toBeInstanceOf(ValidationPipe);
  });
});
