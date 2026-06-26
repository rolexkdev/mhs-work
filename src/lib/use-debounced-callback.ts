"use client";

import { useEffect, useMemo, useRef } from "react";

/** Trả về phiên bản debounce của callback — dùng cho auto-save khi gõ. */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay = 600,
) {
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  const timer = useRef<ReturnType<typeof setTimeout>>();

  const debounced = useMemo(
    () =>
      (...args: A) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => cbRef.current(...args), delay);
      },
    [delay],
  );

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  return debounced;
}
