export type ThemePreference = "system" | "light" | "dark";
export type PoemLayout = "horizontal" | "vertical";
export type PoemFontSize = "small" | "medium" | "large";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type TimePeriod = "morning" | "day" | "evening" | "night";
export type WeatherKind =
  | "clear"
  | "cloudy"
  | "overcast"
  | "light-rain"
  | "rain"
  | "heavy-rain"
  | "snow"
  | "fog"
  | "wind"
  | "thunderstorm"
  | "hot"
  | "cold"
  | "unknown";

export interface City {
  id: string;
  name: string;
  province: string;
  latitude: number;
  longitude: number;
  note: string;
}

export interface AppSettings {
  configured: boolean;
  cityId: string;
  autostart: boolean;
  anonymousMetrics: boolean;
  theme: ThemePreference;
  reduceMotion: boolean;
  poemLayout: PoemLayout;
  poemFontSize: PoemFontSize;
  readingWindowSize?: { width: number; height: number };
}

export interface CalendarContext {
  localDate: string;
  displayDate: string;
  weekday: string;
  festival?: string;
  solarTerm?: string;
  lunarLabel: string;
  season: Season;
  timePeriod: TimePeriod;
}

export interface WeatherWarning {
  id: string;
  title: string;
  level: "advisory" | "warning" | "severe";
  description: string;
  source: string;
  origin: "official" | "weather-proxy";
  area?: string;
  publishedAt?: string;
  expiresAt?: string;
}

export interface WeatherContext {
  kind: WeatherKind;
  label: string;
  temperature?: number;
  apparentTemperature?: number;
  windSpeed?: number;
  precipitation?: number;
  observedAt?: string;
  freshness: "fresh" | "stale" | "unavailable";
  source: "open-meteo" | "cache" | "offline" | "synthetic";
  warnings: WeatherWarning[];
  shouldSuppressPoem: boolean;
}

export type PerformanceWeatherScenario =
  | "weather-offline"
  | "weather-timeout"
  | "official-warning"
  | "scene-rain";

export interface PoemTags {
  festivals: string[];
  weather: WeatherKind[];
  solarTerms: string[];
  seasons: Season[];
  timePeriods: TimePeriod[];
  emotions: string[];
  lifeScenes: string[];
}

export interface Poem {
  id: string;
  title: string;
  literaryForm: string;
  author: string;
  dynasty: string;
  fullText: string[];
  excerpt: string[];
  sourceName: string;
  oneLineSummary: string;
  culturalBackground: string;
  contemporaryConnection: string;
  annotations: Array<{ term: string; explanation: string }>;
  tags: PoemTags;
  quality: number;
}

export type ContentReviewStatus =
  | "draft"
  | "reviewed"
  | "published"
  | "retracted";

export interface ContentReview {
  workId: string;
  status: ContentReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  sourceVerified: boolean;
  notes?: string;
}

export interface RecommendationHistoryItem {
  localDate: string;
  workId: string;
  author: string;
  primaryContext: string;
  displayedAt?: string;
}

export interface FeedbackItem {
  workId: string;
  type: "disliked" | "replaced";
  contextTags: string[];
  createdAt: string;
  localDate?: string;
}

export type PilotEventType =
  | "app-opened"
  | "poem-presented"
  | "warning-suppressed"
  | "detail-opened"
  | "not-relevant"
  | "poem-replaced"
  | "favorite-added";

export interface PilotAggregate {
  activeDates: string[];
  poemPresentedDates: string[];
  warningSuppressedDates: string[];
  detailOpenedDates: string[];
  notRelevantDates: string[];
  replacementDates: string[];
  favoriteAddedDates: string[];
}

export interface PilotSessionAggregate {
  completedSessions: number;
  uncleanExitSessions: number;
  sessionOpen: boolean;
}

export interface PilotState {
  schemaVersion: "1.1";
  consentVersion: string;
  status: "active" | "completed";
  startedOn: string;
  endsOn: string;
  purgeOn: string;
  aggregate: PilotAggregate;
  sessions: PilotSessionAggregate;
}

export interface PilotSummary {
  schemaVersion: "1.1";
  planVersion: string;
  appVersion: string;
  contentVersion: string;
  ruleVersion: string;
  generatedOn: string;
  status: PilotState["status"];
  period: {
    startedOn: string;
    endsOn: string;
  };
  counts: {
    activeDays: number;
    eligibleDeliveryDays: number;
    successfulDeliveryDays: number;
    warningSuppressedDays: number;
    detailOpenDays: number;
    notRelevantDays: number;
    replacementDays: number;
    favoriteAddDays: number;
    completedSessions: number;
    sessionsWithoutUncleanExit: number;
    uncleanExitSessions: number;
  };
  rates: {
    deliveryPercent: number | null;
    detailOpenPercent: number | null;
    notRelevantPercent: number | null;
    crashFreeSessionPercent: number | null;
  };
  currentAutostartEnabled: boolean;
  privacy: {
    automaticUpload: false;
    containsIdentifier: false;
    containsCity: false;
    containsWorkId: false;
    containsRawEvents: false;
    containsSessionTimestamps: false;
    containsCrashDump: false;
  };
}

export interface ScoreBreakdown {
  festival: number;
  weather: number;
  solarTerm: number;
  season: number;
  timePeriod: number;
  quality: number;
  variety: number;
  feedback: number;
  tieBreaker: number;
}

export interface Recommendation {
  poem: Poem;
  reason: string;
  primaryContext: string;
  score: number;
  breakdown: ScoreBreakdown;
  source: "ai" | "rule" | "fallback";
}

export interface DailyState {
  localDate: string;
  state:
    | "idle"
    | "shown"
    | "retained"
    | "alert-suppressed"
    | "content-withdrawn";
  workId?: string;
  shownAt?: string;
  contentVersion: string;
  ruleVersion: string;
}

export interface AppBootstrap {
  settings: AppSettings;
  dailyState?: DailyState;
  history: RecommendationHistoryItem[];
  favorites: string[];
  feedback: FeedbackItem[];
  pilotState?: PilotState;
}
