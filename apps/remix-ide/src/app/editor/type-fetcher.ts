import { Monaco } from '@monaco-editor/react'

const processedPackages = new Set<string>()
const loadedLibs = new Set<string>()
const NODE_BUILTINS = new Set(['util', 'events', 'buffer', 'stream', 'path', 'fs', 'os', 'crypto', 'http', 'https', 'url', 'zlib'])

class NoTypesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoTypesError'
  }
}

function getTypesPackageName(packageName: string): string {
  if (packageName.startsWith('@')) {
    const mangledName = packageName.substring(1).replace('/', '__');
    return `@types/${mangledName}`
  }
  return `@types/${packageName}`
}

export async function startTypeLoadingProcess(packageName: string, monaco: Monaco): Promise<{ virtualPath: string; hasExports: boolean } | void> {
  if (NODE_BUILTINS.has(packageName)) {
    packageName = '@types/node'
  }
  
  if (processedPackages.has(packageName)) return
  processedPackages.add(packageName)

  console.log(`[Type Fetcher] Starting type loading process for "${packageName}"...`)
  
  try {
    return await loadTypesInBackground(packageName, monaco)
  } catch (error) {
    if (error instanceof NoTypesError) {
      console.warn(`[Type Fetcher] No types found for "${packageName}". Reason:`, error.message)
      const typesPackageName = getTypesPackageName(packageName)
      console.log(`[Type Fetcher] Trying ${typesPackageName} as a fallback...`)
      return startTypeLoadingProcess(typesPackageName, monaco)
    } else {
      console.error(`[Type Fetcher] Loading process failed for "${packageName}" and will not fallback to @types. Error:`, error.message)
    }
  }
}

async function resolveAndFetchDts(resolvedUrl: string): Promise<{ finalUrl: string; content: string }> {
  const urlWithoutTrailingSlash = resolvedUrl.endsWith('/') ? resolvedUrl.slice(0, -1) : resolvedUrl
  const attempts: string[] = []
  
  if (/\.(m|c)?js$/.test(urlWithoutTrailingSlash)) {
    attempts.push(urlWithoutTrailingSlash.replace(/\.(m|c)?js$/, '.d.ts'))
  } else if (!urlWithoutTrailingSlash.endsWith('.d.ts')) {
    attempts.push(`${urlWithoutTrailingSlash}.d.ts`)
    attempts.push(`${urlWithoutTrailingSlash}/index.d.ts`)
  } else {
    attempts.push(urlWithoutTrailingSlash)
  }

  for (const url of attempts) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return { finalUrl: url, content: await response.text() }
      }
    } catch (e) {}
  }
  throw new Error(`Could not resolve DTS file for ${resolvedUrl}`)
}

async function loadTypesInBackground(packageName: string, monaco: Monaco): Promise<{ virtualPath: string; hasExports: boolean } | void> {
  const baseUrl = `https://cdn.jsdelivr.net/npm/${packageName}/`
  const packageJsonUrl = `${baseUrl}package.json`
  const response = await fetch(packageJsonUrl)

  if (!response.ok) throw new Error(`Failed to fetch package.json for "${packageName}"`)

  const packageJson = await response.json()
  
  console.log(`[Type Fetcher] Fetched package.json for "${packageName}", version: ${packageJson.version}`)
  addLibToMonaco(`file:///node_modules/${packageName}/package.json`, JSON.stringify(packageJson), monaco)

  const typePathsToFetch = new Set<string>()

  const hasExports = typeof packageJson.exports === 'object' && packageJson.exports !== null
  console.log(`[Type Fetcher DBG] 'hasExports' field detected: ${hasExports}`)

  if (hasExports) {
    for (const key in packageJson.exports) {
      const entry = packageJson.exports[key]
      if (typeof entry === 'object' && entry !== null && typeof entry.types === 'string') {
        console.log(`[Type Fetcher DBG] Found types in exports['${key}']: ${entry.types}`)
        typePathsToFetch.add(entry.types)
      }
    }
  }

  const mainTypePath = packageJson.types || packageJson.typings
  console.log(`[Type Fetcher DBG] Top-level 'types' field: ${mainTypePath}`)
  if (typeof mainTypePath === 'string') {
    typePathsToFetch.add(mainTypePath)
  }

  console.log(`[Type Fetcher DBG] Total type paths found: ${typePathsToFetch.size}`)
  if (typePathsToFetch.size === 0) {
    throw new NoTypesError(`No type definition entry found in package.json.`)
  }

  let mainVirtualPath = ''
  for (const relativePath of typePathsToFetch) {
    let cleanPath = relativePath
    if (!cleanPath.startsWith('./')) cleanPath = './' + cleanPath
    
    const fileUrl = new URL(cleanPath, baseUrl).href
    try {
      const { finalUrl, content } = await resolveAndFetchDts(fileUrl)
      const virtualPath = finalUrl.replace('https://cdn.jsdelivr.net/npm', 'file:///node_modules')
      addLibToMonaco(virtualPath, content, monaco)
      if (!mainVirtualPath) mainVirtualPath = virtualPath
    } catch (error) {
      console.warn(`[Type Fetcher] Could not fetch sub-type file: ${fileUrl}`, error)
    }
  }
  
  if (!mainVirtualPath) throw new Error('Failed to fetch any type definition files.')

  console.log(`[Type Fetcher] Completed fetching all type definitions for ${packageName}.`)
  
  if (packageJson.dependencies) {
    console.log(`[Type Fetcher] Found ${Object.keys(packageJson.dependencies).length} dependencies for ${packageName}. Fetching them...`)
    Object.keys(packageJson.dependencies).forEach(dep => startTypeLoadingProcess(dep, monaco))
  }
  
  return { virtualPath: mainVirtualPath, hasExports }
}

function addLibToMonaco(filePath: string, content: string, monaco: Monaco) {
  if (loadedLibs.has(filePath)) return
  monaco.languages.typescript.typescriptDefaults.addExtraLib(content, filePath)
  loadedLibs.add(filePath)
}