import { describe, it, expect } from 'vitest'
import { assertWriteTarget, EXPECTED_PROJECT_REF, projectRefFromUrl, WriteRefusedError } from './guard'

const URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`
describe('the importer refuses to write without a confirmed project ref', () => {
  it('reads the ref out of the URL', () => { expect(projectRefFromUrl(URL)).toBe(EXPECTED_PROJECT_REF); expect(projectRefFromUrl('http://localhost:54321')).toBeNull(); expect(projectRefFromUrl(undefined)).toBeNull() })
  it('refuses with no --confirm-project, and says which ref to pass', () => {
    expect(() => assertWriteTarget(URL, undefined)).toThrow(WriteRefusedError)
    expect(() => assertWriteTarget(URL, undefined)).toThrow(new RegExp(`--confirm-project=${EXPECTED_PROJECT_REF}`))
  })
  it('refuses a ref that does not match the target', () => { expect(() => assertWriteTarget(URL, 'abcdefghijklmnopqrst')).toThrow(/does not match/) })
  it('refuses a missing or non-Supabase URL', () => { expect(() => assertWriteTarget(undefined, 'x')).toThrow(WriteRefusedError); expect(() => assertWriteTarget('https://example.com', 'x')).toThrow(WriteRefusedError) })
  it('accepts an explicit matching ref and reports whether it is the expected project', () => {
    expect(assertWriteTarget(URL, EXPECTED_PROJECT_REF)).toMatchObject({ ref: EXPECTED_PROJECT_REF, matchesExpected: true })
    const other = 'https://abcdefghijklmnopqrst.supabase.co'
    expect(assertWriteTarget(other, 'abcdefghijklmnopqrst').matchesExpected).toBe(false)
  })
})
