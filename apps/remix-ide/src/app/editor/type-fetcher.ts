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
    if (error.message.includes('No type definition') || error.message.includes('Failed to fetch any type definition')) {
      console.warn(`[Type Fetcher] No types found for "${packageName}". Reason:`, error.message)
      const typesPackageName = getTypesPackageName(packageName)
      if (packageName === typesPackageName) return

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
    attempts.push(urlWithoutTrailingSlash.replace(/\.(m|c)?js$/, '.d.mts'))
    attempts.push(urlWithoutTrailingSlash.replace(/\.(m|c)?js$/, '.d.cts'))
  } else if (!/\.d\.(m|c)?ts$/.test(urlWithoutTrailingSlash)) {
    attempts.push(`${urlWithoutTrailingSlash}.d.ts`)
    attempts.push(`${urlWithoutTrailingSlash}.d.mts`)
    attempts.push(`${urlWithoutTrailingSlash}.d.cts`)
    attempts.push(`${urlWithoutTrailingSlash}/index.d.ts`)
    attempts.push(`${urlWithoutTrailingSlash}/index.d.mts`)
    attempts.push(`${urlWithoutTrailingSlash}/index.d.cts`)
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
  console.log(`[Type Fetcher DBG] 'exports' field detected: ${hasExports}`)

  if (hasExports) {
    for (const key in packageJson.exports) {
      if (key.includes('*') || key.endsWith('package.json')) continue

      const entry = packageJson.exports[key]
      
      let typePath: string | null = null

      if (typeof entry === 'string') {
        if (!entry.endsWith('.json')) {
          typePath = entry.replace(/\.(m|c)?js$/, '.d.ts')
        }
      } else if (typeof entry === 'object' && entry !== null) {
        if (typeof entry.types === 'string') {
          typePath = entry.types
        } 
        else if (typeof entry.import === 'string') {
          typePath = entry.import.replace(/\.(m|c)?js$/, '.d.ts')
        } else if (typeof entry.default === 'string') {
          typePath = entry.default.replace(/\.(m|c)?js$/, '.d.ts')
        }
      }

      if (typePath) {
        console.log(`[Type Fetcher DBG] Found type path for exports['${key}']: ${typePath}`)
        typePathsToFetch.add(typePath)
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
    const mainField = packageJson.main
    if (typeof mainField === 'string') {
      console.log(`[Type Fetcher DBG] Inferring from 'main' field: ${mainField}`)
      typePathsToFetch.add(mainField.replace(/\.(m|c)?js$/, '.d.ts'))
    }
    
    if (typePathsToFetch.size === 0) {
       throw new NoTypesError(`No type definition entry found in package.json.`)
    }
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
    const depPromises = Object.keys(packageJson.dependencies).map(dep => {
      try {
        return startTypeLoadingProcess(dep, monaco)
      } catch(e) {
        console.warn(`[Type Fetcher] Failed to start loading types for dependency: ${dep}`, e.message)
        return Promise.resolve()
      }
    })
    await Promise.all(depPromises)
  }
  
  return { virtualPath: mainVirtualPath, hasExports }
}

function addLibToMonaco(filePath: string, content: string, monaco: Monaco) {
  if (loadedLibs.has(filePath)) return
  monaco.languages.typescript.typescriptDefaults.addExtraLib(content, filePath)
  loadedLibs.add(filePath)
}