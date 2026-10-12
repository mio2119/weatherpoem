import type {
  Poem,
  PoemTags,
  Season,
  TimePeriod,
  WeatherKind,
} from "../types";

export interface PoemSeed {
  id: string;
  title: string;
  form: string;
  author: string;
  dynasty: string;
  lines: string[];
  excerpt?: string[];
  source: string;
  summary: string;
  background: string;
  connection: string;
  annotations?: Array<[term: string, explanation: string]>;
  festivals?: string[];
  weather?: WeatherKind[];
  solarTerms?: string[];
  seasons?: Season[];
  timePeriods?: TimePeriod[];
  emotions?: string[];
  scenes?: string[];
  quality?: number;
}

export function fromSeed(value: PoemSeed): Poem {
  const tags: PoemTags = {
    festivals: value.festivals ?? [],
    weather: value.weather ?? [],
    solarTerms: value.solarTerms ?? [],
    seasons: value.seasons ?? [],
    timePeriods: value.timePeriods ?? [],
    emotions: value.emotions ?? [],
    lifeScenes: value.scenes ?? [],
  };
  return {
    id: value.id,
    title: value.title,
    literaryForm: value.form,
    author: value.author,
    dynasty: value.dynasty,
    fullText: value.lines,
    excerpt: value.excerpt ?? value.lines.slice(0, 2),
    sourceName: value.source,
    oneLineSummary: value.summary,
    culturalBackground: value.background,
    contemporaryConnection: value.connection,
    annotations: (value.annotations ?? []).map(([term, explanation]) => ({
      term,
      explanation,
    })),
    tags,
    quality: value.quality ?? 9,
  };
}
