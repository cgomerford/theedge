import { describe, it, expect } from 'vitest'
import { checkComment } from './comments'

describe('checkComment', () => {
  it('accepts a normal comment and tidies spacing', () => {
    expect(checkComment('  Sam   R ', ' Great read.\n\n\n\nThanks ')).toEqual({ ok: true, name: 'Sam R', body: 'Great read.\n\nThanks' })
  })
  it('rejects links, emails in names, empties and overlong text', () => {
    expect(checkComment('Sam', 'see https://x.com').ok).toBe(false)
    expect(checkComment('Sam', 'visit foo.com now').ok).toBe(false)
    expect(checkComment('sam@x.com', 'hi there').ok).toBe(false)
    expect(checkComment('S', 'hi there').ok).toBe(false)
    expect(checkComment('Sam', ' ').ok).toBe(false)
    expect(checkComment('Sam', 'a'.repeat(1001)).ok).toBe(false)
  })
})
