import { NextRequest } from 'next/server';

function rewriteUrls(manifest: string, baseUrl: string): string {
  return manifest.replace(/^(?!#)(.+)$/gm, (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    try {
      const absolute = new URL(trimmed, baseUrl).href;
      return `/api/tv/proxy?url=${encodeURIComponent(absolute)}`;
    } catch {
      return line;
    }
  });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return new Response('Missing url param', { status: 400 });

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(url).origin,
        'Origin': new URL(url).origin,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const isM3u8 = contentType.includes('m3u8') || url.includes('.m3u8') || url.includes('m3u8');

    if (isM3u8) {
      const text = await upstream.text();
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const rewritten = rewriteUrls(text, baseUrl);
      return new Response(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=5',
        },
      });
    }

    const body = upstream.body;
    if (!body) return new Response('No body', { status: 500 });

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=10',
      },
    });
  } catch (e: any) {
    return new Response(`Proxy error: ${e.message}`, { status: 500 });
  }
}
