import { checkResultPrecision, type NominatimRaw } from '../geocode';

describe('checkResultPrecision', () => {
  it('rejects the Tijuana-border placeholder (type=administrative, San Diego County bbox)', () => {
    // The actual placeholder: lat=32.6028017, lon=-117.0235257 — what
    // Nominatim returns when given a US address it can only resolve to
    // the US-Mexico border crossing point. Returned as type='administrative'
    // with a county-sized bounding box.
    const raw: NominatimRaw = {
      lat: '32.6028017',
      lon: '-117.0235257',
      display_name: 'San Diego County, California, United States',
      class: 'boundary',
      type: 'administrative',
      // San Diego County: ~32.5°-33.5° lat (~111 km), -117.6° to -116.0° lon (~150 km)
      boundingbox: ['32.534156', '33.505025', '-117.611081', '-116.080816'],
    };
    const result = checkResultPrecision(raw);
    expect(result.ok).toBe(false);
    // class='boundary' fires before type='administrative' in our order, but
    // either rejection is correct — both are independently true here.
    expect(['reject_type', 'reject_class', 'reject_bbox']).toContain(result.reason);
  });

  it('rejects city-typed results regardless of bbox', () => {
    for (const t of ['city', 'town', 'village', 'county']) {
      const raw: NominatimRaw = {
        lat: '34.0522',
        lon: '-118.2437',
        display_name: `Test ${t}`,
        type: t,
        // Tight bbox — would otherwise pass.
        boundingbox: ['34.0521', '34.0523', '-118.2438', '-118.2436'],
      };
      const result = checkResultPrecision(raw);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('reject_type');
    }
  });

  it('rejects boundary/place classes regardless of bbox', () => {
    for (const c of ['boundary', 'place']) {
      const raw: NominatimRaw = {
        lat: '34.0522',
        lon: '-118.2437',
        display_name: `Test ${c}`,
        class: c,
        // No type set → class check fires.
        boundingbox: ['34.0521', '34.0523', '-118.2438', '-118.2436'],
      };
      const result = checkResultPrecision(raw);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('reject_class');
    }
  });

  it('rejects results with bbox > 5 km on either axis (latitude axis)', () => {
    // 0.1° lat ≈ 11.1 km — fires on latKm axis even with precise type.
    const raw: NominatimRaw = {
      lat: '34.0',
      lon: '-118.0',
      display_name: 'Long-thin region',
      class: 'tourism',
      type: 'attraction',
      boundingbox: ['33.95', '34.05', '-118.005', '-117.995'],
    };
    const result = checkResultPrecision(raw);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('reject_bbox');
  });

  it('rejects results with bbox > 5 km on either axis (longitude axis)', () => {
    // 0.1° lon at 34°N ≈ 9.2 km — fires on lonKm.
    const raw: NominatimRaw = {
      lat: '34.0',
      lon: '-118.0',
      display_name: 'Long-thin region',
      class: 'tourism',
      type: 'attraction',
      boundingbox: ['33.999', '34.001', '-118.05', '-117.95'],
    };
    const result = checkResultPrecision(raw);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('reject_bbox');
  });

  it('accepts a precise building result (small bbox, non-administrative type)', () => {
    // LA City Hall — building footprint, tight bbox.
    const raw: NominatimRaw = {
      lat: '34.054089',
      lon: '-118.243170',
      display_name: 'Los Angeles City Hall, 200 N Spring St, Los Angeles, CA',
      class: 'building',
      type: 'civic',
      // ~0.0008° lat, 0.0008° lon → ~88 m × 73 m
      boundingbox: ['34.0537', '34.0545', '-118.2436', '-118.2428'],
    };
    const result = checkResultPrecision(raw);
    expect(result.ok).toBe(true);
  });

  it('accepts results without a bounding box (bbox check skipped)', () => {
    const raw: NominatimRaw = {
      lat: '34.054089',
      lon: '-118.243170',
      display_name: 'Some address',
      class: 'building',
      type: 'civic',
    };
    const result = checkResultPrecision(raw);
    expect(result.ok).toBe(true);
  });

  it('rejects results with non-finite coordinates', () => {
    const raw: NominatimRaw = {
      lat: 'not-a-number',
      lon: '-118.0',
      display_name: 'broken',
    };
    const result = checkResultPrecision(raw);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_coords');
  });
});
