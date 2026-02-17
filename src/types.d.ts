declare module 'turndown-plugin-gfm';

interface Window {
    electronAPI?: {
        clipboard: {
            writeText(text: string): Promise<void>;
            readExtended?(): Promise<{ text: string; html: string }>;
        };
        printToPDF(title: string, html: string): Promise<void>;
    };
}
