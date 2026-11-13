import React, { useState } from 'react';
import { apiRequest } from '../../services/api';
import { formatDateTime } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import { Avatar, Button, EmptyState, PageHeader, SectionCard } from '../ui/Misc';
import { TextArea } from '../ui/Form';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useAsyncData } from './useAsyncData';

interface FounderMessage {
  id: string;
  author_id: string;
  author_name?: string;
  author_email?: string;
  body: string;
  created_at: string;
}

export const FounderChannelView: React.FC = () => {
  const toast = useToast();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const { data: messages = [], loading, error, reload } = useAsyncData<FounderMessage[]>(
    async () => {
      try {
        return await apiRequest<FounderMessage[]>('/messages');
      } catch (e) {
        console.warn('Founder messages fetch failed', e);
        return [];
      }
    },
    []
  );

  const postMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = text.trim();
    if (!clean) return;

    setPosting(true);
    try {
      await apiRequest('/messages', {
        method: 'POST',
        body: JSON.stringify({ body: clean }),
      });
      setText('');
      toast.success('Update posted to channel.');
      await reload();
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void postMessage();
    }
  };

  return (
    <div className="ws-module">
      <div className="ws-module-inner" style={{ maxWidth: 760, margin: '0 auto' }}>
        <PageHeader
          title="Founder Channel"
          subtitle="Direct asynchronous status updates between you and your co-founder."
          actions={
            <Button
              size="sm"
              icon="refresh"
              onClick={() => void reload()}
              loading={loading}
            >
              Refresh
            </Button>
          }
        />

        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Post an update">
            <form onSubmit={postMessage}>
              <TextArea
                rows={3}
                placeholder="Share a quick status update, decision, or blocker... (Cmd+Enter to post)"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <Button
                  type="submit"
                  variant="primary"
                  icon="send"
                  loading={posting}
                  disabled={!text.trim()}
                >
                  Post update
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>

        <SectionCard title="Recent Updates">
          {error && (
            <div className="ws-inline-error" style={{ marginBottom: 12 }}>
              <Icon name="alert" size={15} />
              <span>{error}</span>
            </div>
          )}

          {loading && messages.length === 0 && (
            <div className="ws-muted" style={{ padding: 16, textAlign: 'center' }}>
              Loading updates…
            </div>
          )}

          {!loading && messages.length === 0 && (
            <EmptyState
              compact
              icon="message"
              title="No messages yet"
              description="Post the first update to start the founder channel."
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: 16,
                  borderRadius: 10,
                  background: 'var(--bg-card, rgba(255, 255, 255, 0.04))',
                  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                }}
              >
                <Avatar name={msg.author_name || msg.author_email || 'Founder'} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {msg.author_name || msg.author_email || 'Founder'}
                    </span>
                    <span className="ws-muted" style={{ fontSize: 11 }}>
                      {formatDateTime(new Date(msg.created_at).getTime())}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {msg.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
