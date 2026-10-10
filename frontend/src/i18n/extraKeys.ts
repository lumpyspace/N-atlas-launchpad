/**
 * Strings that reach t() as values rather than literals — labels kept in
 * shared utilities, backend messages and engine labels shown in the UI. Listed
 * here so tests/i18n.test.ts checks each language translates them.
 */
import { N_ } from ".";

export const EXTRA_KEYS = [
  // utils/testCases BAD_REASONS (rating reasons)
  N_("Wrong language"),
  N_("Made things up"),
  N_("Repeated itself"),
  N_("Too long"),
  N_("Shouldn't have answered"),
  N_("Something else"),
  // utils/testCases LANG_LABEL, utils/langDetect language names
  N_("Nigerian English"),
  N_("Nigerian Pidgin"),
  N_("Yoruba"),
  N_("Hausa"),
  N_("Igbo"),
  // Backend Design chat warnings (routes/design.ts)
  N_("N-ATLAS couldn't reply just now, so here's the next question."),
  N_("N-ATLAS couldn't translate the question just now, so here it is in English."),
  // Design brief fields the engine says are still open (design/interview.ts SLOT_LABEL)
  N_("What the app is"),
  N_("Who it's for"),
  N_("The problem it solves"),
  N_("Must-have features"),
  N_("Where people use it"),
  N_("Languages"),
  N_("Data it needs"),
  N_("What it must never do"),
  // Sectors
  N_("education"),
  N_("agriculture"),
  N_("finance"),
  N_("legal"),
  N_("customer-support"),
  N_("general"),
  // Security severities
  N_("low"),
  N_("medium"),
  N_("high"),
  N_("critical"),
  // Test results
  N_("PASS"),
  N_("FAIL"),
  N_("ERROR"),
];
