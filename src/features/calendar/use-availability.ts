"use client";
import { useEffect, useState } from "react";
import { loadAvailability } from "@/server/actions";
import type { BusySlot } from "@/types/domain";
export function useAvailability(
  initial: BusySlot[],
  rangeStart: string,
  rangeEnd: string,
  preview = false,
) {
  const key = `${rangeStart}/${rangeEnd}`;
  const [state, setState] = useState<{
    key: string;
    slots: BusySlot[];
    error: string;
  }>({ key: "", slots: initial, error: "" });
  useEffect(() => {
    if (preview) return;
    let active = true;
    loadAvailability(rangeStart, rangeEnd)
      .then((result) => {
        if (active)
          setState({
            key,
            slots: result.slots || [],
            error: result.error || "",
          });
      })
      .catch(() => {
        if (active)
          setState({
            key,
            slots: [],
            error: "Unable to check availability. Check your connection.",
          });
      });
    return () => {
      active = false;
    };
  }, [rangeStart, rangeEnd, key, preview]);
  return {
    slots: preview ? initial : state.slots,
    loading: !preview && state.key !== key,
    error: state.error,
  };
}
