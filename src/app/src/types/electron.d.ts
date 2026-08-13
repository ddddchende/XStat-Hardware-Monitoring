// Type declarations for the contextBridge API exposed by the preload script.
export {}

declare global {
  interface Window {
    xstat: {
      window: {
        minimize(): Promise<void>
        maximize(): Promise<void>
        close(): Promise<void>
        quit(): Promise<void>
      }
      service: {
        getUrl(): Promise<string>
        getPanelUrl(): Promise<string>
        getPort(): Promise<number>
        setPort(port: number): Promise<number>
      }
      settings: {
        getStartMinimized(): Promise<boolean>
        setStartMinimized(value: boolean): Promise<void>
        getStartWithWindows(): Promise<boolean>
        setStartWithWindows(value: boolean): Promise<void>
      }
      widgetEditor: {
        open(widget: unknown): Promise<void>
        getData(): Promise<unknown>
        save(html: string, files: Record<string, string>): Promise<void>
        close(): Promise<void>
        minimize(): Promise<void>
        maximize(): Promise<void>
        onSaved(cb: (data: { widgetId: string; html: string; files: Record<string, string> }) => void): void
        offSaved(): void
        onInit(cb: (widget: unknown) => void): void
        offInit(): void
      }
      workspace: {
        saveAs(content: string): Promise<{ canceled: boolean; filePath?: string }>
        save(filePath: string, content: string): Promise<{ ok: boolean }>
        open(): Promise<{ canceled: boolean; filePath?: string; content?: string }>
        readFile(filePath: string): Promise<{ ok: boolean; content?: string }>
      }
    }
  }
}
