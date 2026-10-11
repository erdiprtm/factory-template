import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes; later classes win (React Native Reusables convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
