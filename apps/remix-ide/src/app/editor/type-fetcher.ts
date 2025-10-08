// type-fetcher.ts
import { Monaco } from '@monaco-editor/react'

type Library = { filePath: string; content: string }

const IMPORT_RE = /from\s*['"]((?!.*\.(css|json|svg))[^'"]+)['"]/g

async function resolveAndFetch(url: string): Promise<{ finalUrl: string; content: string }> {
  const basePath = url
    .replace(/\.d\.ts$/, '')
    .replace(/\.ts$/, '')
    .replace(/\.d\.mts$/, '')
    .replace(/\.mts$/, '')
    .replace(/\.d\.cts$/, '')
    .replace(/\.cts$/, '')
    .replace(/\.js$/, '')
    .replace(/\.mjs$/, '')
    .replace(/\.cjs$/, '')

  const attempts = [
    `${basePath}.d.ts`,
    `${basePath}.ts`,
    `${basePath}.d.mts`,
    `${basePath}.mts`,
    `${basePath}.d.cts`,
    `${basePath}.cts`,
    `${basePath}/index.d.ts`,
    `${basePath}/index.ts`,
  ]
  
  const uniqueAttempts = [...new Set(attempts)]
  console.log(`[DIAGNOSE-RESOLVER] Attempting to resolve: ${url}. Trying:`, uniqueAttempts)

  for (const attemptUrl of uniqueAttempts) {
    try {
      const response = await fetch(attemptUrl)
      if (response.ok) {
        console.log(`[DIAGNOSE-RESOLVER] ✅ Success for ${url} at ${attemptUrl}`)
        return { finalUrl: attemptUrl, content: await response.text() }
      }
    } catch (e) {}
  }
  throw new Error(`Could not resolve type definition for ${url}`)
}

async function crawl(
  entryUrl: string,
  packageRootUrl: string,
  depth: number,
  maxDepth: number,
  visited: Set<string>
): Promise<Library[]> {
  if (depth >= maxDepth || visited.has(entryUrl)) {
    return []
  }
  visited.add(entryUrl)

  const collectedLibs: Library[] = []
  
  try {
    const { finalUrl, content } = await resolveAndFetch(entryUrl)
    const virtualPath = finalUrl.replace('https://cdn.jsdelivr.net/npm/', 'file:///node_modules/')
    collectedLibs.push({ filePath: virtualPath, content })

    const subPromises: Promise<Library[]>[] = []
    for (const match of content.matchAll(IMPORT_RE)) {
      const importPath = match[1]
      if (!importPath.startsWith('.')) continue
      const nextUrl = new URL(importPath, finalUrl).href
      subPromises.push(crawl(nextUrl, packageRootUrl, depth + 1, maxDepth, visited))
    }

    const results = await Promise.all(subPromises)
    results.forEach(libs => collectedLibs.push(...libs))
  } catch (e) {
    console.warn(`[Crawler] Could not fetch/process ${entryUrl}, but continuing...`)
  }
  
  return collectedLibs
}

export async function startTypeLoadingProcess(packageName: string): Promise<{ mainVirtualPath: string; libs: Library[] } | void> {
  console.log(`[Type Loader] Starting JSDELIVR Limited Depth Crawl for "${packageName}"...`)
  const baseUrl = `https://cdn.jsdelivr.net/npm/${packageName}/`
  
  try {
    const packageJsonUrl = new URL('package.json', baseUrl).href
    const response = await fetch(packageJsonUrl)
    if (!response.ok) throw new Error(`Failed to fetch package.json for "${packageName}"`)

    const packageJson = await response.json()
    const allCollectedLibs: Library[] = [{
      filePath: `file:///node_modules/${packageName}/package.json`,
      content: JSON.stringify(packageJson, null, 2),
    }]

    let mainTypePath = packageJson.types || packageJson.typings
    if (!mainTypePath && typeof packageJson.exports === 'object' && packageJson.exports?.['.']?.types) {
      mainTypePath = packageJson.exports['.'].types
    }
    mainTypePath = mainTypePath || 'index.d.ts'

    const mainEntryUrl = new URL(mainTypePath, baseUrl).href
    const visited = new Set<string>()
    const libsFromCrawl = await crawl(mainEntryUrl, baseUrl, 0, 6, visited)
    allCollectedLibs.push(...libsFromCrawl)

    const mainVirtualPath = libsFromCrawl.length > 0 ? libsFromCrawl[0].filePath : ''
    console.log(`[Type Loader] Finished Crawl for "${packageName}". Total files collected: ${allCollectedLibs.length}.`)

    return { mainVirtualPath, libs: allCollectedLibs }
  } catch (error) {
    console.error(`[Type Loader] Failed to load types for "${packageName}":`, error.message)
  }
}