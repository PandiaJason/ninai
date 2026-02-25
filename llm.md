# NINAI LLM Integration Architecture

NINAI integrates Large Language Models (LLMs) not through traditional REST APIs, but by directly embedding their official web interfaces. This approach provides several key advantages and presents unique engineering challenges.

## The Approach: Webview Embedding

Instead of requiring users to manage API keys (which charge per token and often lack chat history), NINAI uses Electron's `<webview>` tag to render the web interfaces of ChatGPT, Claude, Gemini, and others.

- **Zero API Costs**: Users leverage their existing subscriptions (e.g., ChatGPT Plus, Claude Pro).
- **Persistent Sessions**: Because the `<webview>` shares the app's internal Chromium session (or an isolated partition), users log in once and remain logged in across app restarts.
- **Access to Native Features**: Users get the native features of the AI tools (e.g., ChatGPT's Advanced Data Analysis, Claude's Artifacts) which are often delayed or unavailable in APIs.

## Supported Integrations

The supported LLMs are configured in `src/data/tools.ts`:

- **ChatGPT**: `https://chat.openai.com`
- **Claude**: `https://claude.ai`
- **Gemini**: `https://gemini.google.com`
- **Perplexity** (Planned)

### Bypassing Frame Restrictions (X-Frame-Options)

Many of these providers send `X-Frame-Options: DENY` or strict `Content-Security-Policy` headers to prevent clickjacking and embedding in `<iframe>` tags.

NINAI bypasses this in `electron/main.js` by intercepting the network requests at the `session` level and stripping these security headers before they reach the renderer:

```javascript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['X-Frame-Options'];
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['Content-Security-Policy'];
    callback({ cancel: false, responseHeaders });
});
```

## Data Extraction & Markdown Processing (`llm.ts`)

The core value proposition of NINAI is easily moving data from the LLM into the user's notes. When a user copies text or code from the LLM `<webview>`, they are copying HTML/Text.

The `src/services/llm.ts` service acts as the bridge between the clipboard and the TipTap Rich Text Editor:

1. **Markdown Normalization**: Extracts and normalizes Markdown structure from the clipboard.
2. **HTML Parsing**: Uses `marked.parse` (with GitHub Flavored Markdown `gfm: true`) to safely compile the Markdown into HTML.
3. **Editor Insertion**: Injects the compiled HTML directly into the TipTap editor context using `editor.chain().focus().insertContent(html).run()`.

## Media & Image Sandboxing (Super Copy)

LLM interfaces often serve images (e.g., generated charts, DALL-E images) using expiring Blob URLs or strict CORS policies preventing them from being hotlinked or copied via standard DOM methods.

NINAI provides a "Super Copy" feature. When a user right-clicks an image in a `<webview>`, NINAI:
1. Captures the request via IPC Context Menu in `main.js`.
2. Reads the `srcURL` of the image.
3. Performs a native `net.request` from the Node backend, attaching the user's active cookies and forging the `Referer` to bypass anti-bot protections.
4. Converts the payload into a native uncompressed image buffer (`nativeImage`) and writes it directly to the system clipboard.

This ensures images from AI tools can always be pasted into notes seamlessly.
