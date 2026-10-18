import { describe, expect, it } from 'vitest'
import { deviceLabel } from './device-label.ts'

describe('deviceLabel', () => {
  it('names the browser and the system', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on macOS')
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      ),
    ).toBe('Safari on macOS')
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      ),
    ).toBe('Edge on Windows')
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Chrome on iOS')
  })

  it('falls back when it cannot tell', () => {
    expect(deviceLabel(null)).toBe('Unknown device')
    expect(deviceLabel('curl/8.7.1')).toBe('Unknown device')
  })
})
