import { Plugin } from '@remixproject/engine'
import { QueryParams } from '@remix-project/remix-lib'
import { INITIAL_SYSTEM_PROMPT, FOLLOW_UP_SYSTEM_PROMPT, UPDATE_PAGE_START, UPDATE_PAGE_END, SEARCH_START, DIVIDER, REPLACE_END, NEW_PAGE_END, NEW_PAGE_START } from './prompt'

const profile = {
  name: 'ai-dapp-generator',
  displayName: 'AI DApp Generator',
  description: 'AI-powered DApp frontend generator',
  methods: ['generateDapp', 'updateDapp', 'resetDapp', 'getContext', 'getLastGeneratedDapp'],
  events: ['dappGenerated', 'dappUpdated', 'generationProgress'],
  version: '1.0.0'
}

interface GenerateDappOptions {
  description: string
  address: string
  abi: any[]
  chainId: string | number
  contractName: string
}

interface DappGenerationContext {
  address: string
  messages: any[]
}

interface Pages {
    [key: string]: string
}


export class AIDappGenerator extends Plugin {
  private contexts: Map<string, DappGenerationContext> = new Map()
  
  constructor() {
    super(profile)
  }

  /**
   * Generate a new DApp or update an existing one
   */
  async generateDapp(options: GenerateDappOptions): Promise<Pages> {
    try {
      await this.call('notification', 'toast', 'Generating the DApp, please wait... it can take up to 2 minutes depending on the contract complexity.')
      this.emit('generationProgress', { status: 'started', address: options.address })

      const context = this.getOrCreateContext(options.address)

      const message = this.createInitialMessage(options)
      const messagesToSend = [
        { role: 'user', content: message }
      ]

      const htmlContent = await this.callLLMAPI(messagesToSend, INITIAL_SYSTEM_PROMPT)

      const pages = parsePages(htmlContent)
      context.messages = [
        { role: 'user', content: message },
       { role: 'assistant', content: htmlContent }
      ]
      this.saveContext(options.address, context)

      this.emit('dappGenerated', {
        address: options.address,
        content: null,
        isUpdate: false
      })

      await this.call('notification', 'toast', 'The DApp has been generated successfully!')

      return pages

    } catch (error) {
      await this.call('terminal', 'log', { type: 'error', value: error.message })
      throw error
    }
  }

  /**
   * Update an existing DApp with new description
   */
  async updateDapp(address: string, description: string, currentFiles: Pages): Promise<Pages> {
      const context = this.getOrCreateContext(address)

    if (context.messages.length === 0) {
      throw new Error('No existing DApp found for this address. Please generate one first.')
    }

    const message = this.createUpdateMessage(description, currentFiles)
    context.messages.push({ role: 'user', content: message })

    try {
      const htmlContent = await this.callLLMAPI(context.messages, FOLLOW_UP_SYSTEM_PROMPT)

      const pages = parsePages(htmlContent) 

      if (Object.keys(pages).length === 0) {
        throw new Error("AI failed to return valid file structure. Check logs.");
      }

      context.messages.push({ role: 'assistant', content: htmlContent })
      this.saveContext(address, context)

      this.emit('dappUpdated', { address, content: pages })
      return pages

    } catch (error) {
      // Remove the failed message from context
      context.messages.pop()
      throw error
    }
  }

