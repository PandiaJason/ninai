import React, { useState } from 'react';
import { type Editor } from '@tiptap/react';
import { exportToMarkdown } from '../services/llm';

export const ExportButton = ({ editor }: { editor: Editor | null }) => {
    const [status, setStatus] = useState<'idle' | 'copied'>('idle');

    const handleExport = async () => {
        if (!editor) return;
        const md = exportToMarkdown(editor);

        try {
            if (window.electronAPI?.clipboard) {
                window.electronAPI.clipboard.writeText(md);
            } else {
                await navigator.clipboard.writeText(md);
            }

            setStatus('copied');
            setTimeout(() => setStatus('idle'), 2000);
        } catch (err) {
            console.error('Export failed:', err);
            alert(`Failed to copy: ${err}`);
        }
    };

    const handleDragStart = (e: React.DragEvent) => {
        if (!editor) return;
        const md = exportToMarkdown(editor);
        e.dataTransfer.setData('text/plain', md);
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <button
            className="icon-btn-ghost"
            draggable
            onDragStart={handleDragStart}
            onClick={handleExport}
            title="Copy Context for AI (Click or Drag to LLM)"
            style={{
                color: status === 'copied' ? '#10b981' : '#0071e3', // Apple Blue
                transition: 'all 0.2s',
                cursor: 'grab'
            }}
        >
            {status === 'copied' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            ) : (
                // Sparkles Icon (Abstract "AI Context")
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                </svg>
            )}
        </button>
    );
};
