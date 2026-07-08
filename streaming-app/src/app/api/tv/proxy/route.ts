import { NextRequest } from 'next/server';

function rewriteUrls(manifest: string, baseUrl: string): string {
  const lines = manifest.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#EXT-X-MEDIA:') && line.includes('URI=')) {
      const rewritten = line.replace(/URI="([^"]+)"/g, (_, uri) => {
        try {
          const absolute = new URL(uri, baseUrl).href;
          return `URI="/api/tv/proxy?url=${encodeURIComponent(absolute)}"`;
        } catch { return `URI="${uri}"`; }
      });
      result.push(rewritten);
    } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
      result.push(line);
    } else if (!line.startsWith('#') && line.trim()) {
      try {
        const absolute = new URL(line.trim(), baseUrl).href;
        result.push(`/api/tv/proxy?url=${encodeURIComponent(absolute)}`);
      } catch {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }
  return result.join('\n');
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return new Response('Missing url param', { status: 400 });

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': new URL(url).origin + '/',
        'Origin': new URL(url).origin,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
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
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    const body = upstream.body;
    if (!body) return new Response('No body', { status: 500 });

    const respHeaders = new Headers();
    respHeaders.set('Content-Type', contentType);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', '*');
    respHeaders.set('Cache-Control', 'public, max-age=2');

    return new Response(body, { status: 200, headers: respHeaders });
  } catch (e: any) {
    return new Response(`Proxy error: ${e.message}`, { status: 500 });
  }
}
