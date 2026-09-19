"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Alert,
  BmsPoint,
  RobotTelemetry,
  SensorReading,
  TwinSnapshot,
  WalkthroughMode,
} from "@/lib/twin/types";

interface SymbologyEntry {
  color: string;
  pulse: boolean;
}

interface TwinPlatformState {
  snapshot: TwinSnapshot | null;
  symbology: Record<string, SymbologyEntry>;
  connected: boolean;
  isLive: boolean;
  simulationTime: number | null;
  walkthroughMode: WalkthroughMode;
  selectedAssetGuid: string | null;
}

export function useTwinPlatform(robotProgress: number) {
  const [state, setState] = useState<TwinPlatformState>({
    snapshot: null,
    symbology: {},
    connected: false,
    isLive: true,
    simulationTime: null,
    walkthroughMode: "off",
    selectedAssetGuid: null,
  });
  const progressRef = useRef(robotProgress);
  progressRef.current = robotProgress;

  useEffect(() => {
    const es = new EventSource("/api/twin/stream");
    es.onopen = () => setState((s) => ({ ...s, connected: true }));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as TwinSnapshot & {
          symbology?: Record<string, SymbologyEntry>;
        };
        setState((s) =>
          s.isLive
            ? {
                ...s,
                snapshot: data,
                symbology: data.symbology ?? s.symbology,
                connected: true,
              }
            : s
        );
      } catch {
        /* ignore parse errors */
      }
    };
    es.onerror = () => setState((s) => ({ ...s, connected: false }));
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!state.isLive) return;
    const id = setInterval(() => {
      fetch("/api/twin/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ robotProgress: progressRef.current }),
      }).catch(() => {});
    }, 1500);
    return () => clearInterval(id);
  }, [state.isLive]);

  const setSimulationTime = useCallback(async (t: number | null) => {
    if (t === null) {
      const res = await fetch("/api/twin/state");
      const data = await res.json();
      setState((s) => ({
        ...s,
        isLive: true,
        simulationTime: null,
        snapshot: data,
        symbology: data.symbology ?? {},
      }));
      return;
    }
    const res = await fetch(`/api/twin/state?at=${t}`);
    const data = await res.json();
    setState((s) => ({
      ...s,
      isLive: false,
      simulationTime: t,
      snapshot: data,
      symbology: data.symbology ?? {},
    }));
  }, []);

  const setWalkthroughMode = useCallback((mode: WalkthroughMode) => {
    setState((s) => ({ ...s, walkthroughMode: mode }));
  }, []);

  const selectAsset = useCallback((guid: string | null) => {
    setState((s) => ({ ...s, selectedAssetGuid: guid }));
  }, []);

  const acknowledgeAlert = useCallback(async (id: string) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }, []);

  return {
    ...state,
    readings: (state.snapshot?.readings ?? []) as SensorReading[],
    alerts: (state.snapshot?.alerts ?? []) as Alert[],
    bms: (state.snapshot?.bms ?? []) as BmsPoint[],
    robotTelemetry: state.snapshot?.robot as RobotTelemetry | undefined,
    setSimulationTime,
    setWalkthroughMode,
    selectAsset,
    acknowledgeAlert,
  };
}

export type AssetDetail = {
  asset: { guid: string; name: string; type: string; metadata: Record<string, unknown> };
  relations: unknown[];
  sensors: unknown[];
  workOrders: unknown[];
  bms: unknown[];
  documents: unknown[];
};

export async function fetchAssetDetail(guid: string): Promise<AssetDetail | null> {
  const res = await fetch(`/api/assets/${guid}`);
  if (!res.ok) return null;
  return res.json();
}
