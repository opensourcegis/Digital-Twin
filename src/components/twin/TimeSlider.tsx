"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { History, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TimeSliderProps {
  isLive: boolean;
  simulationTime: number | null;
  onChange: (t: number | null) => void;
}

const RANGE_MS = 24 * 3600 * 1000;

export function TimeSlider({ isLive, simulationTime, onChange }: TimeSliderProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const min = now !== null ? now - RANGE_MS : 0;
  const value = simulationTime ?? now ?? 0;
  const pct = now !== null ? ((value - min) / RANGE_MS) * 100 : 0;

  const label = useMemo(() => {
    if (now === null) return "Loading…";
    if (isLive) return "Live";
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [isLive, value, now]);

  if (now === null) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 text-[10px] text-slate-500">
        <History className="h-3.5 w-3.5 text-teal-400" />
        Loading time slider…
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <History className="h-3.5 w-3.5 text-teal-400" />
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
          Time
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            isLive ? "bg-teal-500/20 text-teal-200" : "bg-white/10 text-slate-300"
          )}
        >
          {isLive && <Radio className="mr-1 inline h-2.5 w-2.5 animate-pulse" />}
          {label}
        </span>
        {!isLive && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => onChange(null)}
          >
            Go live
          </Button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={now}
        step={5 * 60 * 1000}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-teal-400"
        aria-label="Historical time slider"
      />
      <span className="hidden shrink-0 text-[10px] text-slate-500 sm:inline">
        {pct.toFixed(0)}% of 24h window
      </span>
    </div>
  );
}
