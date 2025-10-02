import { monacoTypes } from '@remix-ui/editor'

interface TsCompletionInfo {
  entries: {
    name: string
    kind: string
  }[]
}

export class RemixTSCompletionProvider implements monacoTypes.languages.CompletionItemProvider {
  monaco: any

  constructor(monaco: any) {
    this.monaco = monaco
  }

  triggerCharacters = ['.', '"', "'", '/', '@']

  async provideCompletionItems(model: monacoTypes.editor.ITextModel, position: monacoTypes.Position, context: monacoTypes.languages.CompletionContext): Promise<monacoTypes.languages.CompletionList | undefined> {
    const word = model.getWordUntilPosition(position)
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn
    }

    try {
      const worker = await this.monaco.languages.typescript.getTypeScriptWorker()
      const client = await worker(model.uri)
      const completions: TsCompletionInfo = await client.getCompletionsAtPosition(
        model.uri.toString(),
        model.getOffsetAt(position)
      )

      if (!completions || !completions.entries) {
        return { suggestions: []}
      }

      const suggestions = completions.entries.map(entry => {
        return {
          label: entry.name,
          kind: this.mapTsCompletionKindToMonaco(entry.kind),
          insertText: entry.name,
          range: range
        }
      })

      return { suggestions }
    } catch (error) {
      console.error('[TSCompletionProvider] Error fetching completions:', error)
      return { suggestions: []}
    }
  }

  private mapTsCompletionKindToMonaco(kind: string): monacoTypes.languages.CompletionItemKind {
    const { CompletionItemKind } = this.monaco.languages
    switch (kind) {
    case 'method':
    case 'memberFunction':
      return CompletionItemKind.Method
    case 'function':
      return CompletionItemKind.Function
    case 'property':
    case 'memberVariable':
      return CompletionItemKind.Property
    case 'class':
      return CompletionItemKind.Class
    case 'interface':
      return CompletionItemKind.Interface
    case 'keyword':
      return CompletionItemKind.Keyword
    case 'variable':
      return CompletionItemKind.Variable
    case 'constructor':
      return CompletionItemKind.Constructor
    case 'enum':
      return CompletionItemKind.Enum
    case 'module':
      return CompletionItemKind.Module
    default:
      return CompletionItemKind.Text
    }
  }
}