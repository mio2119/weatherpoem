import type {
  PilotAggregate,
  PilotEventType,
  PilotSessionAggregate,
  PilotState,
  PilotSummary,
} from "../types";

export const PILOT_PLAN_VERSION = "2026.07-pilot-local-v2";
export const PILOT_DURATION_DAYS = 28;
export const PILOT_RETENTION_DAYS = 35;
const MAX_COMPLETED_SESSIONS = 10_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AGGREGATE_KEYS = [
  "activeDates",
  "poemPresentedDates",
  "warningSuppressedDates",
  "detailOpenedDates",
  "notRelevantDates",
  "replacementDates",
  "favoriteAddedDates",
] as const satisfies ReadonlyArray<keyof PilotAggregate>;

const EVENT_KEY: Record<
  Exclude<PilotEventType, "app-opened">,
  keyof PilotAggregate
> = {
  "poem-presented": "poemPresentedDates",
  "warning-suppressed": "warningSuppressedDates",
  "detail-opened": "detailOpenedDates",
  "not-relevant": "notRelevantDates",
  "poem-replaced": "replacementDates",
  "favorite-added": "favoriteAddedDates",
};

function parseDate(value: string): Date | undefined {
  if (!ISO_DATE.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? parsed
    : undefined;
}

function addDays(localDate: string, days: number): string {
  const parsed = parseDate(localDate);
  if (!parsed) throw new Error("试点日期必须是有效的 YYYY-MM-DD");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function inRange(value: string, start: string, end: string): boolean {
  return value >= start && value <= end;
}

function uniqueSortedDates(
  values: unknown,
  start: string,
  end: string,
): string[] | undefined {
  if (!Array.isArray(values) || values.length > PILOT_DURATION_DAYS) {
    return undefined;
  }
  const dates = values.filter(
    (value): value is string =>
      typeof value === "string" &&
      Boolean(parseDate(value)) &&
      inRange(value, start, end),
  );
  if (dates.length !== values.length || new Set(dates).size !== dates.length) {
    return undefined;
  }
  return dates.sort();
}

function emptyAggregate(): PilotAggregate {
  return {
    activeDates: [],
    poemPresentedDates: [],
    warningSuppressedDates: [],
    detailOpenedDates: [],
    notRelevantDates: [],
    replacementDates: [],
    favoriteAddedDates: [],
  };
}

function emptySessionAggregate(): PilotSessionAggregate {
  return {
    completedSessions: 0,
    uncleanExitSessions: 0,
    sessionOpen: false,
  };
}

function normalizeSessionAggregate(
  value: unknown,
): PilotSessionAggregate | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<PilotSessionAggregate>;
  if (
    !Number.isInteger(candidate.completedSessions) ||
    !Number.isInteger(candidate.uncleanExitSessions) ||
    candidate.completedSessions! < 0 ||
    candidate.completedSessions! > MAX_COMPLETED_SESSIONS ||
    candidate.uncleanExitSessions! < 0 ||
    candidate.uncleanExitSessions! > candidate.completedSessions! ||
    typeof candidate.sessionOpen !== "boolean"
  ) {
    return undefined;
  }
  return {
    completedSessions: candidate.completedSessions!,
    uncleanExitSessions: candidate.uncleanExitSessions!,
    sessionOpen: candidate.sessionOpen,
  };
}

function addDate(values: string[], localDate: string): string[] {
  return values.includes(localDate)
    ? values
    : [...values, localDate].sort();
}

export function createPilotState(startedOn: string): PilotState {
  if (!parseDate(startedOn)) {
    throw new Error("试点开始日期不合法");
  }
  return {
    schemaVersion: "1.1",
    consentVersion: PILOT_PLAN_VERSION,
    status: "active",
    startedOn,
    endsOn: addDays(startedOn, PILOT_DURATION_DAYS - 1),
    purgeOn: addDays(startedOn, PILOT_RETENTION_DAYS - 1),
    aggregate: emptyAggregate(),
    sessions: emptySessionAggregate(),
  };
}

export function normalizePilotState(
  value: unknown,
  today: string,
): PilotState | undefined {
  if (!value || typeof value !== "object" || !parseDate(today)) {
    return undefined;
  }
  const candidate = value as Partial<PilotState>;
  if (
    typeof candidate.startedOn !== "string" ||
    !parseDate(candidate.startedOn) ||
    typeof candidate.endsOn !== "string" ||
    typeof candidate.purgeOn !== "string"
  ) {
    return undefined;
  }
  if (
    candidate.schemaVersion !== "1.1" ||
    candidate.consentVersion !== PILOT_PLAN_VERSION ||
    (candidate.status !== "active" &&
      candidate.status !== "completed") ||
    candidate.endsOn !==
      addDays(candidate.startedOn, PILOT_DURATION_DAYS - 1) ||
    candidate.purgeOn !==
      addDays(candidate.startedOn, PILOT_RETENTION_DAYS - 1) ||
    today > candidate.purgeOn ||
    !candidate.aggregate ||
    typeof candidate.aggregate !== "object"
  ) {
    return undefined;
  }

  const aggregate = {} as PilotAggregate;
  for (const key of AGGREGATE_KEYS) {
    const dates = uniqueSortedDates(
      candidate.aggregate[key],
      candidate.startedOn,
      candidate.endsOn,
    );
    if (!dates) return undefined;
    aggregate[key] = dates;
  }
  const activeDates = new Set(aggregate.activeDates);
  for (const key of AGGREGATE_KEYS.slice(1)) {
    if (aggregate[key].some((date) => !activeDates.has(date))) {
      return undefined;
    }
  }
  const sessions = normalizeSessionAggregate(candidate.sessions);
  if (!sessions) return undefined;
  return {
    schemaVersion: "1.1",
    consentVersion: PILOT_PLAN_VERSION,
    status: today > candidate.endsOn ? "completed" : "active",
    startedOn: candidate.startedOn,
    endsOn: candidate.endsOn,
    purgeOn: candidate.purgeOn,
    aggregate,
    sessions,
  };
}

function settleOpenSession(
  sessions: PilotSessionAggregate,
  unclean: boolean,
): PilotSessionAggregate | undefined {
  if (!sessions.sessionOpen) return sessions;
  if (sessions.completedSessions >= MAX_COMPLETED_SESSIONS) {
    return undefined;
  }
  return {
    completedSessions: sessions.completedSessions + 1,
    uncleanExitSessions:
      sessions.uncleanExitSessions + (unclean ? 1 : 0),
    sessionOpen: false,
  };
}

export function openPilotSession(
  state: PilotState,
  localDate: string,
): PilotState | undefined {
  const normalized = normalizePilotState(state, localDate);
  if (!normalized) return undefined;
  const settled = settleOpenSession(normalized.sessions, true);
  if (!settled) return undefined;
  if (
    normalized.status === "completed" ||
    !inRange(localDate, normalized.startedOn, normalized.endsOn)
  ) {
    return { ...normalized, sessions: settled };
  }
  return {
    ...normalized,
    aggregate: {
      ...normalized.aggregate,
      activeDates: addDate(normalized.aggregate.activeDates, localDate),
    },
    sessions: { ...settled, sessionOpen: true },
  };
}

export function closePilotSession(
  state: PilotState,
  localDate: string,
): PilotState | undefined {
  const normalized = normalizePilotState(state, localDate);
  if (!normalized) return undefined;
  const sessions = settleOpenSession(normalized.sessions, false);
  return sessions ? { ...normalized, sessions } : undefined;
}

export function recordPilotEvent(
  state: PilotState,
  event: PilotEventType,
  localDate: string,
): PilotState | undefined {
  if (event === "app-opened") {
    return openPilotSession(state, localDate);
  }
  const normalized = normalizePilotState(state, localDate);
  if (!normalized) return undefined;
  if (
    normalized.status === "completed" ||
    !inRange(localDate, normalized.startedOn, normalized.endsOn)
  ) {
    return normalized;
  }

  const aggregate: PilotAggregate = {
    ...normalized.aggregate,
    activeDates: addDate(normalized.aggregate.activeDates, localDate),
  };
  const key = EVENT_KEY[event];
  aggregate[key] = addDate(normalized.aggregate[key], localDate);
  return { ...normalized, aggregate };
}

function intersectionCount(left: string[], right: string[]): number {
  const allowed = new Set(right);
  return left.filter((value) => allowed.has(value)).length;
}

function percent(numerator: number, denominator: number): number | null {
  return denominator === 0
    ? null
    : Math.round((numerator / denominator) * 10_000) / 100;
}

export function buildPilotSummary(input: {
  state: PilotState;
  appVersion: string;
  contentVersion: string;
  ruleVersion: string;
  generatedOn: string;
  autostartEnabled: boolean;
}): PilotSummary {
  const state = normalizePilotState(input.state, input.generatedOn);
  if (!state) {
    throw new Error("试点记录已过期或损坏，不能生成摘要");
  }
  const active = state.aggregate.activeDates;
  const suppressed = state.aggregate.warningSuppressedDates;
  const suppressedSet = new Set(suppressed);
  const eligible = active.filter((date) => !suppressedSet.has(date));
  const delivered = intersectionCount(
    state.aggregate.poemPresentedDates,
    eligible,
  );
  const details = intersectionCount(
    state.aggregate.detailOpenedDates,
    state.aggregate.poemPresentedDates,
  );
  const notRelevant = intersectionCount(
    state.aggregate.notRelevantDates,
    state.aggregate.poemPresentedDates,
  );
  const completedSessions = state.sessions.completedSessions;
  const sessionsWithoutUncleanExit =
    completedSessions - state.sessions.uncleanExitSessions;

  return {
    schemaVersion: "1.1",
    planVersion: PILOT_PLAN_VERSION,
    appVersion: input.appVersion,
    contentVersion: input.contentVersion,
    ruleVersion: input.ruleVersion,
    generatedOn: input.generatedOn,
    status: state.status,
    period: {
      startedOn: state.startedOn,
      endsOn: state.endsOn,
    },
    counts: {
      activeDays: active.length,
      eligibleDeliveryDays: eligible.length,
      successfulDeliveryDays: delivered,
      warningSuppressedDays: suppressed.length,
      detailOpenDays: details,
      notRelevantDays: notRelevant,
      replacementDays: state.aggregate.replacementDates.length,
      favoriteAddDays: state.aggregate.favoriteAddedDates.length,
      completedSessions,
      sessionsWithoutUncleanExit,
      uncleanExitSessions: state.sessions.uncleanExitSessions,
    },
    rates: {
      deliveryPercent: percent(delivered, eligible.length),
      detailOpenPercent: percent(details, delivered),
      notRelevantPercent: percent(notRelevant, delivered),
      crashFreeSessionPercent: percent(
        sessionsWithoutUncleanExit,
        completedSessions,
      ),
    },
    currentAutostartEnabled: input.autostartEnabled,
    privacy: {
      automaticUpload: false,
      containsIdentifier: false,
      containsCity: false,
      containsWorkId: false,
      containsRawEvents: false,
      containsSessionTimestamps: false,
      containsCrashDump: false,
    },
  };
}
