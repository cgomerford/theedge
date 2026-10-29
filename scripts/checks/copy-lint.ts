/**
 * copy-lint: flags banned user-facing words (lean, picks, odds, start/sit, ...).
 * Usage: npx tsx scripts/checks/copy-lint.ts [--report-only] <paths...>
 * Parses .ts/.tsx with the TypeScript compiler and checks only user-visible text
 * (JSX text, string literals, template text). Scans .md files line by line.
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

import { BANNED, ALLOWED, BANNED_RE, lintText, type Hit } from '../../src/lib/banned-words'
export { BANNED, ALLOWED, lintText }
export type { Hit }

function escape(s: string) { return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') }

function isCodeToken(s: string) { return !/\s/.test(s) && s === s.toLowerCase() }
// CSS blocks (e.g. "align-items: start;") are code, not copy.
function looksLikeCss(s: string) { return /[{;]\s*[a-z-]+\s*:/.test(s) || /[a-z-]+\s*:\s*[^;]+;/.test(s) }

// .md files are developer docs: generic English words (add, drop, start, tier, value ...) would flag
// every sentence, so markdown is checked against the prediction/betting/fantasy-advice words only.
// A line can opt out with <!-- copy-lint-ignore --> (used where a rule has to name a banned word).
import { MD_RE } from '../../src/lib/banned-words'
export function lintMdLine(text: string, line: number): Hit[] {
  if (text.includes('copy-lint-ignore')) return []
  let cleaned = text.replace(/`[^`]*`/g, m => ' '.repeat(m.length))
  for (const re of ALLOWED) cleaned = cleaned.replace(re, m => ' '.repeat(m.length))
  const hits: Hit[] = []
  MD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MD_RE.exec(cleaned))) hits.push({ line, col: m.index + 1, word: m[1], context: text.slice(Math.max(0, m.index - 20), m.index + m[1].length + 20) })
  return hits
}

export function lintSource(file: string, src: string): Hit[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind)
  const out: Hit[] = []
  const add = (node: ts.Node, text: string, skipLeading = 0) => {
    if (!text.trim()) return
    if (isCodeToken(text.trim()) || looksLikeCss(text)) return
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf) + skipLeading)
    // multi-line text: lint each line so reported lines are right
    text.split('\n').forEach((ln, i) => {
      for (const h of lintText(ln, pos.line + 1 + i, i === 0 ? pos.character + 1 : 1)) out.push(h)
    })
  }
  const skipped = (node: ts.Node): boolean => {
    let p: ts.Node | undefined = node.parent
    while (p) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isTypeNode(p) || ts.isImportTypeNode(p)) return true
      if (ts.isLiteralTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true
      if (ts.isJsxAttribute(p)) {
        const n = p.name.getText(sf)
        if (n === 'className' || n === 'style') return true
      }
      if (ts.isPropertyAssignment(p) && p.parent && ts.isObjectLiteralExpression(p.parent)) {
        const gp = p.parent.parent
        if (gp && ts.isJsxExpression(gp) && gp.parent && ts.isJsxAttribute(gp.parent) && gp.parent.name.getText(sf) === 'style') return true
      }
      p = p.parent
    }
    return false
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) add(node, node.text)
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !skipped(node)) add(node, node.text, 1)
    else if ((ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && !skipped(node)) add(node, node.text, 1)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function walk(p: string, acc: string[]) {
  if (!fs.existsSync(p)) return
  const st = fs.statSync(p)
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) if (e !== 'node_modules' && e !== '.next') walk(path.join(p, e), acc)
  } else acc.push(p)
}

function main() {
  const args = process.argv.slice(2)
  const reportOnly = args.includes('--report-only')
  const files: string[] = []
  for (const a of args.filter(a => a !== '--report-only')) walk(a, files)
  let total = 0
  for (const f of files) {
    if (f.endsWith('src/lib/banned-words.ts')) continue   // the word list itself
    let hits: Hit[] = []
    if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts') && !/\.test\.tsx?$/.test(f)) hits = lintSource(f, fs.readFileSync(f, 'utf8'))
    else if (f.endsWith('.md')) fs.readFileSync(f, 'utf8').split('\n').forEach((ln, i) => hits.push(...lintMdLine(ln, i + 1)))
    for (const h of hits) console.log(`${f}:${h.line}:${h.col}  ${h.word}  "…${h.context}…"`)
    total += hits.length
  }
  console.log(`copy-lint: ${total} hit(s) in ${files.length} file(s)`)
  if (total && !reportOnly) process.exit(1)
}

if (process.argv[1] && /copy-lint\.ts$/.test(process.argv[1])) main()
