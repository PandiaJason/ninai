import { Editor } from '@tiptap/react';
import { marked } from 'marked';

/**
 * Exports the current editor content as clean Markdown.
 * Uses Tiptap's built-in Markdown serializer (via tiptap-markdown extension).
 */
export const exportToMarkdown = (editor: Editor): string => {
    if (!editor) return '';

    // The 'markdown' storage is provided by tiptap-markdown extension
    const markdown = (editor.storage as any).markdown?.getMarkdown();

    if (!markdown) {
        console.warn('Markdown storage not found in editor.');
        return '';
    }

    return markdown.trim();
};

/**
 * Normalizes incoming Markdown from LLMs.
 * Ensures it's clean and ready for insertion.
 */
export const normalizeMarkdown = (text: string): string => {
    let clean = text.replace(/\r\n/g, '\n');
    clean = clean.trim();
    return clean;
};

/**
 * Inserts Markdown into the editor at the current selection.
 * If 'replace' is true, it replaces the current selection.
 */
export const insertMarkdown = (editor: Editor, markdown: string, replace: boolean = false) => {
    if (!editor) return;

    if (replace) {
        // Placeholder for future replace logic
    }

    const cleanMD = normalizeMarkdown(markdown);

    try {
        // Parse MD string to HTML using 'marked'
        // marked.parse is synchronous by default
        // Parse MD string to HTML using 'marked' with explicit GFM
        const html = marked.parse(cleanMD, { async: false, gfm: true, breaks: true }) as string;

        // Insert the parsed HTML content - Tiptap handles HTML perfectly
        console.log('Inserting parsed HTML from Markdown:', html);
        editor.chain().focus().insertContent(html).run();
    } catch (e) {
        console.warn('Failed to parse markdown with marked, falling back to text insertion', e);
        // Fallback: Insert as plain text
        editor.chain().focus().insertContent(cleanMD).run();
    }
};
