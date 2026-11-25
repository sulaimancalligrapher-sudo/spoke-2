export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const rawUrl = String(req.query.url || '').trim();
    const fileIdParam = String(req.query.id || '').trim();

    let targetUrl = '';
    if (fileIdParam) {
      targetUrl = `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileIdParam)}`;
    } else if (rawUrl) {
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return res.status(400).send('Invalid image URL');
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return res.status(400).send('Unsupported protocol');
      }
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.')
      ) {
        return res.status(403).send('Disallowed host');
      }
      targetUrl = parsed.toString();
    } else {
      return res.status(400).send('Missing url or id parameter');
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).send('Could not fetch image');
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    if (contentType.toLowerCase().includes('text/html')) {
      return res.status(404).send('Target returned HTML instead of an image');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.warn('Error in /api/proxy-image:', err);
    return res.status(500).send('Proxy error: ' + (err?.message || 'unknown'));
  }
}
