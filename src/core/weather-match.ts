import type { Poem, WeatherKind } from "../types";

export function matchesPoemWeather(poem: Poem, kind: WeatherKind): boolean {
  if (kind === "unknown") return false;
  // A light shower is still rain. Use broad rain imagery, while excluding
  // works also tagged for a downpour from this gentler context.
  return poem.tags.weather.includes(kind) ||
    (kind === "light-rain" &&
      poem.tags.weather.includes("rain") &&
      !poem.tags.weather.includes("heavy-rain"));
}
