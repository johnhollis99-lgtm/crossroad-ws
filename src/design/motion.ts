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

interface SonarOptions {
  /** Full cycle in ms (default 2800 — Pine spec `sonarRing` 2.8s). */
  duration?: number;
  /** Initial offset into the loop (ms) so two rings can be staggered. */
  delay?:    number;
}

/**
 * Sonar pulse — Pine spec section 6 `sonarRing`. Returns `{ scale, opacity }`
 * Animated.Values. Wrap a circular `<Animated.View>` and apply:
 *
 *   <Animated.View style={[styles.ring, { transform: [{ scale }], opacity }]} />
 *
 * Scale tweens 0.6 → 2.5 over the full cycle. Opacity tweens 0.7 → 0 over
 * the first 80% then holds at 0 until the loop restarts.
 *
 * Stagger via the `delay` option — pass 0 for the first ring and
 * `duration / 2` for the second to get the spec's sustained double-ripple.
 */
export function useSonar({ duration = 2800, delay = 0 }: SonarOptions = {}): {
  scale:   Animated.AnimatedInterpolation<number>;
  opacity: Animated.AnimatedInterpolation<number>;
} {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        // Park at midpoint and stay static — visible but not pulsing.
        progress.setValue(0.5);
        return;
      }
      loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(progress, {
            toValue:        1,
            duration,
            useNativeDriver: true,
          }),
          // Reset to 0 instantly so the next loop iteration starts clean.
          Animated.timing(progress, {
            toValue:        0,
            duration:       0,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [progress, duration, delay]);

  const scale = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.6, 2.5],
  });
  const opacity = progress.interpolate({
    inputRange:  [0, 0.8, 1],
    outputRange: [0.7, 0, 0],
  });

  return { scale, opacity };
}

/**
 * User-location halo pulse — Pine spec section 6 `userHalo`. Returns
 * `{ scale, opacity }` for the outer halo `<Animated.View>`.
 *
 * Scale tweens 1.0 → 1.5 over the full cycle. Opacity tweens 0.22 → 0.06.
 * Easier on the eye than the sonar — used on the single user-location dot.
 */
export function useUserHalo({ duration = 2200 }: { duration?: number } = {}): {
  scale:   Animated.AnimatedInterpolation<number>;
  opacity: Animated.AnimatedInterpolation<number>;
} {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        progress.setValue(0);
        return;
      }
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(progress, { toValue: 1, duration: duration / 2, useNativeDriver: true }),
          Animated.timing(progress, { toValue: 0, duration: duration / 2, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [progress, duration]);

  const scale = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [1.0, 1.5],
  });
  const opacity = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.22, 0.06],
  });

  return { scale, opacity };
}
