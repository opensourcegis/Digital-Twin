"use client";

import type { WalkthroughMode } from "@/lib/twin/types";
import { Button } from "@/components/ui/button";
import { Eye, Footprints, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface WalkthroughControlsProps {
  mode: WalkthroughMode;
  onChange: (mode: WalkthroughMode) => void;
  robotPlaying: boolean;
}

const MODES = [
  {
    id: "off" as const,
    label: "Orbit",
    hint: "Free camera",
    Icon: VideoOff,
  },
  {
    id: "walk" as const,
    label: "Walk",
    hint: "WASD on site",
    Icon: Footprints,
  },
  {
    id: "third" as const,
    label: "Chase",
    hint: "3rd person",
    Icon: Video,
  },
  {
    id: "first" as const,
    label: "Cab",
    hint: "1st person",
    Icon: Eye,
  },
];

export function WalkthroughControls({
  mode,
  onChange,
  robotPlaying,
}: WalkthroughControlsProps) {
  const active = MODES.find((m) => m.id === mode) ?? MODES[0];

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
            Camera / Walkthrough
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-100">
            {active.label}
          </p>
        </div>
        {(mode === "first" || mode === "third") && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              robotPlaying
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-200"
            )}
          >
            {robotPlaying ? "Roaming" : "Paused"}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        {mode === "walk"
          ? "Walk the campus with WASD or arrow keys. Drag to look."
          : mode === "off"
            ? "Orbit freely, or pick Chase/Cab to follow ATLAS-01 on free roam."
            : robotPlaying
              ? "Camera locked to ATLAS-01 — robot is roaming."
              : "Simulation paused — press Start simulation to resume roam."}
      </p>
      <div className="mt-3 grid grid-cols-4 gap-1">
        {MODES.map(({ id, label, Icon }) => (
          <Button
            key={id}
            size="sm"
            variant={mode === id ? "default" : "secondary"}
            className={cn(
              "h-auto flex-col gap-1 px-1 py-2 text-[10px]",
              mode === id && "ring-1 ring-teal-400/40"
            )}
            onClick={() => onChange(id)}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
