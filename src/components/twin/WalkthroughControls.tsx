"use client";

import type { WalkthroughMode } from "@/lib/twin/types";
import { Button } from "@/components/ui/button";
import { Footprints, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface WalkthroughControlsProps {
  mode: WalkthroughMode;
  onChange: (mode: WalkthroughMode) => void;
  robotPlaying?: boolean;
  tilesetActive?: boolean;
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
    hint: "WASD robot",
    Icon: Footprints,
  },
];

export function WalkthroughControls({
  mode,
  onChange,
  tilesetActive = false,
}: WalkthroughControlsProps) {
  const effective: "off" | "walk" = mode === "walk" ? "walk" : "off";
  const active = MODES.find((m) => m.id === effective) ?? MODES[0];

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
            Robot control
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-100">
            {active.label}
          </p>
        </div>
        {effective === "walk" && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-emerald-500/15 text-emerald-300">
            {tilesetActive ? "Tileset" : "WASD"}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        {effective === "walk"
          ? tilesetActive
            ? "Walk the external tileset surface — WASD drive; Click to move drops the robot on the mesh."
            : "Campus roads — WASD drive. Load External 3D Tiles to walk that surface instead."
          : "Orbit freely. Focus a tileset, then Walk + Click to move the robot onto it."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-1">
        {MODES.map(({ id, label, Icon }) => (
          <Button
            key={id}
            size="sm"
            variant={effective === id ? "default" : "secondary"}
            className={cn(
              "h-auto flex-col gap-1 px-1 py-2 text-[10px]",
              effective === id && "ring-1 ring-teal-400/40"
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
