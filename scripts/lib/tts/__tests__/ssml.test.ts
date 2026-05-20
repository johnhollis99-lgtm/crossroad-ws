/**
 * Unit tests for ssmlize().
 *
 * Focus: number-handling cases that have been load-bearing in production
 * narrations — cardinal wrap, calendar-year skip, highway skip, and the
 * decimal skip added 2026-05-18 after the cycle-3 sampler review found
 * "magnitude 7.9" reading as "seventy-nine" (because the sanitizer
 * stripped the decimal point before the wrap took effect).
 */

import { ssmlize } from '../../../../server/lib/ssml';

describe('ssmlize — number handling', () => {
  // ── Decimal skip (new, 2026-05-18) ────────────────────────────────

  it('emits decimals as plain text, NOT wrapped in <say-as cardinal>', () => {
    const { ssml, skips } = ssmlize('magnitude 7.9');
    // Should NOT contain <say-as ...>79</say-as> (sanitizer would strip the dot)
    expect(ssml).not.toMatch(/<say-as[^>]*>79<\/say-as>/);
    // Should contain the bare "7.9" so Google reads "seven point nine"
    expect(ssml).toContain('7.9');
    // Skip event recorded for adherence audit
    expect(skips).toContainEqual(
      expect.objectContaining({ type: 'decimal', value: '7.9' }),
    );
  });

  it('decimal billion phrasing reads correctly as "four point five billion"', () => {
    const { ssml, skips } = ssmlize('formed 4.5 billion years ago');
    expect(ssml).not.toMatch(/<say-as[^>]*>45<\/say-as>/);
    expect(ssml).toContain('4.5');
    expect(skips.filter(s => s.type === 'decimal')).toHaveLength(1);
  });

  it('handles multiple decimals in the same sentence', () => {
    const { ssml, skips } = ssmlize('between 1.5 and 2.7 million years');
    expect(ssml).toContain('1.5');
    expect(ssml).toContain('2.7');
    expect(skips.filter(s => s.type === 'decimal')).toHaveLength(2);
    // The "million" stays as plain English (no digits in it).
  });

  // ── Whole-number cardinal wrap (regression guard) ────────────────────

  it('wraps comma-separated whole numbers and sanitizes commas out of the wrap', () => {
    const { ssml } = ssmlize('elevation 14,495 feet');
    // Sanitizer strips the comma inside the wrap so Google reads "fourteen
    // thousand four hundred ninety-five" correctly.
    expect(ssml).toMatch(/<say-as interpret-as="cardinal">14495<\/say-as>/);
    // But the wrap is present — bare "14,495" would still hit the comma bug.
    expect(ssml).not.toMatch(/<say-as interpret-as="cardinal">14,495<\/say-as>/);
  });

  it('wraps plain whole numbers without modification', () => {
    const { ssml } = ssmlize('founded with 100 settlers');
    expect(ssml).toMatch(/<say-as interpret-as="cardinal">100<\/say-as>/);
  });

  // ── Skip rules (regression guards) ───────────────────────────────────

  it('skips calendar years when not followed by a measurement unit', () => {
    const { ssml, skips } = ssmlize('founded in 1782');
    expect(ssml).not.toMatch(/<say-as[^>]*>1782<\/say-as>/);
    expect(ssml).toContain('1782');
    expect(skips).toContainEqual(expect.objectContaining({ type: 'year', value: '1782' }));
  });

  it('wraps year-shaped numbers followed by units (NOT calendar years)', () => {
    const { ssml, skips } = ssmlize('1849 miles');
    // "1849 miles" is a distance, not a date — should wrap.
    expect(ssml).toMatch(/<say-as interpret-as="cardinal">1849<\/say-as>/);
    expect(skips.filter(s => s.type === 'year' && s.value === '1849')).toHaveLength(0);
  });

  it('skips highway-context digits so Google road-number heuristic fires', () => {
    const { ssml, skips } = ssmlize('Highway 101 along the coast');
    expect(ssml).not.toMatch(/<say-as[^>]*>101<\/say-as>/);
    expect(skips).toContainEqual(expect.objectContaining({ type: 'highway', value: '101' }));
  });

  // ── Pause markers (regression guard) ─────────────────────────────────

  it('converts pause markers to break tags without touching their digits', () => {
    const { ssml } = ssmlize('first beat {{PAUSE_500}} second beat');
    expect(ssml).toContain('<break time="500ms"/>');
    // The "500" inside the break tag must NOT be cardinal-wrapped.
    expect(ssml).not.toMatch(/<say-as[^>]*>500<\/say-as>/);
  });

  // ── Combined real-narration shape ────────────────────────────────────

  it('combined: year + decimal + whole-number + pause markers', () => {
    const text =
      'In 1857 {{PAUSE_500}} a magnitude 7.9 earthquake shifted the ground 30 feet.';
    const { ssml, skips } = ssmlize(text);
    expect(ssml).toContain('1857'); // year-skipped
    expect(ssml).toContain('7.9');  // decimal-skipped
    expect(ssml).toMatch(/<say-as interpret-as="cardinal">30<\/say-as>/); // whole wraps
    expect(ssml).toContain('<break time="500ms"/>');
    expect(skips.map(s => s.type).sort()).toEqual(['decimal', 'year']);
  });
});
