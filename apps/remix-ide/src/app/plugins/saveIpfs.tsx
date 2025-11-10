import { Plugin } from '@remixproject/engine'
import { trackMatomoEvent } from '@remix-api'
import JSZip from 'jszip'
import IpfsHttpClient from 'ipfs-http-client'

const profile = {
  name: 'saveIpfs',
  displayName: 'Save to IPFS',
  description: 'Save workspace files as zip to IPFS',
  methods: ['save', 'restore'],
  events: [],
  version: '1.0.0',
  maintainedBy: 'Remix'
}

export class SaveIpfsPlugin extends Plugin {
  constructor() {
    super(profile)
  }

  onActivation(): void {
    trackMatomoEvent(this, { category: 'plugin', action: 'activated', name: 'saveIpfs', isClick: false })
  }

  /**
   * Private method to save workspace files as zip to IPFS
   * Similar to handleDownloadFiles but uploads to IPFS instead
   * @returns Promise with IPFS hash of the uploaded zip
   */
  async save(): Promise<string> {
    try {
      // await this.call('notification', 'toast', 'Preparing files for IPFS upload, please wait...')

      const zip = new JSZip()

      // Add readme file
      zip.file('readme.txt', 'This is a Remix backup file.\nThis zip should be used by the restore backup tool in Remix.\nThe .workspaces directory contains your workspaces.')

      // Get the browser file provider
      const browserProvider = await this.call('fileManager', 'getProvider', 'browser') as any

      // Copy all files to the zip
      await browserProvider.copyFolderToJson('/', ({ path, content }) => {
        zip.file(path, content)
      })

      // Generate zip blob
      const blob = await zip.generateAsync({ type: 'blob' })

      // Setup IPFS client
      const host = '127.0.0.1'
      const port = 5001
      const protocol = 'http'

      const ipfs = IpfsHttpClient({
        port,
        host,
        protocol,
        headers: {}
      })

      // Convert blob to buffer for IPFS
      const buffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(buffer)

      // Upload to IPFS
      // await this.call('notification', 'toast', 'Uploading to IPFS...')
      const result = await ipfs.add(uint8Array)
      const hash = result.cid.string

      // Track success
      await trackMatomoEvent(this, {
        category: 'SaveIpfs',
        action: 'upload',
        name: 'workspace',
        isClick: true
      })

      await this.call('notification', 'toast', `Successfully uploaded to IPFS: ${hash}`)

      return hash
    } catch (error) {
      const errorMessage = error.message || 'Unknown error'
      await trackMatomoEvent(this, {
        category: 'SaveIpfs',
        action: 'error',
        name: errorMessage,
        isClick: false
      })
      await this.call('notification', 'toast', `Error uploading to IPFS: ${errorMessage}`)
      throw error
    }
  }

  /**
   * Restore workspaces from an IPFS ZIP file
   * Downloads ZIP from IPFS, removes all existing workspaces, and recreates them from the ZIP
   * @param hash IPFS hash of the ZIP file to restore
   * @returns Promise that resolves when restore is complete
   */
  async restore(hash: string): Promise<void> {
    try {
      await this.call('notification', 'toast', 'Starting restore from IPFS...')

      // Setup IPFS client
      const host = '127.0.0.1'
      const port = 5001
      const protocol = 'http'

      const ipfs = IpfsHttpClient({
        port,
        host,
        protocol,
        headers: {}
      })

      // Download ZIP from IPFS
      await this.call('notification', 'toast', 'Downloading backup from IPFS...')
      const fileData = ipfs.get(hash)
      const chunks = []
      
      for await (const file of fileData) {
        if (!file.content) continue
        for await (const chunk of file.content) {
          chunks.push(chunk)
        }
      }
      
      if (chunks.length === 0) {
        throw new Error('No data found in IPFS file')
      }

      const zipData = Buffer.concat(chunks)

      // Parse ZIP file
      await this.call('notification', 'toast', 'Extracting backup file...')
      const zip = new JSZip()
      const zipContent = await zip.loadAsync(zipData)

      // Check if .workspaces folder exists in ZIP
      const workspaceFiles = Object.keys(zipContent.files).filter(path => 
        path.startsWith('.workspaces/') && path !== '.workspaces/'
      )

      if (workspaceFiles.length === 0) {
        throw new Error('No .workspaces folder found in backup file')
      }

      // Remove all existing workspaces
      await this.call('notification', 'toast', 'Removing existing workspaces...')
      const workspaces = await this.call('filePanel', 'getWorkspaces')
      for (const workspace of workspaces) {
        try {
          await this.call('filePanel', 'deleteWorkspace', workspace.name)
        } catch (error) {
          console.warn(`Failed to delete workspace ${workspace.name}:`, error)
        }
      }

      // Get workspace names from ZIP structure
      const workspaceNames = new Set<string>()
      workspaceFiles.forEach(path => {
        const parts = path.split('/')
        if (parts.length > 1 && parts[1]) {
          workspaceNames.add(parts[1])
        }
      })

      // Create workspaces and restore files
      await this.call('notification', 'toast', 'Recreating workspaces...')
      for (const workspaceName of workspaceNames) {
        try {
          // Create the workspace
          await this.call('filePanel', 'createWorkspace', workspaceName, false, false)
          
          // Switch to the workspace to restore files
          await this.call('filePanel', 'setWorkspace', workspaceName)

          // Collect all files for this workspace
          const workspacePrefix = `.workspaces/${workspaceName}/`
          const filesForWorkspace = {}
          
          for (const filePath of workspaceFiles) {
            if (filePath.startsWith(workspacePrefix) && filePath !== workspacePrefix) {
              const relativePath = filePath.substring(workspacePrefix.length)
              if (relativePath) {
                const fileContent = await zipContent.files[filePath].async('text')
                filesForWorkspace[relativePath] = { content: fileContent }
              }
            }
          }

          // Batch restore files to the workspace
          if (Object.keys(filesForWorkspace).length > 0) {
            await this.call('fileManager', 'setBatchFiles', filesForWorkspace, 'workspace', true, (error) => {
              if (error) {
                console.warn(`Error restoring files to workspace ${workspaceName}:`, error)
              }
            })
          }
        } catch (error) {
          console.warn(`Failed to create or restore workspace ${workspaceName}:`, error)
        }
      }

      // Track success
      await this.call('matomo', 'track', {
        category: 'SaveIpfs',
        action: 'restore',
        name: 'workspace',
        isClick: true
      })

      await this.call('notification', 'toast', `Successfully restored ${workspaceNames.size} workspaces from IPFS backup`)

    } catch (error) {
      const errorMessage = error.message || 'Unknown error'
      await this.call('matomo', 'track', {
        category: 'SaveIpfs',
        action: 'error',
        name: `restore: ${errorMessage}`,
        isClick: false
      })
      await this.call('notification', 'toast', `Error restoring from IPFS: ${errorMessage}`)
      throw error
    }
  }
}
