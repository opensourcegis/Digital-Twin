import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters.toFixed(1)} m`;
}

export function formatSquareMeters(area: number): string {
  if (!Number.isFinite(area)) return "—";
  if (area >= 1_000_000) return `${(area / 1_000_000).toFixed(2)} km²`;
  return `${area.toFixed(0)} m²`;
}
