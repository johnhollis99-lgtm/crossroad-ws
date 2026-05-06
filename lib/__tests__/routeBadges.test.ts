import { computeBadges } from '../routeBadges';

// ── helpers ───────────────────────────────────────────────────────────────────
function route(index: number, durationMin: number, distanceMi: number) {
  return { index, durationMin, distanceMi };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('computeBadges', () => {
  // ── empty / single-route edge cases ────────────────────────────────────────

  it('returns empty object for no routes', () => {
    expect(computeBadges([])).toEqual({});
  });

  it('gives a single route Fastest (not Scenic)', () => {
    const result = computeBadges([route(0, 30, 20)]);
    // single route is both fastest and shortest — Fastest wins, no double-label
    expect(result[0]).toBe('Fastest');
  });

  // ── Case 1: same route wins both fastest and shortest ──────────────────────
  // Bug scenario: old code searched for shortest among "others", so Route 1
  // would incorrectly receive 'Shortest' when Route 0 was best on both axes.

  it('labels one route Fastest when it is both fastest and shortest', () => {
    const routes = [
      route(0, 30, 20), // fastest (30 min) AND shortest (20 mi)
      route(1, 45, 30),
      route(2, 60, 40),
    ];
    const result = computeBadges(routes);
    expect(result[0]).toBe('Fastest');
    expect(result[1]).toBe('Scenic');
    expect(result[2]).toBe('Scenic');
    // Route 1 must NOT be labelled Shortest — it is not the global shortest
    expect(result[1]).not.toBe('Shortest');
  });

  // ── Case 2: different routes win fastest vs shortest ───────────────────────

  it('assigns Fastest and Shortest to separate routes when they differ', () => {
    const routes = [
      route(0, 30, 25), // fastest by duration
      route(1, 50, 15), // shortest by distance
      route(2, 55, 30), // neither
    ];
    const result = computeBadges(routes);
    expect(result[0]).toBe('Fastest');
    expect(result[1]).toBe('Shortest');
    expect(result[2]).toBe('Scenic');
  });

  it('handles two routes — fastest vs shortest split', () => {
    const routes = [
      route(0, 30, 25), // fastest
      route(1, 50, 15), // shortest
    ];
    const result = computeBadges(routes);
    expect(result[0]).toBe('Fastest');
    expect(result[1]).toBe('Shortest');
  });

  it('handles two routes where the same route wins both', () => {
    const routes = [
      route(0, 30, 20), // fastest AND shortest
      route(1, 45, 25),
    ];
    const result = computeBadges(routes);
    expect(result[0]).toBe('Fastest');
    expect(result[1]).toBe('Scenic');
  });

  // ── Case 3: near-identical — no badges ────────────────────────────────────
  // All values within 5% spread → return empty object

  it('returns empty object when all routes are within 5% on both axes', () => {
    const routes = [
      route(0, 60, 20.0),
      route(1, 62, 20.4), // +3.3% duration, +2% distance — both under 5%
      route(2, 61, 20.2),
    ];
    expect(computeBadges(routes)).toEqual({});
  });

  it('assigns badges when only duration spread exceeds 5%', () => {
    const routes = [
      route(0, 60, 20.0),
      route(1, 64, 20.2), // duration spread = 6.7% > 5% → badges fire
    ];
    const result = computeBadges(routes);
    expect(result[0]).toBe('Fastest');
    expect(result[1]).toBe('Scenic'); // shortest is same route (0), so 1 is Scenic
  });

  it('assigns badges when only distance spread exceeds 5%', () => {
    const routes = [
      route(0, 60, 20.0),
      route(1, 61, 22.0), // distance spread = 10% > 5% → badges fire
    ];
    const result = computeBadges(routes);
    expect(result[0]).toBe('Fastest'); // also shortest — no double label
    expect(result[1]).toBe('Scenic');
  });

  // ── tie-breaking ──────────────────────────────────────────────────────────
  // When two routes share the exact same minimum, the first one (lower index) wins.

  it('breaks duration ties in favour of the lower index', () => {
    const routes = [
      route(0, 30, 20),
      route(1, 30, 25), // same duration, higher distance
    ];
    const result = computeBadges(routes);
    expect(result[0]).toBe('Fastest');
  });
});
