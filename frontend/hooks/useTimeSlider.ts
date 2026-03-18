"use client";
import { useState, useRef, useCallback, useEffect } from "react";

interface TimeSliderState {
  currentDate: string;
  startDate: string;
  endDate: string;
  isPlaying: boolean;
  speed: number; // weeks per second
}

export function useTimeSlider(
  globalStart = "1999-01-01",
  globalEnd = "2002-01-01"
) {
  const [state, setState] = useState<TimeSliderState>({
    currentDate: globalStart,
    startDate: globalStart,
    endDate: globalEnd,
    isPlaying: false,
    speed: 1,
  });

  const animationRef = useRef<ReturnType<typeof setInterval>>();

  const setCurrentDate = useCallback((date: string) => {
    setState((prev) => ({ ...prev, currentDate: date }));
  }, []);

  const setDateRange = useCallback((start: string, end: string) => {
    setState((prev) => ({
      ...prev,
      startDate: start,
      endDate: end,
      currentDate: start,
    }));
  }, []);

  const play = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, speed }));
  }, []);

  // Animation loop
  useEffect(() => {
    if (state.isPlaying) {
      animationRef.current = setInterval(() => {
        setState((prev) => {
          const current = new Date(prev.currentDate);
          current.setDate(current.getDate() + 7 * prev.speed);
          const newDate = current.toISOString().split("T")[0];

          if (newDate >= prev.endDate) {
            return { ...prev, currentDate: prev.endDate, isPlaying: false };
          }
          return { ...prev, currentDate: newDate };
        });
      }, 1000);
    }

    return () => {
      if (animationRef.current) clearInterval(animationRef.current);
    };
  }, [state.isPlaying, state.speed]);

  return {
    ...state,
    setCurrentDate,
    setDateRange,
    play,
    pause,
    setSpeed,
  };
}
