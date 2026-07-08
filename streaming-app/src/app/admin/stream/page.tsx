'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Radio, Save, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/stores/app';
import toast from 'react-hot-toast';

export default function AdminStreamPage() {
  const stream = useAppStore((s) => s.stream);
  const setStream = useAppStore((s) => s.setStream);
  const [title, setTitle] = useState(stream.title);
  const [game, setGame] = useState(stream.game);
  const [description, setDescription] = useState(stream.description);
  const [embedId, setEmbedId] = useState(stream.embed_id);

  useEffect(() => { setTitle(stream.title); setGame(stream.game); setDescription(stream.description); setEmbedId(stream.embed_id); }, [stream]);

  const handleSave = () => { setStream({ title, game, description, embed_id: embedId }); toast.success('Stream settings updated'); };
  const toggleLive = () => { setStream({ is_live: !stream.is_live }); toast.success(stream.is_live ? 'Stream marked offline' : 'Stream marked live'); };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Stream Settings</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader><CardTitle className="text-sm">Stream Info</CardTitle><CardDescription>Update your stream title, game, and description</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div><label className="text-sm font-medium mb-1 block">Stream Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Enter stream title" /></div>
              <div><label className="text-sm font-medium mb-1 block">Current Game</label><input value={game} onChange={(e) => setGame(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="e.g. Valorant, Minecraft" /></div>
              <div><label className="text-sm font-medium mb-1 block">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none" placeholder="Stream description" /></div>
              <div><label className="text-sm font-medium mb-1 block">Stream Embed ID</label><input value={embedId} onChange={(e) => setEmbedId(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="YouTube video ID or Twitch channel name" /><p className="text-xs text-muted-foreground mt-1">YouTube: video ID from URL (e.g., dQw4w9WgXcQ). Twitch: channel name (e.g., shroud).</p></div>
              <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" />Save Changes</Button>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader><CardTitle className="text-sm">Stream Status</CardTitle><CardDescription>Control your live status</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3"><Radio className={`h-5 w-5 ${stream.is_live ? 'text-red-500' : 'text-muted-foreground'}`} /><div><p className="font-medium">Live Status</p><p className="text-xs text-muted-foreground">Toggle your stream status</p></div></div>
                <Button variant={stream.is_live ? 'destructive' : 'default'} size="sm" onClick={toggleLive}>{stream.is_live ? 'Go Offline' : 'Go Live'}</Button>
              </div>
              <div className="p-4 rounded-lg border space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Platform</span><span className="capitalize">{stream.platform}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Viewers</span><span>{stream.viewer_count}</span></div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>This status is for the website display. Actual streaming goes through your external platform (YouTube/Twitch). Configure the embed in Settings.</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
