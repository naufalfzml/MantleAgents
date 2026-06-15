'use client';

import * as React from 'react';
import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send, Loader2, MessageSquarePlus, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import { getToken } from '@/lib/token-store';
import { MessageItem } from './message-item';
import { ModelSelector } from './model-selector';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const TOOL_GROUPS = [
  { id: 'parallel_ai', name: 'Parallel AI', description: 'News & Web Search' },
  { id: 'coingecko', name: 'CoinGecko', description: 'Crypto Market Data' },
  { id: 'grok', name: 'Grok (xAI)', description: 'Social Sentiment' },
  { id: 'firecrawl', name: 'Firecrawl', description: 'Governance Scraping' },
] as const;
const ALL_TOOL_GROUP_IDS = TOOL_GROUPS.map((g) => g.id);

const SUGGESTIONS = [
  { label: 'BTC Price', prompt: 'What is the current price of BTC and is it bullish or bearish?' },
  { label: 'BNB Outlook', prompt: 'What is the BNB price outlook this week?' },
  { label: 'Latest News', prompt: 'Show me the latest important crypto news today' },
  { label: 'ETH Analysis', prompt: 'Give me a quick ETH market analysis' },
  { label: 'DeFi Sentiment', prompt: "What's the current market sentiment on DeFi?" },
  { label: 'Best Trade', prompt: 'Based on current market data, what is the best crypto trade opportunity right now?' },
];

function extractLastUserContent(messages: { role: string; parts?: Array<{ type: string; text?: string }> }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const parts = m.parts ?? [];
    for (const p of parts) {
      if (p.type === 'text' && typeof p.text === 'string') return p.text;
    }
  }
  return '';
}

interface ChatInterfaceProps {
  chatId: string;
  initialModelId?: string;
  initialMessages?: UIMessage[];
  initialEnabledTools?: string[];
  onNewChat?: () => void;
}

