/**
 * XRoad motion primitives — Pine spec section 6 ported to RN.
 *
 * Five animations in the design system (icon breath, sonar rings, cluster
 * breath / ring, user halo); this file currently ships only `useBreath`
 * because it's the lone Phase 2 requirement (Trip watermark X). Others
 * land alongside their first consumer.
 *
 * All loops respect prefers-reduced-motion via AccessibilityInfo —
 * Animated.Value sits at its midpoint and the loop never starts.
 */

import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

interface BreathOptions {
  /** Resting opacity (default 0.72 per Pine spec). */
  min?:      number;
  /** Peak opacity (default 1.0). */
  max?:      number;
  /** Full cycle in ms (default 2800 — Pine spec `iconBreath` 2.8s). */
  duration?: number;
}

/**
 * Returns an Animated.Value driven by a sine-like opacity loop. Apply via
 * `<Animated.View style={{ opacity }}>` or `<Animated.Text style={{ opacity }}>`.
 *
 * Reduced-motion safe: when the OS flag is on, the value parks at `max` and
 * no loop is started.
 */
export function useBreath({ min = 0.72, max = 1.0, duration = 2800 }: BreathOptions = {}): Animated.Value {
  const value = useRef(new Animated.Value(min)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        value.setValue(max);
        return;
      }
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: max, duration: duration / 2, useNativeDriver: true }),
          Animated.timing(value, { toValue: min, duration: duration / 2, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [value, min, max, duration]);

  return value;
}
