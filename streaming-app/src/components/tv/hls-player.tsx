'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HLSPlayerProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
  channelName?: string;
}

function proxyUrl(url: string): string {
  return `/api/tv/proxy?url=${encodeURIComponent(url)}`;
}

export function HLSPlayer({ src, className, autoPlay = true, channelName }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Initializing...');
  const srcRef = useRef(src);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    srcRef.current = src;

    const destroyHls = () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
    destroyHls();
    setError(null);
    setLoading(true);
    setStatus('Loading manifest...');

    const proxied = proxyUrl(src);
    const isHls = src.includes('.m3u8') || src.includes('m3u8');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 10,
        maxMaxBufferLength: 30,
        startFragPrefetch: true,
        testBandwidth: false,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 3,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        console.log('[HLS] MANIFEST_PARSED', data.levels.length, 'levels');
        setStatus(`Manifest loaded (${data.levels.length} quality levels)`);
        setLoading(false);
        if (autoPlay) video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHING, (_e, data) => {
        console.log('[HLS] LEVEL_SWITCHING', data.level);
        setStatus(`Switching to level ${data.level}...`);
      });

      hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
        console.log('[HLS] FRAG_LOADED', data.frag?.url?.substring(0, 80));
        setStatus('Buffering...');
        setLoading(false);
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        console.error('[HLS] ERROR', data.type, data.details, data);
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setStatus('Network error - retrying...');
            hls.startLoad();
          } else {
            setError(`Stream error: ${data.details}`);
            setLoading(false);
          }
        }
      });

      console.log('[HLS] Loading source:', proxied);
      hls.loadSource(proxied);
      hls.attachMedia(video);

    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxied;
      video.onloadedmetadata = () => { setLoading(false); if (autoPlay) video.play().catch(() => {}); };
      video.onerror = () => { setError('Stream unavailable'); setLoading(false); };
    } else {
      setError('HLS not supported in this browser');
      setLoading(false);
    }

    return destroyHls;
  }, [src, autoPlay]);

  const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? (v.play(), setIsPlaying(true)) : (v.pause(), setIsPlaying(false)); };
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setIsMuted(v.muted); };
  const toggleFullscreen = () => { const v = videoRef.current; if (!v) return; document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen(); };
  const handleRetry = () => { setLoading(true); setError(null); setStatus('Retrying...'); if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } const v = videoRef.current; if (v) { v.removeAttribute('src'); v.load(); } const srcCopy = srcRef.current; setTimeout(() => { setLoading(true); setError(null); }, 100); window.location.reload(); };

  return (
    <div className={cn('relative group bg-black rounded-lg overflow-hidden', className)}>
      <video ref={videoRef} className="w-full h-full object-contain" playsInline muted={isMuted} onClick={togglePlay} />

      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="text-center space-y-3">
            <div className="h-10 w-10 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
            <p className="text-white/70 text-sm">{status}</p>
            {channelName && <p className="text-white/40 text-xs">{channelName}</p>}
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center space-y-3 px-6">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
            <p className="text-white text-sm font-medium">{error}</p>
            {channelName && <p className="text-white/50 text-xs">{channelName}</p>}
            <Button variant="outline" size="sm" onClick={handleRetry} className="mt-2 border-white/20 text-white hover:bg-white/10">
              <RefreshCw className="mr-2 h-3 w-3" />Retry
            </Button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="absolute top-3 left-3 z-20">
          <span className="inline-flex items-center rounded-full bg-black/60 px-2 py-1 text-[10px] text-white/70">{status}</span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={togglePlay}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggleMute}>
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <div className="flex-1" />
        <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggleFullscreen}>
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
