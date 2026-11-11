declare module 'turndown-plugin-gfm';

interface Window {
    electronAPI?: {
        clipboard: {
            writeText(text: string): Promise<void>;
            readExtended?(): Promise<{ text: string; html: string }>;
        };
        printToPDF(title: string, html: string): Promise<void>;
        exportToGit?(payload: { json: string; workspaceName: string; message: string }): Promise<{
            canceled?: boolean;
            path?: string;
            committed?: boolean;
            gitAvailable?: boolean;
            message?: string;
        }>;
    };
}