  /**
   * Reset the conversation history for a specific address
   */
  async resetDapp(address: string): Promise<void> {
    this.contexts.delete(address)
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('ai-dapp-' + address)
    }
  }

  /**
   * Get the conversation history for debugging
   */
  async getContext(address: string): Promise<DappGenerationContext> {
    return this.getOrCreateContext(address)
  }

  private getOrCreateContext(address: string): DappGenerationContext {
    if (this.contexts.has(address)) {
      return this.contexts.get(address)!
    }

    // Try to load from localStorage
    let messages: any[] = []
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('ai-dapp-' + address)
      if (stored) {
        try {
          messages = JSON.parse(stored)
        } catch (e) {
          console.warn('Failed to parse stored messages for', address)
        }
      }
    }

    const context: DappGenerationContext = { address, messages }
    this.contexts.set(address, context)
    return context
  }

  async getLastGeneratedDapp(address: string): Promise<Pages | null> {
    const context = await this.getContext(address)
    let currentPages: Pages = {}
    if (context) {
      for (const message of context.messages) {
        if (message.role === 'assistant') {
          const newPages = parsePages(message.content)
          if (Object.keys(newPages).length > 0) {
            currentPages = newPages
          }
        }
      }
    }
    return currentPages
  }

  private saveContext(address: string, context: DappGenerationContext): void {
    this.contexts.set(address, context)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ai-dapp-' + address, JSON.stringify(context.messages))
    }
  }

  private createInitialMessage(options: GenerateDappOptions): string {
    const providerCode = this.getProviderCode()
    return `. \n The website should interact the smart contract deployed at this address: ${options.address} on ${options.chainId} network. The ABI of the contract is: ${JSON.stringify(options.abi)}. Put the following code in the header to be able to connect to the blockchain:${providerCode}. Follow the design and features proposed in this description: ${options.description}`  
  }

  private createUpdateMessage(description: string, currentFiles: Pages): string {
    const filesString = JSON.stringify(currentFiles, null, 2);
    return `Here is the full code of my current project:\n\n${filesString}\n\nNow, please apply the following update based on this current code: ${description}. Remember to return ALL project files in the specified START_TITLE format.`
  }

  private getProviderCode(): string {
    // This is the provider code that was missing from the original implementation
    return `
<script>
  // Remix IDE provider injection
  if (typeof window !== 'undefined' && window.ethereum && window.ethereum.isRemix) {
    window.ethereum = window.ethereum;
  }
</script>`
  }

  private async callLLMAPI(messages: any[], systemPrompt: string): Promise<string> {
    const param = new QueryParams()
    const apikey = param.get()['fireworksapikey']

    if (!apikey) {
      throw new Error('Fireworks API key not found in URL parameters. Please add ?fireworksapikey=your_key to the URL.')
    }
    
    const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apikey}`
      },
      body: JSON.stringify({
        model: "accounts/fireworks/models/deepseek-v3p1-terminus",
        max_tokens: 4096,
        top_p: 1,
        top_k: 40,
        presence_penalty: 0,
        frequency_penalty: 0,
        temperature: 0.6,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ]
      })
    })

    const json = await response.json()

    if (json.error) {
      throw new Error(`LLM API Error: ${JSON.stringify(json.error)}`)
    }

    if (!json.choices || !json.choices[0] || !json.choices[0].message) {
      throw new Error('Invalid response from LLM API')
    }
    console.log('LLM Response:', json)
    return json.choices[0].message.content
  }
}

const data =
{
    "id": "64f9c57e-0cea-4a2b-8424-38dea76cffc8",
    "object": "chat.completion",
    "created": 1762266427,
    "model": "accounts/fireworks/models/deepseek-v3p1-terminus",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "```html\n<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Smart Contract Interaction</title>\n    <script src=\"https://unpkg.com/react@18/umd/react.development.js\"></script>\n    <script src=\"https://unpkg.com/react-dom@18/umd/react-dom.development.js\"></script>\n    <script src=\"https://unpkg.com/@babel/standalone/babel.min.js\"></script>\n    <script src=\"https://cdnjs.cloudflare.com/ajax/libs/ethers/6.15.0/ethers.umd.min.js\"></script>\n    <style>\n        * {\n            margin: 0;\n            padding: 0;\n            box-sizing: border-box;\n            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\n        }\n        \n        body {\n            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n            min-height: 100vh;\n            display: flex;\n            justify-content: center;\n            align-items: center;\n            padding: 20px;\n        }\n        \n        .container {\n            background: white;\n            border-radius: 12px;\n            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);\n            padding: 30px;\n            width: 100%;\n            max-width: 500px;\n        }\n        \n        h1 {\n            text-align: center;\n            color: #333;\n            margin-bottom: 20px;\n            font-weight: 600;\n        }\n        \n        .card {\n            background: #f8f9fa;\n            border-radius: 8px;\n            padding: 20px;\n            margin-bottom: 20px;\n            border-left: 4px solid #667eea;\n        }\n        \n        .card h3 {\n            color: #555;\n            margin-bottom: 10px;\n        }\n        \n        .card p {\n            color: #666;\n            font-size: 14px;\n        }\n        \n        .status {\n            padding: 10px;\n            border-radius: 6px;\n            text-align: center;\n            margin-bottom: 20px;\n            font-weight: 500;\n        }\n        \n        .connected {\n            background: #d4edda;\n            color: #155724;\n            border: 1px solid #c3e6cb;\n        }\n        \n        .disconnected {\n            background: #f8d7da;\n            color: #721c24;\n            border: 1px solid #f5c6cb;\n        }\n        \n        .button {\n            background: #667eea;\n            color: white;\n            border: none;\n            padding: 12px 20px;\n            border-radius: 6px;\n            cursor: pointer;\n            font-size: 16px;\n            font-weight: 500;\n            width: 100%;\n            margin-bottom: 10px;\n            transition: background 0.3s;\n        }\n        \n        .button:hover {\n            background: #5a6fd8;\n        }\n        \n        .button:disabled {\n            background: #cccccc;\n            cursor: not-allowed;\n        }\n        \n        .input-group {\n            margin-bottom: 15px;\n        }\n        \n        .input-group label {\n            display: block;\n            margin-bottom: 5px;\n            color: #555;\n            font-weight: 500;\n        }\n        \n        .input-group input {\n            width: 100%;\n            padding: 10px;\n            border: 1px solid #ddd;\n            border-radius: 6px;\n            font-size: 16px;\n        }\n        \n        .value-display {\n            text-align: center;\n            font-size: 24px;\n            font-weight: 600;\n            color: #333;\n            margin: 20px 0;\n            padding: 15px;\n            background: #f1f3f4;\n            border-radius: 8px;\n        }\n        \n        .transaction-status {\n            padding: 10px;\n            border-radius: 6px;\n            text-align: center;\n            margin-top: 10px;\n            font-size: 14px;\n        }\n        \n        .success {\n            background: #d4edda;\n            color: #155724;\n            border: 1px solid #c3e6cb;\n        }\n        \n        .error {\n            background: #f8d7da;\n            color: #721c24;\n            border: 1px solid #f5c6cb;\n        }\n        \n        .loading {\n            background: #fff3cd;\n            color: #856404;\n            border: 1px solid #ffeaa7;\n        }\n    </style>\n</head>\n<body>\n    <div id=\"root\"></div>\n\n    <script type=\"text/babel\">\n        // Remix IDE provider injection\n        if (typeof window !== 'undefined' && window.ethereum && window.ethereum.isRemix) {\n            window.ethereum = window.ethereum;\n        }\n\n        const { useState, useEffect } = React;\n\n        const contractAddress = \"0xBEF30F7a72036b4799c9ab2fC814D6a836Fb3FA8\";\n        const contractABI = [\n            {\n                \"inputs\": [\n                    {\n                        \"internalType\": \"uint256\",\n                        \"name\": \"num\",\n                        \"type\": \"uint256\"\n                    }\n                ],\n                \"name\": \"store\",\n                \"outputs\": [],\n                \"stateMutability\": \"nonpayable\",\n                \"type\": \"function\"\n            },\n            {\n                \"inputs\": [],\n                \"name\": \"retrieve\",\n                \"outputs\": [\n                    {\n                        \"internalType\": \"uint256\",\n                        \"name\": \"\",\n                        \"type\": \"uint256\"\n                    }\n                ],\n                \"stateMutability\": \"view\",\n                \"type\": \"function\"\n            }\n        ];\n\n        const App = () => {\n            const [provider, setProvider] = useState(null);\n            const [signer, setSigner] = useState(null);\n            const [contract, setContract] = useState(null);\n            const [account, setAccount] = useState(null);\n            const [storedValue, setStoredValue] = useState(0);\n            const [newValue, setNewValue] = useState('');\n            const [transactionStatus, setTransactionStatus] = useState({ type: '', message: '' });\n            const [isLoading, setIsLoading] = useState(false);\n\n            // Initialize provider and check connection\n            useEffect(() => {\n                const initProvider = async () => {\n                    if (window.ethereum) {\n                        try {\n                            const newProvider = new ethers.BrowserProvider(window.ethereum);\n                            setProvider(newProvider);\n\n                            // Check if already connected\n                            const accounts = await window.ethereum.request({ method: 'eth_accounts' });\n                            if (accounts.length > 0) {\n                                await connectWallet(newProvider);\n                            }\n                        } catch (error) {\n                            console.error(\"Error initializing provider:\", error);\n                        }\n                    }\n                };\n\n                initProvider();\n            }, []);\n\n            // Update stored value when connected\n            useEffect(() => {\n                const fetchStoredValue = async () => {\n                    if (contract) {\n                        try {\n                            const value = await contract.retrieve();\n                            setStoredValue(value.toString());\n                        } catch (error) {\n                            console.error(\"Error fetching stored value:\", error);\n                        }\n                    }\n                };\n\n                fetchStoredValue();\n            }, [contract]);\n\n            const connectWallet = async (providerToUse = provider) => {\n                if (!window.ethereum) {\n                    setTransactionStatus({ type: 'error', message: 'MetaMask or similar wallet is required to connect.' });\n                    return;\n                }\n\n                try {\n                    setIsLoading(true);\n                    setTransactionStatus({ type: 'loading', message: 'Connecting to wallet...' });\n\n                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });\n                    setAccount(accounts[0]);\n\n                    const newSigner = await providerToUse.getSigner();\n                    setSigner(newSigner);\n\n                    const newContract = new ethers.Contract(contractAddress, contractABI, newSigner);\n                    setContract(newContract);\n\n                    setTransactionStatus({ type: 'success', message: 'Wallet connected successfully!' });\n                    \n                    // Fetch the current stored value\n                    const value = await newContract.retrieve();\n                    setStoredValue(value.toString());\n                } catch (error) {\n                    console.error(\"Error connecting wallet:\", error);\n                    setTransactionStatus({ type: 'error', message: `Failed to connect: ${error.message}` });\n                } finally {\n                    setIsLoading(false);\n                }\n            };\n\n            const disconnectWallet = () => {\n                setAccount(null);\n                setSigner(null);\n                setContract(null);\n                setStoredValue(0);\n                setTransactionStatus({ type: '', message: '' });\n            };\n\n            const storeValue = async () => {\n                if (!contract || !newValue) {\n                    setTransactionStatus({ type: 'error', message: 'Please connect wallet and enter a value.' });\n                    return;\n                }\n\n                try {\n                    setIsLoading(true);\n                    setTransactionStatus({ type: 'loading', message: 'Storing value...' });\n\n                    const tx = await contract.store(newValue);\n                    setTransactionStatus({ type: 'loading', message: 'Transaction pending...' });\n\n                    await tx.wait();\n                    setTransactionStatus({ type: 'success', message: 'Value stored successfully!' });\n\n                    // Update the displayed value\n                    const value = await contract.retrieve();\n                    setStoredValue(value.toString());\n                    setNewValue('');\n                } catch (error) {\n                    console.error(\"Error storing value:\", error);\n                    setTransactionStatus({ type: 'error', message: `Transaction failed: ${error.message}` });\n                } finally {\n                    setIsLoading(false);\n                }\n            };\n\n            const refreshValue = async () => {\n                if (!contract) {\n                    setTransactionStatus({ type: 'error', message: 'Please connect wallet first.' });\n                    return;\n                }\n\n                try {\n                    setIsLoading(true);\n                    setTransactionStatus({ type: 'loading', message: 'Refreshing value...' });\n\n                    const value = await contract.retrieve();\n                    setStoredValue(value.toString());\n                    setTransactionStatus({ type: 'success', message: 'Value refreshed!' });\n                } catch (error) {\n                    console.error(\"Error refreshing value:\", error);\n                    setTransactionStatus({ type: 'error', message: `Failed to refresh: ${error.message}` });\n                } finally {\n                    setIsLoading(false);\n                }\n            };\n\n            return (\n                <div className=\"container\">\n                    <h1>Smart Contract Interaction</h1>\n                    \n                    <div className=\"card\">\n                        <h3>Contract Information</h3>\n                        <p><strong>Address:</strong> {contractAddress}</p>\n                        <p><strong>Network:</strong> Sepolia (11155111)</p>\n                    </div>\n                    \n                    <div className={`status ${account ? 'connected' : 'disconnected'}`}>\n                        {account ? `Connected: ${account.substring(0, 6)}...${account.substring(account.length - 4)}` : 'Wallet Not Connected'}\n                    </div>\n                    \n                    {transactionStatus.message && (\n                        <div className={`transaction-status ${transactionStatus.type}`}>\n                            {transactionStatus.message}\n                        </div>\n                    )}\n                    \n                    {!account ? (\n                        <button \n                            className=\"button\" \n                            onClick={connectWallet}\n                            disabled={isLoading}\n                        >\n                            {isLoading ? 'Connecting...' : 'Connect Wallet'}\n                        </button>\n                    ) : (\n                        <>\n                            <div className=\"value-display\">\n                                Stored Value: {storedValue}\n                            </div>\n                            \n                            <div className=\"input-group\">\n                                <label htmlFor=\"newValue\">New Value to Store:</label>\n                                <input \n                                    type=\"number\" \n                                    id=\"newValue\"\n                                    value={newValue}\n                                    onChange={(e) => setNewValue(e.target.value)}\n                                    placeholder=\"Enter a number\"\n                                />\n                            </div>\n                            \n                            <button \n                                className=\"button\" \n                                onClick={storeValue}\n                                disabled={isLoading || !newValue}\n                            >\n                                {isLoading ? 'Storing...' : 'Store Value'}\n                            </button>\n                            \n                            <button \n                                className=\"button\" \n                                onClick={refreshValue}\n                                disabled={isLoading}\n                            >\n                                {isLoading ? 'Refreshing...' : 'Refresh Value'}\n                            </button>\n                            \n                            <button \n                                className=\"button\" \n                                onClick={disconnectWallet}\n                                disabled={isLoading}\n                            >\n                                Disconnect Wallet\n                            </button>\n                        </>\n                    )}\n                </div>\n            );\n        };\n\n        ReactDOM.render(<App />, document.getElementById('root'));\n    </script>\n</body>\n</html>\n```"
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 289,
        "total_tokens": 3091,
        "completion_tokens": 2802
    }
}

