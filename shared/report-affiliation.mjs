// Keep institution names intact; normalize separators and legacy bilingual pairs.
export function normalizeAffiliation(value = '') {
  return value.split(/[/／·、，,;；]+/u).flatMap(part => {
    const trimmed = part.trim();
    const bilingual = trimmed.match(/^(.*?)\s*[（(]([^()（）]+)[）)]\s*$/u);
    return bilingual && /\p{Script=Han}/u.test(bilingual[1]) && /[A-Za-z]/.test(bilingual[2]) && !/\p{Script=Han}/u.test(bilingual[2])
      ? [bilingual[1].trim(), bilingual[2].trim()] : [trimmed];
  }).filter(Boolean).join('/');
}

export function reportAffiliation(talk) {
  return normalizeAffiliation(typeof talk.affiliation === 'string'
    ? talk.affiliation : [talk.affiliationZh, talk.affiliationEn].filter(Boolean).join('/'));
}
