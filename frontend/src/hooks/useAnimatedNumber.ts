import { useEffect, useRef, useState } from 'react';

/**
 * Eases a displayed number toward a new target with requestAnimationFrame.
 *
 * The tween is presentation-only: callers keep the authoritative value in state
 * and the panel labels/units are unchanged. When the visitor asks for reduced
 * motion, or on the first value, the target is shown immediately.
 */
export function useAnimatedNumber(target: number | null, duration = 480): number | null {
  const [display, setDisplay] = useState<number | null>(target);
  const currentRef = useRef<number | null>(target);

  useEffect(() => {
    if (target == null) {
      currentRef.current = null;
      setDisplay(null);
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const from = currentRef.current;
    if (reducedMotion || from == null || typeof window === 'undefined') {
      currentRef.current = target;
      setDisplay(target);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (target - from) * eased;
      currentRef.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return display;
}