// Helper function to ensure HTML has complete structure
  const ensureCompleteHtml = (html: string): string => {
    let completeHtml = html;

    // Add missing head closing tag
    if (completeHtml.includes("<head>") && !completeHtml.includes("</head>")) {
      completeHtml += "\n</head>";
    }

    // Add missing body closing tag
    if (completeHtml.includes("<body") && !completeHtml.includes("</body>")) {
      completeHtml += "\n</body>";
    }

    // Add missing html closing tag
    if (!completeHtml.includes("</html>")) {
      completeHtml += "\n</html>";
    }

    return completeHtml;
  };

// Helper function to extract and clean HTML content
  const extractHtmlContent = (chunk: string): string => {
    if (!chunk) return "";

    const codeMatch = chunk.trim().match(/```(?:\w*\n)?([\s\S]*?)```/);
    
    let content: string;

    if (codeMatch && codeMatch[1]) {
      content = codeMatch[1];
    } else {
      content = chunk.trim();
    }
    
    return content.replace(/```/g, "").trim();
  };

  const parsePages = (content: string) => {
    const pages = {}
    const markerRegex = /<<<<<<< START_TITLE (.*?) >>>>>>> END_TITLE/g;

    if (!content.match(markerRegex)) {
      console.warn('[AI-DAPP-LOG] parsePages: AI 응답에서 START_TITLE 마커를 찾을 수 없습니다.');
      return pages;
    }

    const parts = content.split(markerRegex);
    
    for (let i = 1; i < parts.length; i += 2) {
      const filename = parts[i].trim();
      const rawFileContent = parts[i + 1];

      if (filename && rawFileContent) {
        const fileContent = extractHtmlContent(rawFileContent);
        
        if (fileContent) {
          console.log(`[AI-DAPP-LOG] parsePages: 파일명 "${filename}" 파싱 성공.`);
          pages[filename] = fileContent;
        } else {
          console.warn(`[AI-DAPP-LOG] parsePages: 파일명 "${filename}"의 내용은 찾았으나, 내용이 비어있습니다.`);
        }
      }
    }
    
    return pages;
  };

/**
 * Parse formatted HTML content with special markers
 * Format: <<<<<<< START_TITLE filename.html >>>>>>> END_TITLE\n```html\n<content>\n```
 * Returns a Map of filename -> content
 */
function parsePagesFollowUp(chunk: string, pages: Pages): Pages {
  if (chunk) {
      const updatedLines: number[][] = [];
      let newHtml = "";
      const updatedPages: Pages = { ...(pages || {}) };

      const updatePageRegex = new RegExp(`${UPDATE_PAGE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\s]+)\\s*${UPDATE_PAGE_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)(?=${UPDATE_PAGE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${NEW_PAGE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|$)`, 'g');
      let updatePageMatch;

      while ((updatePageMatch = updatePageRegex.exec(chunk)) !== null) {
        const [, pagePath, pageContent] = updatePageMatch;

        if (updatedPages[pagePath]) {
          let pageHtml = updatedPages[pagePath];

          let processedContent = pageContent;
          const htmlMatch = pageContent.match(/```html\s*([\s\S]*?)\s*```/);
          if (htmlMatch) {
            processedContent = htmlMatch[1];
          }
          let position = 0;
          let moreBlocks = true;

          while (moreBlocks) {
            const searchStartIndex = processedContent.indexOf(SEARCH_START, position);
            if (searchStartIndex === -1) {
              moreBlocks = false;
              continue;
            }

            const dividerIndex = processedContent.indexOf(DIVIDER, searchStartIndex);
            if (dividerIndex === -1) {
              moreBlocks = false;
              continue;
            }

            const replaceEndIndex = processedContent.indexOf(REPLACE_END, dividerIndex);
            if (replaceEndIndex === -1) {
              moreBlocks = false;
              continue;
            }

            const searchBlock = processedContent.substring(
              searchStartIndex + SEARCH_START.length,
              dividerIndex
            );
            const replaceBlock = processedContent.substring(
              dividerIndex + DIVIDER.length,
              replaceEndIndex
            );

            if (searchBlock.trim() === "") {
              pageHtml = `${replaceBlock}\n${pageHtml}`;
              updatedLines.push([1, replaceBlock.split("\n").length]);
            } else {
              const blockPosition = pageHtml.indexOf(searchBlock);
              if (blockPosition !== -1) {
                const beforeText = pageHtml.substring(0, blockPosition);
                const startLineNumber = beforeText.split("\n").length;
                const replaceLines = replaceBlock.split("\n").length;
                const endLineNumber = startLineNumber + replaceLines - 1;

                updatedLines.push([startLineNumber, endLineNumber]);
                pageHtml = pageHtml.replace(searchBlock, replaceBlock);
              }
            }

            position = replaceEndIndex + REPLACE_END.length;
          }
          pageHtml = pageHtml.replace(/```javascript/g, "").replace(/```html/g, "").replace(/```/g, "");
          updatedPages[pagePath] = pageHtml;

          if (pagePath === '/' || pagePath === '/index' || pagePath === 'index') {
            newHtml = pageHtml;
          }
        }
      }

      const newPageRegex = new RegExp(`${NEW_PAGE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\s]+)\\s*${NEW_PAGE_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)(?=${UPDATE_PAGE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${NEW_PAGE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|$)`, 'g');
      let newPageMatch;

      while ((newPageMatch = newPageRegex.exec(chunk)) !== null) {
        const [, pagePath, pageContent] = newPageMatch;

        let pageHtml = pageContent;
        const htmlMatch = pageContent.match(/```html\s*([\s\S]*?)\s*```/);
        if (htmlMatch) {
          pageHtml = htmlMatch[1];
        }

        updatedPages[pagePath] = pageHtml.trim().replace(/```javascript/g, "").replace(/```html/g, "").replace(/```/g, "");
      }

      const pagesCount = Object.keys(pages || {}).length;
      const updatedPagesCount = Object.keys(updatedPages).length;

      if (updatedPagesCount === pagesCount && !chunk.includes(UPDATE_PAGE_START)) {
        let position = 0;
        let moreBlocks = true;

        while (moreBlocks) {
          const searchStartIndex = chunk.indexOf(SEARCH_START, position);
          if (searchStartIndex === -1) {
            moreBlocks = false;
            continue;
          }

          const dividerIndex = chunk.indexOf(DIVIDER, searchStartIndex);
          if (dividerIndex === -1) {
            moreBlocks = false;
            continue;
          }

          const replaceEndIndex = chunk.indexOf(REPLACE_END, dividerIndex);
          if (replaceEndIndex === -1) {
            moreBlocks = false;
            continue;
          }

          const searchBlock = chunk.substring(
            searchStartIndex + SEARCH_START.length,
            dividerIndex
          );
          const replaceBlock = chunk.substring(
            dividerIndex + DIVIDER.length,
            replaceEndIndex
          );

          if (searchBlock.trim() === "") {
            newHtml = `${replaceBlock}\n${newHtml}`;
            updatedLines.push([1, replaceBlock.split("\n").length]);
          } else {
            const blockPosition = newHtml.indexOf(searchBlock);
            if (blockPosition !== -1) {
              const beforeText = newHtml.substring(0, blockPosition);
              const startLineNumber = beforeText.split("\n").length;
              const replaceLines = replaceBlock.split("\n").length;
              const endLineNumber = startLineNumber + replaceLines - 1;

              updatedLines.push([startLineNumber, endLineNumber]);
              newHtml = newHtml.replace(searchBlock, replaceBlock);
            }
          }

          position = replaceEndIndex + REPLACE_END.length;
        }

        // Update the main HTML if it's the index page
        const indexKey = Object.keys(updatedPages).find(key => key === '/' || key === '/index' || key === 'index');
        if (indexKey) {
          updatedPages[indexKey] = newHtml;
        }
      }

      /*
      return {
        updatedLines,
        pages: updatedPages,
      };
      */
     return updatedPages
    } else {
      return {}
    }
}