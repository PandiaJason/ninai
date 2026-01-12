export interface Tool {
    id: string;
    name: string;
    label: string;
    color: string;
    url: string;
    embeddable: boolean;
}

export const TOOLS: Tool[] = [
    {
        id: 'chatgpt',
        name: 'ChatGPT',
        label: 'C',
        color: '#10a37f',
        url: 'https://chat.openai.com',
        embeddable: true
    },
    {
        id: 'google',
        name: 'Google',
        label: 'G',
        color: '#4285f4',
        url: 'https://www.google.com/webhp?igu=1',
        embeddable: true
    },
    {
        id: 'claude',
        name: 'Claude',
        label: 'Cl',
        color: '#d97757',
        url: 'https://claude.ai',
        embeddable: true
    },
    {
        id: 'gemini',
        name: 'Gemini',
        label: '✨',
        color: '#4aa0e9',
        url: 'https://gemini.google.com',
        embeddable: true
    },
];