export function ChatInterface({
  chatId,
  initialModelId = 'gemini-3-flash',
  initialMessages = [],
  initialEnabledTools,
  onNewChat,
}: ChatInterfaceProps) {
  const [modelId, setModelId] = React.useState(initialModelId);
  const [input, setInput] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('chat');
  const [enabledTools, setEnabledTools] = React.useState<string[]>(
    initialEnabledTools ?? ALL_TOOL_GROUP_IDS
  );
  const enabledToolsRef = React.useRef(enabledTools);
  enabledToolsRef.current = enabledTools;
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setEnabledTools(initialEnabledTools ?? ALL_TOOL_GROUP_IDS);
  }, [chatId, initialEnabledTools]);

  const transportRef = React.useRef<InstanceType<typeof DefaultChatTransport> | null>(null);
  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport({
      api: `${API_BASE}/api/conversation/chats/${chatId}/messages`,
      headers: { Authorization: `Bearer ${getToken()}` },
      prepareSendMessagesRequest: ({ messages, body }) => {
        const content = extractLastUserContent(messages);
        const resolvedModelId = (body?.modelId as string) ?? 'gemini-3-flash';
        const tools = enabledToolsRef.current;
        return { body: { content, modelId: resolvedModelId, enabledTools: tools } };
      },
    });
  }
  const transport = transportRef.current;

  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: initialMessages,
  });

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput('');
    try {
      await sendMessage({ text }, { body: { modelId } });
    } catch (err) {
      console.error('[agent-chat] sendMessage failed:', err);
    }
  };

  const handleSuggestion = async (prompt: string) => {
    if (isLoading) return;
    setInput('');
    try {
      await sendMessage({ text: prompt }, { body: { modelId } });
    } catch (err) {
      console.error('[agent-chat] suggestion failed:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="shrink-0 border-b border-gb-dark bg-gb-deep px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded border border-gb-accent/40 bg-gb-accent/10 flex items-center justify-center">
                <Bot className="size-4 text-gb-accent" />
              </div>
              <div>
                <span className="text-sm font-bold text-gb-light tracking-wide uppercase">MantleAgents AI</span>
                <div className="flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-gb-accent animate-pulse" />
                  <span className="text-[10px] text-gb-accent uppercase tracking-widest">Online</span>
                </div>
              </div>
            </div>
            <TabsList className="h-7 bg-gb-dark border border-gb-dark">
              <TabsTrigger value="chat" className="text-xs h-6 px-3">Chat</TabsTrigger>
              <TabsTrigger value="tools" className="text-xs h-6 px-3">Tools</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-2">
            <ModelSelector value={modelId} onValueChange={setModelId} />
            {onNewChat && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNewChat}
                className="h-7 px-2 text-xs border-gb-dark text-gb-mid hover:text-gb-light hover:border-gb-accent/40"
              >
                <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
                New
              </Button>
            )}
          </div>
        </div>
        {error && (
          <div className="max-w-4xl mx-auto mt-2 rounded border border-red-800/50 bg-red-950/30 px-3 py-1.5 text-xs text-red-400">
            {error.message}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <TabsContent value="chat" className="mt-0 h-full">
          <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-4">
            {messages.length === 0 && !isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-8">
                {/* Hero */}
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center size-16 rounded-full border-2 border-dashed border-gb-accent/40 bg-gb-dark mb-4">
                    <Bot className="size-8 text-gb-accent" />
                  </div>
                  <h2 className="text-xl font-bold text-gb-light uppercase tracking-wider">MantleAgents Intelligence</h2>
                  <p className="text-sm text-gb-mid max-w-sm">
                    Real-time crypto analysis powered by AI. Ask me anything about prices, market trends, or trading signals.
                  </p>
                </div>

                {/* Suggestion chips */}
                <div className="w-full max-w-2xl">
                  <p className="text-xs text-gb-mid uppercase tracking-widest mb-3 text-center">Quick Analysis</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => handleSuggestion(s.prompt)}
                        className="text-left px-3 py-2.5 rounded border border-gb-dark bg-gb-deep hover:border-gb-accent/50 hover:bg-gb-accent/5 transition-colors group"
                      >
                        <span className="text-xs font-semibold text-gb-accent group-hover:text-gb-accent uppercase tracking-wide">{s.label}</span>
                        <p className="text-[10px] text-gb-mid mt-0.5 leading-tight line-clamp-2">{s.prompt}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} isStreaming={isLoading} />
                ))}
                {isLoading && (
                  <div className="flex gap-3 items-start">
                    <div className="shrink-0 size-7 rounded border border-gb-accent/40 bg-gb-accent/10 flex items-center justify-center mt-0.5">
                      <Loader2 className="size-3.5 text-gb-accent animate-spin" />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 rounded border border-gb-dark bg-gb-deep">
                      <span className="text-xs text-gb-mid">Analyzing</span>
                      <span className="flex gap-0.5">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="size-1 rounded-full bg-gb-accent/60 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tools" className="mt-0">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="border border-gb-dark rounded bg-gb-deep p-5">
              <h3 className="font-bold text-gb-light uppercase tracking-wider text-sm mb-1">Connected Tools</h3>
              <p className="text-xs text-gb-mid mb-5">Toggle data sources for AI analysis.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {TOOL_GROUPS.map((group) => (
                  <ToolToggleCard
                    key={group.id}
                    id={group.id}
                    name={group.name}
                    description={group.description}
                    enabled={enabledTools.includes(group.id)}
                    disabled={enabledTools.length <= 1 && enabledTools.includes(group.id)}
                    onToggle={async (checked) => {
                      const next = checked
                        ? [...enabledTools, group.id]
                        : enabledTools.filter((id) => id !== group.id);
                      if (next.length === 0) return;
                      setEnabledTools(next);
                      try {
                        await api.patch(`/api/conversation/chats/${chatId}`, { enabledTools: next });
                      } catch {
                        setEnabledTools(enabledTools);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-gb-dark bg-gb-deep px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about prices, market trends, trading signals..."
              className="flex-1 min-h-11 max-h-32 resize-none bg-gb-dark border-gb-dark text-gb-light placeholder:text-gb-mid text-sm focus-visible:ring-gb-accent/40 focus-visible:border-gb-accent/40"
              rows={1}
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              size="icon"
              className="h-11 w-11 shrink-0 bg-gb-accent text-gb-deep hover:bg-gb-accent/90 disabled:opacity-30"
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
          <p className="text-[10px] text-gb-mid text-center mt-2">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </Tabs>
  );
}

function MessageBubble({ message, isStreaming }: { message: UIMessage; isStreaming: boolean }) {
  const isUser = message.role === 'user';
  const textContent = message.parts
    ?.filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('') ?? '';

  if (!textContent && !isUser) return <MessageItem message={message} isStreaming={isStreaming} />;

  return (
    <div className={cn('flex gap-3 items-start', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'shrink-0 size-7 rounded border flex items-center justify-center mt-0.5',
        isUser
          ? 'border-gb-mid/40 bg-gb-mid/10'
          : 'border-gb-accent/40 bg-gb-accent/10',
      )}>
        {isUser
          ? <User className="size-3.5 text-gb-mid" />
          : <Bot className="size-3.5 text-gb-accent" />
        }
      </div>
      {isUser ? (
        <div className="max-w-[75%] px-3 py-2 rounded border border-gb-mid/30 bg-gb-mid/10 text-sm text-gb-light">
          {textContent}
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <MessageItem message={message} isStreaming={isStreaming} />
        </div>
      )}
    </div>
  );
}

function ToolToggleCard({
  id, name, description, enabled, disabled, onToggle,
}: {
  id: string; name: string; description: string;
  enabled: boolean; disabled: boolean;
  onToggle: (checked: boolean) => void | Promise<void>;
}) {
  return (
    <div className={cn(
      'p-3 rounded border flex items-center justify-between transition-colors',
      enabled ? 'border-gb-accent/30 bg-gb-accent/5' : 'border-gb-dark bg-gb-dark/30',
    )}>
      <div>
        <div className="text-xs font-semibold text-gb-light uppercase tracking-wide">{name}</div>
        <div className="text-[10px] text-gb-mid mt-0.5">{description}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-[10px] uppercase tracking-wide', enabled ? 'text-gb-accent' : 'text-gb-mid')}>
          {enabled ? 'On' : 'Off'}
        </span>
        <Switch id={`tool-${id}`} checked={enabled} disabled={disabled} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}
