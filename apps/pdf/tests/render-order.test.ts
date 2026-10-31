/**
 * A useMemo callback (and a useState initializer) runs during render, at the
 * line it is written on. If it reads a `const` the component declares further
 * down, that name is still in its temporal dead zone and the render throws.
 * TypeScript does not flag this because the read sits inside a closure. In
 * 0.12.9 the OCR bake memo read `pageGeomRef` before its declaration: every
 * scanned PDF turned into a blank window once the first page was recognized.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const APP = process.cwd()

/** `useMemo` / `useState` callbacks in the component that read a later component-level const */
function renderTimeForwardReads(file: string, component: string): string[] {
  const text = readFileSync(join(APP, file), 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let body: ts.Block | undefined
  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === component) body = node.body
  })
  if (!body) throw new Error(`${component} not found in ${file}`)

  /** component-level const/let name → where its declaration starts */
  const declaredAt = new Map<string, number>()
  const addNames = (name: ts.BindingName, pos: number): void => {
    if (ts.isIdentifier(name)) declaredAt.set(name.text, pos)
    else for (const el of name.elements) if (!ts.isOmittedExpression(el)) addNames(el.name, pos)
  }
  for (const stmt of body.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) addNames(decl.name, stmt.getStart(sf))
  }

  const isRenderTimeCall = (call: ts.CallExpression): boolean => {
    const callee = call.expression
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ''
    return name === 'useMemo' || name === 'useState'
  }

  const out: string[] = []
  const checkCallback = (fn: ts.ArrowFunction | ts.FunctionExpression, at: number): void => {
    // reads in nested functions run later (event handlers, promise callbacks): skip them
    const visit = (node: ts.Node): void => {
      if (node !== fn && ts.isFunctionLike(node)) return
      if (ts.isIdentifier(node)) {
        const parent = node.parent
        const isPropertyName =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node)
        const declPos = declaredAt.get(node.text)
        if (!isPropertyName && declPos !== undefined && declPos > at) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
          out.push(`${file}:${line + 1} reads ${node.text} before its declaration`)
        }
      }
      node.forEachChild(visit)
    }
    visit(fn)
  }

  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isRenderTimeCall(node)) {
      const fn = node.arguments[0]
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
        checkCallback(fn, node.getStart(sf))
      }
    }
    node.forEachChild(walk)
  }
  for (const stmt of body.statements) walk(stmt)
  return out
}

describe('render-time reads in the PDF app', () => {
  it('no useMemo or useState initializer reads a const declared below it', () => {
    expect(renderTimeForwardReads('src/renderer/App.tsx', 'App')).toEqual([])
  })
})
