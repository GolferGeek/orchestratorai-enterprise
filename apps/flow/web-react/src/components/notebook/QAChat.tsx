import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { askQuestion, QAResponse } from './notebook-api';

interface QAChatProps {
  collection: { id: string; name: string };
  onBack: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: QAResponse['citations'];
  model?: string;
  durationMs?: number;
}

export function QAChat({ collection, onBack }: QAChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setError(null);

    const userMessage: ChatMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);

    try {
      setLoading(true);
      const response = await askQuestion(collection.id, question);

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.answer,
        citations: response.citations,
        model: response.model,
        durationMs: response.totalDurationMs,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to get answer',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="font-semibold">AI Q&A</h2>
          <p className="text-xs text-muted-foreground">{collection.name}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg mb-2">Ask a question about your documents</p>
            <p className="text-sm">
              The AI will search through your collection and provide answers with source citations.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

              {/* Citations */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                  <p className="text-xs font-medium opacity-70">Sources:</p>
                  {msg.citations.map((cite, cIdx) => (
                    <div
                      key={cIdx}
                      className="flex items-start gap-2 text-xs opacity-80"
                    >
                      <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">
                          {cite.documentFilename}
                        </span>
                        {cite.pageNumber && (
                          <span className="ml-1">(p.{cite.pageNumber})</span>
                        )}
                        <p className="line-clamp-2 opacity-60 mt-0.5">
                          {cite.content.substring(0, 150)}...
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Metadata */}
              {msg.durationMs && (
                <p className="text-[10px] opacity-50 mt-2">
                  {msg.model} &middot; {(msg.durationMs / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-muted-foreground">
                Searching and analyzing...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents..."
            rows={1}
            className="resize-none min-h-[40px] max-h-[120px]"
            disabled={loading}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || loading}
            className="h-10 w-10 p-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
