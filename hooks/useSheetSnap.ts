/**
 * useSheetSnap — draggable bottom-sheet with three snap points.
 *
 * Controls an Animated.Value that represents the sheet's pixel height.
 * Attach `panHandlers` to the drag handle View; use `anim` as `height` in the
 * Animated.View style; call `snapTo` to jump to a snap level programmatically.
 * `level` state re-renders the caller whenever the snap point changes.
 */

import { useRef, useState, useCallback } from 'react';
import { Animated, PanResponder } from 'react-native';

export type SnapLevel = 'peek' | 'default' | 'expanded';

export interface SnapPoints {
  peek: number;
  default: number;
  expanded: number;
}

const SPRING = { useNativeDriver: false as const, friction: 9, tension: 80 };

export function useSheetSnap(points: SnapPoints, initial: SnapLevel = 'default') {
  const anim    = useRef(new Animated.Value(points[initial])).current;
  const startH  = useRef(points[initial]);
  const ptsRef  = useRef(points);
  ptsRef.current = points;

  const [level, setLevel] = useState<SnapLevel>(initial);
  // Stable ref so PanResponder (created once) can call the latest setter
  const setLevelRef = useRef(setLevel);
  setLevelRef.current = setLevel;

  const snapTo = useCallback((l: SnapLevel) => {
    setLevelRef.current(l);
    Animated.spring(anim, { toValue: ptsRef.current[l], ...SPRING }).start();
  }, [anim]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_e, gs) => Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        startH.current = (anim as any)._value as number;
      },
      onPanResponderMove: (_e, gs) => {
        const p = ptsRef.current;
        // Dragging UP (negative dy) grows the sheet; DOWN shrinks it
        const next = Math.max(p.peek, Math.min(p.expanded, startH.current - gs.dy));
        anim.setValue(next);
      },
      onPanResponderRelease: (_e, gs) => {
        const p   = ptsRef.current;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cur = (anim as any)._value as number;
        const vel = gs.vy; // positive = finger moving down

        let target: SnapLevel;
        if (vel < -0.8) {
          // Fast swipe up → expand
          target = 'expanded';
        } else if (vel > 0.8) {
          // Fast swipe down → peek or default depending on current position
          target = cur < (p.peek + p.default) / 2 ? 'peek' : 'default';
        } else {
          // Slow drag → nearest snap point
          const candidates: [SnapLevel, number][] = [
            ['peek',     Math.abs(cur - p.peek)],
            ['default',  Math.abs(cur - p.default)],
            ['expanded', Math.abs(cur - p.expanded)],
          ];
          target = candidates.reduce((a, b) => (a[1] < b[1] ? a : b))[0];
        }

        setLevelRef.current(target);
        Animated.spring(anim, { toValue: p[target], ...SPRING }).start();
      },
    })
  ).current;

  return { anim, panHandlers: pan.panHandlers, snapTo, level };
}
