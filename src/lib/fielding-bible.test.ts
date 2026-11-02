import { describe, it, expect } from 'vitest'
import { inningsOf, parseDrsPage } from './fielding-bible'

const page = (rows: string) => `<html><body><table id="cphContent_grdvwDRSLeaderboard"><tr><th>Name</th><th>Innings</th><th>PART</th><th>Stolen Bases</th><th>Bunts</th><th>GFP/DME</th><th>Adj ER Saved</th><th>Strike Zone</th><th>GDP</th><th>OF Arm</th><th>Total Runs Saved</th></tr>${rows}</table><table><tr><td>other</td></tr></table></body></html>`
const tr = (c: string[]) => `<tr>${c.map(x => `<td>${x}</td>`).join('')}</tr>`

describe('Fielding Bible DRS page', () => {
  it('reads each fielder row, blanks as null, and decodes names', () => {
    const rows = parseDrsPage(page(tr(['Wilyer Abreu', '1357', '17', '', '', '2', '', '', '', '9', '28']) + tr(["Logan O&#39;Hoppe", '595', '-1', '-1', '0', '-3', '-5', '-7', '', '', '-17']) + tr(['Jos&#233; Ram&#237;rez', '1323.2', '21', '', '', '0', '', '', '2', '', '23'])))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ name: 'Wilyer Abreu', innings: 1357, part: 17, sb: null, gfp: 2, ofArm: 9, drs: 28 })
    expect(rows[1]).toMatchObject({ name: "Logan O'Hoppe", bunts: 0, strikeZone: -7, drs: -17 })
    expect(rows[2].name).toBe('José Ramírez'); expect(rows[2].innings).toBeCloseTo(1323.7, 1)
  })
  it('returns nothing when the grid is missing or a row is short', () => {
    expect(parseDrsPage('<html>404</html>')).toEqual([])
    expect(parseDrsPage(page('<tr><td>x</td></tr>'))).toEqual([])
  })
  it('turns baseball innings into decimals', () => { expect(inningsOf('1323.2')).toBe(1323.7); expect(inningsOf('595')).toBe(595); expect(inningsOf('10.1')).toBe(10.3); expect(inningsOf('x')).toBeNull() })
})
