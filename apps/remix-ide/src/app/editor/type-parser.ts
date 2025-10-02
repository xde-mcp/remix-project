import * as acorn from 'acorn'

export function parseImports(code: string): string[] {
  const packages: string[] = []

  try {
    const ast = acorn.parse(code, { sourceType: 'module', ecmaVersion: 'latest' })

    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration') {
        if (node.source && typeof node.source.value === 'string') {
          packages.push(node.source.value)
        }
      }
    }
  } catch (error) {
    console.error('[Type Parser] Code parsing error:', error.message)
  }

  return [...new Set(packages)]
}