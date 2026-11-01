import { describe, it, expect } from 'vitest';
import { htmlToText } from '#src/infrastructure/jobDescription/htmlToText.js';

describe('htmlToText', () => {
  it('drops tags and collapses whitespace', () => {
    expect(htmlToText('<p>Senior   <b>Engineer</b></p>')).toBe('Senior Engineer');
  });

  it('removes script and style blocks, including a closing tag with trailing whitespace', () => {
    expect(htmlToText('a<script>evil()</script >b<style>x{}</style\n>c')).toBe('abc');
  });

  it('does not rebuild a tag from nested fragments', () => {
    expect(htmlToText('<scr<script></script>ipt>alert(1)</scr<script></script>ipt>')).not.toMatch(
      /[<>]/,
    );
    expect(htmlToText('<<b>b>x')).not.toMatch(/<[a-z]/i);
  });

  it('decodes an entity once, so &amp;lt; stays the literal text &lt;', () => {
    expect(htmlToText('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
  });

  it('decodes common entities', () => {
    expect(htmlToText('R&amp;D&nbsp;&quot;lead&quot; &lt;3')).toBe('R&D "lead" <3');
  });
});
