import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log, logOnce, resetLogOnce } from './log'

function spies() {
  return { debug: vi.spyOn(console, 'debug').mockImplementation(() => {}), info: vi.spyOn(console, 'info').mockImplementation(() => {}), warn: vi.spyOn(console, 'warn').mockImplementation(() => {}), error: vi.spyOn(console, 'error').mockImplementation(() => {}) }
}
function all() { log.debug('t', 'd'); log.info('t', 'i'); log.warn('t', 'w'); log.error('t', 'e') }

describe('log', () => {
  beforeEach(() => { vi.unstubAllEnvs(); resetLogOnce() })
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers() })

  it('production default prints errors only', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('LOG_LEVEL', ''); vi.stubEnv('DEBUG_LOGS', '')
    const s = spies(); all()
    expect(s.error).toHaveBeenCalledTimes(1); expect(s.warn).not.toHaveBeenCalled(); expect(s.info).not.toHaveBeenCalled(); expect(s.debug).not.toHaveBeenCalled()
  })
  it('prints everything outside production', () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('LOG_LEVEL', ''); vi.stubEnv('DEBUG_LOGS', '')
    const s = spies(); all()
    expect(s.debug).toHaveBeenCalledTimes(1); expect(s.info).toHaveBeenCalledTimes(1); expect(s.warn).toHaveBeenCalledTimes(1); expect(s.error).toHaveBeenCalledTimes(1)
  })
  it('DEBUG_LOGS=1 forces debug in production; LOG_LEVEL=silent prints nothing', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('DEBUG_LOGS', '1')
    let s = spies(); all(); expect(s.debug).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks(); vi.stubEnv('DEBUG_LOGS', ''); vi.stubEnv('LOG_LEVEL', 'silent')
    s = spies(); all(); expect(s.error).not.toHaveBeenCalled()
  })
  it('prints one short line and never dumps an object', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const s = spies()
    log.error('mlb', 'schedule failed', new Error('boom'))
    log.error('mlb', 'bad payload', { huge: 'x'.repeat(5000) })
    log.error('mlb', 'long', 'y'.repeat(1000))
    expect(s.error.mock.calls[0][0]).toBe('[mlb] schedule failed: boom')
    expect(s.error.mock.calls[1][0]).toBe('[mlb] bad payload: (object not shown)')
    expect((s.error.mock.calls[2][0] as string).length).toBeLessThan(340)
  })
  it('logOnce prints once a minute and reports what it hid', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
    const s = spies()
    for (let i = 0; i < 5; i++) logOnce('k', 'game-page', 'loader failed', 'timeout')
    expect(s.error).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-11-02T12:01:01Z'))
    logOnce('k', 'game-page', 'loader failed', 'timeout')
    expect(s.error).toHaveBeenCalledTimes(2)
    expect(s.error.mock.calls[1][0]).toBe('[game-page] loader failed (repeated 4 times): timeout')
  })
})
