import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { assistantApi, AssistantQueryResponse } from '../api/client';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User as UserIcon,
  Loader2,
  Trash2,
  HelpCircle,
  Clock,
  ShieldCheck,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  meta?: {
    reportCount?: number;
    dateRange?: { from: string; to: string } | null;
    provider?: string;
    model?: string;
  };
  isError?: boolean;
  timestamp: Date;
}

interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTED_QUESTIONS = [
  'Give me the activity details of all team members during the last four weeks.',
  'What did Evan Wright work on this week?',
  'Which team members reported key blockers?',
  'Compare completed work across the team.',
  'Which reports are still awaiting approval?',
  'Summarise the Data and Analytics Pipeline project.',
  'What recurring blockers appeared during the last four weeks?',
];

function formatDateRange(range: { from: string; to: string } | null | undefined): string | null {
  if (!range || !range.from || !range.to) return null;
  return `${range.from} to ${range.to}`;
}

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: 'Hello! I am your AI Team-Report Assistant. Ask about team members, projects, blockers, achievements, workload, or report status across your team.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || input).trim();
    if (!textToSend || loading) return;

    const userMessage: Message = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setErrorMessage(null);
    setLoading(true);

    try {
      const res: AssistantQueryResponse = await assistantApi.query(textToSend);
      const assistantMessage: Message = {
        id: `ast-${Date.now()}`,
        sender: 'assistant',
        text: res.answer,
        meta: {
          reportCount: res.reportCount,
          dateRange: res.dateRange,
          provider: res.provider,
          model: res.model,
        },
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const msg = err?.message || 'The AI report assistant is temporarily unavailable. Please try again later.';
      setErrorMessage(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: msg,
          isError: true,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'assistant',
        text: 'Chat history cleared. What would you like to know about your team\'s weekly reports?',
        timestamp: new Date(),
      },
    ]);
    setErrorMessage(null);
  };

  if (!isOpen) return null;

  // Safe structured Markdown renderer using react-markdown & remark-gfm (raw HTML disabled)
  const renderFormattedText = (text: string) => {
    // Clean any stray backslash escapes before Markdown control characters
    const cleanText = text.replace(/\\([#*\-_`~>|])/g, '$1');

    return (
      <div className="prose-assistant text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h3 className="text-base font-bold text-primary pt-2 pb-1 border-b border-border/60">{children}</h3>,
            h2: ({ children }) => <h3 className="text-base font-bold text-primary pt-2 pb-1 border-b border-border/40">{children}</h3>,
            h3: ({ children }) => <h4 className="text-sm font-semibold text-primary pt-2 pb-0.5">{children}</h4>,
            h4: ({ children }) => <h5 className="text-xs font-semibold text-primary pt-1.5 pb-0.5 uppercase tracking-wide">{children}</h5>,
            p: ({ children }) => <p className="mb-2 leading-relaxed text-primary">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 text-primary">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-primary">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
            code: ({ children }) => (
              <code className="bg-subsurface px-1.5 py-0.5 rounded text-xs font-mono border border-border text-primary">
                {children}
              </code>
            ),
            hr: () => <hr className="my-3 border-t border-border" />,
            table: ({ children }) => (
              <div className="overflow-x-auto my-2 rounded border border-border">
                <table className="min-w-full divide-y divide-border text-xs text-left">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-subsurface text-primary font-semibold">{children}</thead>,
            tbody: ({ children }) => <tbody className="divide-y divide-border/60 bg-surface">{children}</tbody>,
            tr: ({ children }) => <tr className="hover:bg-subsurface/50 transition-colors">{children}</tr>,
            th: ({ children }) => <th className="px-3 py-2 font-semibold text-primary border-r border-border last:border-r-0">{children}</th>,
            td: ({ children }) => <td className="px-3 py-1.5 text-primary border-r border-border/40 last:border-r-0 align-top">{children}</td>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-accent pl-3 italic text-muted my-2">
                {children}
              </blockquote>
            ),
          }}
        >
          {cleanText}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-end transition-opacity">
      {/* Background click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Container */}
      <div className="relative w-full max-w-lg bg-surface h-full shadow-2xl flex flex-col border-l border-border z-10 animate-slide-in-right">
        {/* Drawer Header */}
        <div className="p-4 border-b border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-card bg-accent/10 border border-accent/20 text-accent flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-primary text-base">AI Team Assistant</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                  Manager
                </span>
              </div>
              <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Grounded strictly on authorized weekly reports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleClearHistory}
              title="Clear Conversation"
              className="p-1.5 text-muted hover:text-primary hover:bg-subsurface rounded-card transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              title="Close Panel"
              className="p-1.5 text-muted hover:text-primary hover:bg-subsurface rounded-card transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-canvas">
          {/* Scope Guidance Banner */}
          <div className="p-3 bg-subsurface rounded-card border border-border text-xs text-muted flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-primary">Report Scope:</span> Ask about team members, projects, blockers, achievements, workload, or report status.
            </div>
          </div>

          {/* Message List */}
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isErr = msg.isError;
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className={`w-8 h-8 rounded-full ${isErr ? 'bg-red-500/10 text-red-600 border border-red-200' : 'bg-accent/10 border border-accent/20 text-accent'} flex items-center justify-center shrink-0 mt-1`}>
                    {isErr ? <AlertTriangle className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                )}

                <div
                  className={`max-w-[88%] rounded-card p-3.5 shadow-sm ${
                    isUser
                      ? 'bg-accent text-white rounded-br-none'
                      : isErr
                      ? 'bg-red-50 text-red-800 border border-red-200 rounded-bl-none'
                      : 'bg-surface text-primary border border-border rounded-bl-none'
                  }`}
                >
                  {isUser ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <div>
                      {renderFormattedText(msg.text)}

                      {msg.meta?.reportCount !== undefined && msg.meta.reportCount > 0 && (
                        <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {msg.meta.reportCount} {msg.meta.reportCount === 1 ? 'report' : 'reports'} analyzed
                          </span>
                          {formatDateRange(msg.meta.dateRange) && (
                            <span>{formatDateRange(msg.meta.dateRange)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-full bg-subsurface border border-border text-muted flex items-center justify-center shrink-0 mt-1">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 text-accent flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-surface border border-border rounded-card rounded-bl-none p-3 shadow-sm flex items-center gap-2 text-xs text-muted">
                <Loader2 className="w-4 h-4 text-accent animate-spin" />
                <span>Synthesizing database reports & tasks...</span>
              </div>
            </div>
          )}

          {/* Prompt Suggestions */}
          {messages.length <= 2 && !loading && (
            <div className="pt-2">
              <div className="text-xs font-medium text-muted mb-2 px-1">Example Inquiries:</div>
              <div className="space-y-1.5">
                {SUGGESTED_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(q)}
                    className="w-full text-left p-2.5 bg-surface hover:bg-subsurface border border-border rounded-card text-xs text-primary transition-all flex items-center justify-between group shadow-sm hover:border-accent/40"
                  >
                    <span>{q}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <div className="p-3 border-t border-border bg-surface">
          {errorMessage && (
            <div className="text-xs text-red-600 mb-2 px-1 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Ask about team members, projects, blockers, workload..."
              className="flex-1 bg-subsurface border border-border rounded-card px-3.5 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent disabled:opacity-60"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="px-3.5 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white rounded-card text-sm font-medium transition-colors flex items-center justify-center shrink-0 shadow-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="text-[10px] text-muted text-center mt-2">
            Responses are grounded strictly on submitted team reports. Press <kbd className="font-mono bg-subsurface px-1 py-0.5 rounded border border-border">Enter</kbd> to submit.
          </div>
        </div>
      </div>
    </div>
  );
};
