/**
 * Phonetic / keyboard confusion costs (substitution, cheaper than 1).
 * Keys are the two letters concatenated (symmetric lookup is done by caller).
 */
export const VOWEL_PAIR_COST: Readonly<Record<string, number>> = {
  оө: 0.35,
  уү: 0.35,
  аэ: 0.5,
  ыи: 0.5,
  иы: 0.5,
  ий: 0.5,
  ео: 0.6,
  эе: 0.4,
  яа: 0.5,
  юу: 0.5,
  ёо: 0.5,
  дт: 0.5,
  гх: 0.6,
  бп: 0.6,
  зс: 0.6,
  шс: 0.7,
  чц: 0.6,
};
