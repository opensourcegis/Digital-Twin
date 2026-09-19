import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMeters(
  meters: number,
  units: "metric" | "imperial" = "metric"
): string {
  if (!Number.isFinite(meters)) return "—";
  if (units === "imperial") {
    const ft = meters * 3.28084;
    if (ft >= 5280) return `${(ft / 5280).toFixed(2)} mi`;
    return `${ft.toFixed(1)} ft`;
  }
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters.toFixed(1)} m`;
}

export function formatSquareMeters(
  area: number,
  units: "metric" | "imperial" = "metric"
): string {
  if (!Number.isFinite(area)) return "—";
  if (units === "imperial") {
    const ft2 = area * 10.7639;
    if (ft2 >= 27878400) return `${(ft2 / 27878400).toFixed(2)} mi²`;
    return `${ft2.toFixed(0)} ft²`;
  }
  if (area >= 1_000_000) return `${(area / 1_000_000).toFixed(2)} km²`;
  return `${area.toFixed(0)} m²`;
}
