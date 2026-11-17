import { hexColor, httpUrl, optionalHttpUrl, plainText, relativePath, richText } from './zod-helpers';

describe('input helpers', () => {
  it('only accepts http(s) URLs', () => {
    expect(httpUrl.safeParse('https://example.com/a').success).toBe(true);
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>',
      'vbscript:x',
      'file:///etc/passwd',
      'not a url',
    ]) {
      expect(httpUrl.safeParse(bad).success).toBe(false);
    }
    expect(optionalHttpUrl.parse('')).toBe('');
  });

  it('rejects protocol-relative paths', () => {
    expect(relativePath.safeParse('/account/booking.html').success).toBe(true);
    expect(relativePath.safeParse('//evil.com').success).toBe(false);
    expect(relativePath.safeParse('https://evil.com').success).toBe(false);
  });

  it('sanitises rich text to the allow-list', () => {
    const html = richText(1000).parse(
      '<p onclick="x()">مرحبا <a href="javascript:alert(1)">رابط</a><script>alert(1)</script><img src=x onerror=y></p><a href="https://x.sa" target="_top">ok</a>',
    );
    expect(html).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(html).toContain('<p>مرحبا');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('blocks markup in plain text and CSS injection in colours', () => {
    expect(plainText(50).safeParse('<b>x</b>').success).toBe(false);
    expect(hexColor.safeParse('#0F4C3A').success).toBe(true);
    expect(hexColor.safeParse('red;}body{display:none').success).toBe(false);
  });
});

describe('boundedArray', () => {
  it('rejects oversized arrays with a single issue', async () => {
    const { boundedArray } = await import('./zod-helpers');
    const { z } = await import('zod');
    const r = boundedArray(z.string(), 5).safeParse(Array(100_000).fill(1));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues).toHaveLength(1);
    expect(boundedArray(z.string(), 5).safeParse(['a', 'b']).success).toBe(true);
    expect(boundedArray(z.string(), 5).safeParse([1]).success).toBe(false);
  });
});
