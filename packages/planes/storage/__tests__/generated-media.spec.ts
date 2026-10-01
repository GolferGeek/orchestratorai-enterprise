import { assertInertSvg, checkGeneratedMedia, extensionForMime } from '../generated-media';

const inert = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/><use xlink:href="#g"/></svg>';

describe('generated media', () => {
  it('names the extension for each stored type, and refuses an unknown one', () => {
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/svg+xml')).toBe('svg');
    expect(() => extensionForMime('application/octet-stream')).toThrow("'application/octet-stream' is not a type the platform stores");
  });

  it('keeps an SVG that only draws, with links inside the file', () => {
    expect(() => assertInertSvg(Buffer.from(inert))).not.toThrow();
    expect(checkGeneratedMedia(Buffer.from(inert), 'image/svg+xml')).toBe('svg');
  });

  it.each([
    ['<svg><script>alert(1)</script></svg>', 'a <script> element'],
    ['<svg onload="steal()"></svg>', 'an event handler attribute'],
    ['<svg><foreignObject><div/></foreignObject></svg>', 'a <foreignObject> element'],
    ['<svg><a xlink:href="javascript:steal()"/></svg>', 'a javascript: URL'],
    ['<svg><image href="https://tracker.example/p.png"/></svg>', 'a link or load outside the file'],
    ['<svg><iframe src="#"/></svg>', 'an embedded document'],
  ])('refuses active SVG content: %s', (svg, what) => {
    expect(() => checkGeneratedMedia(Buffer.from(svg), 'image/svg+xml')).toThrow(`it contains ${what}`);
  });

  it('refuses SVG that is not an SVG', () => {
    expect(() => assertInertSvg(Buffer.from('<html></html>'))).toThrow('no <svg> element');
  });
});
