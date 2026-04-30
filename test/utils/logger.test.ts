import { describe, it, expect, vi } from 'vitest';
import { createDefaultLogger } from '../../src/utils/logger';

describe('createDefaultLogger', () => {
  it('should log info messages with timestamp', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createDefaultLogger();
    logger.info('test message');
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0][0] as string;
    expect(call).toContain('[INFO]');
    expect(call).toContain('test message');
    spy.mockRestore();
  });

  it('should log warn messages', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createDefaultLogger();
    logger.warn('warning message');
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0][0] as string;
    expect(call).toContain('[WARN]');
    spy.mockRestore();
  });

  it('should log error messages', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createDefaultLogger();
    logger.error('error message');
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0][0] as string;
    expect(call).toContain('[ERROR]');
    spy.mockRestore();
  });

  it('should include context object when provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createDefaultLogger();
    logger.info('test', { key: 'value' });
    const callArgs = spy.mock.calls[0].join(' ');
    expect(callArgs).toContain('key');
    expect(callArgs).toContain('value');
    spy.mockRestore();
  });
});
