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

export async function startTypeLoadingProcess(packageName: string, monaco: Monaco): Promise<string | void> {
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

async function loadTypesInBackground(packageName: string, monaco: Monaco): Promise<string | void> {
  const baseUrl = `https://cdn.jsdelivr.net/npm/${packageName}/`
  const packageJsonUrl = `${baseUrl}package.json`
  const response = await fetch(packageJsonUrl)

  if (!response.ok) throw new Error(`Failed to fetch package.json for "${packageName}"`)

  const packageJson = await response.json()
  
  console.log(`[Type Fetcher] Fetched package.json for "${packageName}", version: ${packageJson.version}`)

  addLibToMonaco(`file:///node_modules/${packageName}/package.json`, JSON.stringify(packageJson), monaco)

  let mainTypeFileRelativePath: string | undefined = undefined
  const exports = packageJson.exports

  if (typeof exports === 'object' && exports !== null) {
    const mainExport = exports['.']
    if (typeof mainExport === 'object' && mainExport !== null) {
      if (typeof mainExport.types === 'string') mainTypeFileRelativePath = mainExport.types
      else if (typeof mainExport.import === 'string') mainTypeFileRelativePath = mainExport.import
      else if (typeof mainExport.default === 'string') mainTypeFileRelativePath = mainExport.default
    } else if (typeof mainExport === 'string') {
      mainTypeFileRelativePath = mainExport
    }
  }
    
  if (!mainTypeFileRelativePath) {
      mainTypeFileRelativePath = packageJson.types || packageJson.typings
  }

  if (!mainTypeFileRelativePath) {
      throw new NoTypesError(`No 'types', 'typings', or 'exports' field found in package.json.`)
  }

  if (!mainTypeFileRelativePath.startsWith('./')) mainTypeFileRelativePath = './' + mainTypeFileRelativePath

  const rootTypeFileUrl = new URL(mainTypeFileRelativePath, baseUrl).href
  console.log('[DEBUG 2-1] Attempting to fetch main type file from URL:', rootTypeFileUrl)

  const { finalUrl: finalRootUrl, content: rootContent } = await resolveAndFetchDts(rootTypeFileUrl)
  const virtualPath = finalRootUrl.replace('https://cdn.jsdelivr.net/npm', 'file:///node_modules')
  addLibToMonaco(virtualPath, rootContent, monaco)
  console.log(`[Type Fetcher] Immediate load complete for ${packageName}'s main file.`);
  
  (async () => {
    if (packageJson.dependencies) {
      console.log(`[Type Fetcher] Found ${Object.keys(packageJson.dependencies).length} dependencies for ${packageName}. Fetching them...`)
      Object.keys(packageJson.dependencies).forEach(dep => startTypeLoadingProcess(dep, monaco))
    }

    const queue = [{ url: finalRootUrl, content: rootContent }]
    const processedUrls = new Set<string>([finalRootUrl])

    while (queue.length > 0) {
      const { url: currentFileUrl, content: currentFileContent } = queue.shift()!
      const relativeImports = [...currentFileContent.matchAll(/(?:from|import)\s+['"]((?:\.\.?\/)[^'"]+)['"]/g)]

      for (const match of relativeImports) {
        const relativePath = match[1]
        const resolvedUrl = new URL(relativePath, currentFileUrl).href

        if (processedUrls.has(resolvedUrl)) continue
        processedUrls.add(resolvedUrl)

        try {
          const { finalUrl, content } = await resolveAndFetchDts(resolvedUrl)
          const newVirtualPath = finalUrl.replace('https://cdn.jsdelivr.net/npm', 'file:///node_modules')
          if (!loadedLibs.has(newVirtualPath)) {
            addLibToMonaco(newVirtualPath, content, monaco)
            queue.push({ url: finalUrl, content })
          }
        } catch (error) {}
      }
    }
  })()

  return virtualPath
}

function addLibToMonaco(filePath: string, content: string, monaco: Monaco) {
  if (loadedLibs.has(filePath)) return
  monaco.languages.typescript.typescriptDefaults.addExtraLib(content, filePath)
  loadedLibs.add(filePath)
}