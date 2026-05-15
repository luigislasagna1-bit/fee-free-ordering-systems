/**
 * Translated day-of-week name lookup. Used by the customer info page,
 * admin hours editor, promotions/service-fees day-of-week pickers.
 *
 * Pass either `useTranslations("info")` for "Sunday" or
 * `useTranslations("info")` and read `shortDays.0..6` for "Sun".
 */
type Translator = (key: string) => string;

export function dayName(dow: number, t: Translator): string {
  const idx = Math.max(0, Math.min(6, Math.floor(dow)));
  return t(`days.${idx}`);
}

export function shortDayName(dow: number, t: Translator): string {
  const idx = Math.max(0, Math.min(6, Math.floor(dow)));
  return t(`shortDays.${idx}`);
}
