# Ninai

**The New Interface for AI.**

Ninai is a local-first productivity application designed for the AI era. It reimagines the "copy-paste" workflow by integrating a powerful web browser side-by-side with a rich markdown editor.

## Why Ninai?

Modern workflows involve constantly switching between AI tools (ChatGPT, Claude, Gemini) and your notes. Ninai bridges this gap with a unified, dual-pane interface that keeps you in flow.

### Key Features

*   **⚡ Dual-Pane Workflow**: Browse any web app (AI models, documentation, tutorials) on the right, and take notes on the left.
*   **🧘 Zen Mode**: Focus purely on your writing with a single click that hides the browser and sidebar.
*   **🔒 Local-First**: Your notes are stored locally on your device (IndexedDB + File System). No cloud sync, no tracking, complete privacy.
*   **🖼️ robust Copy-Paste**: 
    *   **Universal Image Copy**: Bypass web restrictions (CORS, Hotlink protection) to copy *any* image from the web directly into your notes.
    *   **Smart Formatting**: Pasted content retains its structure.
*   **📂 Organized**: Nested folders, drag-and-drop reordering, and a powerful search.
*   **🎨 Beautiful Design**: A "Jony Ive" inspired monochrome aesthetic that feels premium and distraction-free.

## Technology Stack

*   **Electron**: Cross-platform desktop runtime.
*   **React + Vite**: Fast, modern UI framework.
*   **TypeScript**: Type-safe logic.
*   **TipTap**: headless wrapper for ProseMirror, powering the rich text editor.
*   **Dexie.js**: Wrapper for IndexedDB for fast local storage.

## Development

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Run Development Mode**:
    ```bash
    npm run desktop
    ```

3.  **Build for Production**:
    ```bash
    npm run dist:all
    ```

## License

MIT © [Jason P](https://github.com/PandiaJason)
