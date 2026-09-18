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

export function WalkthroughControls({
  mode,
  onChange,
  robotPlaying,
}: WalkthroughControlsProps) {
  return (
    <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-violet-300" />
        <p className="text-sm font-medium text-violet-100">3D walkthrough</p>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {mode === "walk"
          ? "Walk the campus with WASD or arrow keys. Mouse drag to look around."
          : "Follow ATLAS-01 on patrol — camera tracks live telemetry zones."}
        {mode !== "walk" &&
          mode !== "off" &&
          !robotPlaying &&
          " Start patrol to move."}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {(
          [
            ["off", "Free", VideoOff],
            ["walk", "Walk", Footprints],
            ["third", "3rd person", Video],
            ["first", "1st person", Eye],
          ] as const
        ).map(([id, label, Icon]) => (
          <Button
            key={id}
            size="sm"
            variant={mode === id ? "default" : "secondary"}
            className={cn("text-[10px]", mode === id && "ring-1 ring-violet-400/50")}
            onClick={() => onChange(id)}
          >
            <Icon className="h-3 w-3" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
