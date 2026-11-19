/** Lowercase and strip Vietnamese diacritics, for accent-insensitive search. */
export const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
