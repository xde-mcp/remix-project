import { Monaco } from '@monaco-editor/react'

const loadedFiles = new Set<string>()

function resolvePath(baseFilePath: string, relativePath: string): string {
  const newUrl = new URL(relativePath, baseFilePath)
  return newUrl.href
}

export async function fetchAndLoadTypes(packageName: string, monaco: Monaco) {
  const initialPackageJsonPath = `file:///node_modules/${packageName}/package.json`
  if (loadedFiles.has(initialPackageJsonPath)) return

  try {
    const response = await fetch(`https://cdn.jsdelivr.net/npm/${packageName}/package.json`)
    if (!response.ok) {
      if (!packageName.startsWith('@types/')) {
        console.warn(`[Type Fetcher] Failed to get package.json for "${packageName}". Trying @types...`)
        return fetchAndLoadTypes(`@types/${packageName}`, monaco)
      }
      console.error(`[Type Fetcher] Failed to get package.json for "${packageName}".`)
      return
    }

    const packageJson = await response.json()
    const filesToProcess: string[] = []

    addFileToMonaco(initialPackageJsonPath, JSON.stringify(packageJson), monaco)

    const mainTypeFile = packageJson.types || packageJson.typings || 'index.d.ts'
    const mainTypeFilePath = resolvePath(initialPackageJsonPath, mainTypeFile)
    filesToProcess.push(mainTypeFilePath)

    if (packageJson.dependencies) {
      for (const depName of Object.keys(packageJson.dependencies)) {
        fetchAndLoadTypes(depName, monaco)
      }
    }

    while (filesToProcess.length > 0) {
      const currentFilePath = filesToProcess.shift()
      if (!currentFilePath || loadedFiles.has(currentFilePath)) continue

      try {
        const cdnUrl = currentFilePath.replace('file:///node_modules/', 'https://cdn.jsdelivr.net/npm/')
        const fileResponse = await fetch(cdnUrl)

        if (fileResponse.ok) {
          const content = await fileResponse.text()
          addFileToMonaco(currentFilePath, content, monaco)

          const relativeImports = [...content.matchAll(/(from\s+['"](\.\.?\/.*?)['"])|(import\s+['"](\.\.?\/.*?)['"])/g)]
          for (const match of relativeImports) {
            const relativePath = match[2] || match[4]
            if (relativePath) {
              const newPath = resolvePath(currentFilePath, relativePath)
              const finalPath = newPath.endsWith('.d.ts') ? newPath : `${newPath}.d.ts`
              if (!loadedFiles.has(finalPath)) {
                filesToProcess.push(finalPath)
              }
            }
          }
        } else {
          console.warn(`[Type Fetcher] 404 - Could not fetch ${cdnUrl}`)
        }
      } catch (e) {
        console.error(`[Type Fetcher] Error fetching or processing ${currentFilePath}`, e)
        loadedFiles.add(currentFilePath)
      }
    }
  } catch (error) {
    console.error(`[Type Fetcher] Critical error processing ${packageName}:`, error)
  }
}

function addFileToMonaco(filePath: string, content: string, monaco: Monaco) {
  if (loadedFiles.has(filePath)) return

  monaco.languages.typescript.typescriptDefaults.addExtraLib(content, filePath)
  loadedFiles.add(filePath)
}