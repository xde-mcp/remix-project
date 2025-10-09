// type-fetcher.ts
import { Monaco } from '@monaco-editor/react'

type Library = { filePath: string; content: string }

type PackageJson = {
  name?: string
  version?: string
  types?: string
  typings?: string
  main?: string
  module?: string
  exports?: string | Record<string, any>
  typesVersions?: Record<string, Record<string, string[]>> | undefined
}

type ResolveResult = { finalUrl: string; content: string }

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/'
const VIRTUAL_BASE = 'file:///node_modules/'

const IMPORT_ANY_RE =
  /(?:import|export)\s+[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g

const TRIPLE_SLASH_REF_RE = /\/\/\/\s*<reference\s+path=["']([^"']+)["']\s*\/>/g

function isRelative(p: string): boolean {
  return p.startsWith('./') || p.startsWith('../') || p.startsWith('/')
}

function normalizeBareSpecifier(p: string): string {
  if (!p) return p
  if (p.startsWith('@')) return p.split('/').slice(0, 2).join('/')
  return p.split('/')[0]
}

function toTypesScopedName(pkg: string): string {
  if (pkg.startsWith('@')) return '@types/' + pkg.slice(1).replace('/', '__')
  return '@types/' + pkg
}

function toVirtual(url: string): string {
  return url.replace(CDN_BASE, VIRTUAL_BASE)
}

function stripJsLike(url: string): string {
  return url
    .replace(/\.d\.ts$/, '')
    .replace(/\.d\.mts$/, '')
    .replace(/\.d\.cts$/, '')
    .replace(/\.ts$/, '')
    .replace(/\.mts$/, '')
    .replace(/\.cts$/, '')
    .replace(/\.js$/, '')
    .replace(/\.mjs$/, '')
    .replace(/\.cjs$/, '')
}

async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

function guessDtsFromJs(jsPath: string): string[] {
  const base = stripJsLike(jsPath)
  const attempts = [
    `${base}.d.ts`,
    `${base}.ts`,
    `${base}/index.d.ts`,
    `${base}/index.ts`
  ]
  return attempts
}

type ExportTypeMap = Record<string, string[]>

function buildExportTypeMap(pkgName: string, pkgJson: PackageJson): ExportTypeMap {
  const map: ExportTypeMap = {}
  const base = `${CDN_BASE}${pkgName}/`

  const push = (subpath: string, relPath: string | undefined) => {
    if (!relPath) return
    const attempts = guessDtsFromJs(relPath)
    map[subpath] = attempts.map(a => new URL(a, base).href)
  }

  if (typeof pkgJson.exports === 'string') {
    push('.', pkgJson.types || pkgJson.typings || pkgJson.exports)
  } else if (pkgJson.exports && typeof pkgJson.exports === 'object') {
    for (const [k, v] of Object.entries(pkgJson.exports)) {
      if (typeof v === 'string') {
        push(k, v)
      } else if (v && typeof v === 'object') {
        if (v.types) push(k, v.types)
        else if (v.import) push(k, v.import)
        else if (v.default) push(k, v.default)
        else if (v.require) push(k, v.require)
      }
    }
  } else {
    const main = pkgJson.types || pkgJson.typings || pkgJson.module || pkgJson.main || 'index.js'
    push('.', main)
  }

  if (pkgJson.typesVersions && pkgJson.typesVersions['*']) {
    try {
      const rules = pkgJson.typesVersions['*'] as Record<string, string[]>
      for (const [pattern, arr] of Object.entries(rules)) {
        if (!Array.isArray(arr) || arr.length === 0) continue
        const sub = pattern.replace(/\/\*$/, '')
        map[sub] = arr.flatMap(p => guessDtsFromJs(p).map(a => new URL(a, base).href))
      }
    } catch (e) {
      console.warn('[TYPE-FETCHER] Failed to parse typesVersions', e)
    }
  }

  return map
}

async function tryFetchOne(urls: string[]): Promise<ResolveResult | null> {
  for (const u of [...new Set(urls)]) {
    try {
      const r = await fetch(u)
      if (r.ok) {
        const text = await r.text()
        console.log('[DIAGNOSE-RESOLVER] Resolved', u)
        return { finalUrl: u, content: text }
      } else {
        console.log('[DIAGNOSE-RESOLVER] Miss', u, 'HTTP', r.status)
      }
    } catch (e) {
      console.log('[DIAGNOSE-RESOLVER] Error for', u)
    }
  }
  return null
}

async function resolveAndFetch(url: string): Promise<ResolveResult> {
  const base = stripJsLike(url)
  const attempts = [
    `${base}.d.ts`,
    `${base}.ts`,
    `${base}/index.d.ts`,
    `${base}/index.ts`
  ]
  console.log('[DIAGNOSE-RESOLVER] Try resolve', url, 'candidates', attempts)
  const hit = await tryFetchOne(attempts)
  if (!hit) throw new Error(`Could not resolve type definition for ${url}`)
  return hit
}

async function crawl(
  entryUrl: string,
  packageRootUrl: string,
  depth: number,
  maxDepth: number,
  visited: Set<string>,
  enqueuePackage: (name: string) => void
): Promise<Library[]> {
  if (depth >= maxDepth || visited.has(entryUrl)) return []
  visited.add(entryUrl)

  const out: Library[] = []
  try {
    const { finalUrl, content } = await resolveAndFetch(entryUrl)
    const virtualPath = toVirtual(finalUrl)
    out.push({ filePath: virtualPath, content })

    const sub: Promise<Library[]>[] = []

    for (const m of content.matchAll(TRIPLE_SLASH_REF_RE)) {
      const rel = m[1]
      const nextUrl = new URL(rel, finalUrl).href
      if (!visited.has(nextUrl)) sub.push(crawl(nextUrl, packageRootUrl, depth + 1, maxDepth, visited, enqueuePackage))
    }

    for (const m of content.matchAll(IMPORT_ANY_RE)) {
      const spec = (m[1] || m[2] || m[3] || '').trim()
      if (!spec) continue
      if (isRelative(spec)) {
        const nextUrl = new URL(spec, finalUrl).href
        if (!visited.has(nextUrl)) sub.push(crawl(nextUrl, packageRootUrl, depth + 1, maxDepth, visited, enqueuePackage))
      } else {
        const bare = normalizeBareSpecifier(spec)
        if (bare) {
          enqueuePackage(bare)
          console.log('[DIAGNOSE-CRAWL] Queued dependency', bare, 'from', finalUrl)
        }
      }
    }

    const results = await Promise.all(sub)
    results.forEach(arr => out.push(...arr))
  } catch (e) {
    console.warn('[Crawler] Skip', entryUrl)
  }
  return out
}

export async function startTypeLoadingProcess(packageName: string): Promise<{ mainVirtualPath: string; libs: Library[]; subpathMap: Record<string, string> } | void> {
  console.log(`[Type Loader] Start for "${packageName}" via jsDelivr`)

  const visitedPackages = new Set<string>()
  const pendingBare = new Set<string>()
  const collected: Library[] = []
  const subpathMap: Record<string, string> = {}

  async function loadFromPackage(pkg: string): Promise<{ ok: boolean }> {
    try {
      const pkgJsonUrl = new URL('package.json', `${CDN_BASE}${pkg}/`).href
      const pkgJson = await fetchJson<PackageJson>(pkgJsonUrl)
      console.log('[Type Loader] package.json loaded for', pkg)

      const exportMap = buildExportTypeMap(pkg, pkgJson)

      function joinPkgSubpath(pkg: string, sub: string): string {
        if (!sub || sub === '.') return pkg
        let s = sub
        if (s.startsWith('./')) s = s.slice(2)
        if (s.startsWith('/')) s = s.slice(1)
        return `${pkg}/${s}`
      }

      for (const [sub, urls] of Object.entries(exportMap)) {
        const hit = await tryFetchOne(urls)
        if (hit) {
          const virtual = toVirtual(hit.finalUrl).replace(VIRTUAL_BASE, '')
          const fullKey = joinPkgSubpath(pkg, sub)      // ← 여기
          subpathMap[fullKey] = virtual
          console.log('[Type Loader] subpath map', fullKey, '->', virtual)
        }
      }


      const allEntryUrls: string[] = []
      const mainEntries = exportMap['.'] || []
      if (mainEntries.length > 0) {
        allEntryUrls.push(...mainEntries)
      } else if (pkgJson.types || pkgJson.typings) {
        allEntryUrls.push(new URL(pkgJson.types || pkgJson.typings, `${CDN_BASE}${pkg}/`).href)
      } else {
        allEntryUrls.push(new URL('index.d.ts', `${CDN_BASE}${pkg}/`).href)
      }

      const localVisited = new Set<string>()
      const enqueuePackage = (p: string) => {
        const bare = normalizeBareSpecifier(p)
        if (!bare) return
        if (bare === pkg) return
        if (!visitedPackages.has(bare)) {
          pendingBare.add(bare)
        }
      }

      for (const entry of allEntryUrls) {
        const libs = await crawl(entry, `${CDN_BASE}${pkg}/`, 0, 8, localVisited, enqueuePackage)
        collected.push(...libs)
      }

      return { ok: true }
    } catch (e) {
      console.warn('[Type Loader] No types in package', pkg, 'try @types fallback')
      try {
        const typesName = toTypesScopedName(pkg)
        if (visitedPackages.has(typesName)) return { ok: false }
        visitedPackages.add(typesName)
        return await loadFromPackage(typesName)
      } catch (ee) {
        console.warn('[Type Loader] @types fallback failed for', pkg)
        return { ok: false }
      }
    }
  }

  visitedPackages.add(packageName)
  const first = await loadFromPackage(packageName)
  if (!first.ok) {
    console.error('[Type Loader] Failed for', packageName)
    return
  }

  while (pendingBare.size) {
    const next = Array.from(pendingBare)
    pendingBare.clear()
    for (const dep of next) {
      if (visitedPackages.has(dep)) continue
      visitedPackages.add(dep)
      await loadFromPackage(dep)
    }
  }

  const mainVirtualPath =
    collected.find(f => f.filePath.includes(`${VIRTUAL_BASE}${packageName}/`))?.filePath ||
    collected[0]?.filePath ||
    ''

  console.log(`[Type Loader] Done for "${packageName}" files=${collected.length}`)

  try {
    const pkgJsonUrl = new URL('package.json', `${CDN_BASE}${packageName}/`).href
    const pkgJson = await fetchJson<any>(pkgJsonUrl)
    collected.unshift({
      filePath: `file:///node_modules/${packageName}/package.json`,
      content: JSON.stringify(pkgJson, null, 2)
    })
  } catch {}

  return { mainVirtualPath, libs: collected, subpathMap }
}
