'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Maximize, Minimize, Share2, Radio, Users, Info, ExternalLink, Copy, Check, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/stores/app';
import { useUIStore } from '@/stores/ui';
import { getYouTubeEmbedUrl, getTwitchEmbedUrl, cn, generateId } from '@/lib/utils';
import type { ChatMessage } from '@/types';

export default function LivePage() {
  const stream = useAppStore((s) => s.stream);
  const { theaterMode, toggleTheaterMode } = useUIStore();
  const [copied, setCopied] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatUsername, setChatUsername] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isLive = stream.is_live;

  const getEmbedUrl = useCallback(() => {
    if (stream.platform === 'youtube' && stream.embed_id) return getYouTubeEmbedUrl(stream.embed_id, isLive);
    if (stream.platform === 'twitch' && stream.embed_id) return getTwitchEmbedUrl(stream.embed_id);
    return '';
  }, [stream.platform, stream.embed_id, isLive]);

  const embedUrl = getEmbedUrl();

  // SSE chat connection
  useEffect(() => {
    const es = new EventSource('/api/chat/broadcast');
    eventSourceRef.current = es;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'history') {
          setChatMessages(data.messages || []);
        } else if (data.type === 'message') {
          setChatMessages((prev) => [...prev.slice(-199), data]);
        }
      } catch {}
    };
    es.onerror = () => {};
    return () => es.close();
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const username = chatUsername || 'Anonymous';
    const msg = { id: generateId(), username, message: chatInput.trim(), timestamp: new Date().toISOString() };
    setChatInput('');
    try { await fetch('/api/chat/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }); } catch {}
  };

  const handleShare = async () => {
    if (navigator.share) { try { await navigator.share({ title: stream.title, url: window.location.href }); } catch {} }
    else { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className={cn('mx-auto px-4 py-6 sm:px-6', theaterMode ? 'max-w-full' : 'max-w-7xl')}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {/* Player */}
        <div className={cn('relative overflow-hidden rounded-xl bg-black mb-6', theaterMode ? 'aspect-[21/9]' : 'aspect-video')}>
          {embedUrl ? (
            <iframe src={embedUrl} className="absolute inset-0 h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen title={stream.title} />
          ) : (
            <div className="flex h-full items-center justify-center flex-col gap-4">
              <Radio className="h-16 w-16 text-muted-foreground/30" />
              <p className="text-muted-foreground">No stream configured</p>
              <p className="text-xs text-muted-foreground/60">Set up your stream embed in Admin &gt; Stream</p>
            </div>
          )}
          {isLive && <div className="absolute top-4 left-4 z-10"><Badge variant="live"><span className="h-1.5 w-1.5 rounded-full bg-white mr-1 animate-pulse" />LIVE</Badge></div>}
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/50 backdrop-blur text-white border-0 hover:bg-black/70" onClick={toggleTheaterMode}>
              {theaterMode ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/50 backdrop-blur text-white border-0 hover:bg-black/70" onClick={handleShare}>
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className={cn('grid gap-6', theaterMode ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-3')}>
          <div className={cn(theaterMode ? 'lg:col-span-2' : 'lg:col-span-2')}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold">{stream.title}</h1>
                {stream.game && <p className="text-muted-foreground mt-1">{stream.game}</p>}
              </div>
              {isLive && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Users className="h-4 w-4" />{stream.viewer_count.toLocaleString()}</span>}
            </div>
            {stream.description && <p className="text-muted-foreground text-sm leading-relaxed">{stream.description}</p>}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4" /> Stream Info</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={isLive ? 'live' : 'secondary'}>{isLive ? 'Live' : 'Offline'}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Platform</span><span className="capitalize">{stream.platform}</span></div>
              </CardContent>
            </Card>

            {/* Chat */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Live Chat</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div ref={chatRef} className="h-64 overflow-y-auto p-3 space-y-2">
                  {chatMessages.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Say hi!</p>}
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="text-sm"><span className="font-medium text-primary">{msg.username}:</span> <span>{msg.message}</span></div>
                  ))}
                </div>
                <div className="border-t p-3 flex gap-2">
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} placeholder="Type a message..." className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm" maxLength={500} />
                  <Button size="icon" className="h-8 w-8" onClick={sendChat}><Send className="h-3 w-3" /></Button>
                </div>
                {!chatUsername && <div className="px-3 pb-3"><input value={chatUsername} onChange={(e) => setChatUsername(e.target.value)} placeholder="Display name (optional)" className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs" maxLength={30} /></div>}
              </CardContent>
            </Card>

            {embedUrl && <Button asChild variant="outline" className="w-full"><a href={embedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Watch on {stream.platform === 'youtube' ? 'YouTube' : 'Twitch'}</a></Button>}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
