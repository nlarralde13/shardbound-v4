// /static/js/data/classLoader.js
export async function loadClassCatalog(classId) {
  const url = `/static/catalog/classes/${classId}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Class catalog not found: ${classId}`);
  return res.json();
}

export function skillsAvailableAtLevel(catalog, level = 1) {
  const skills = catalog.skills || {};
  return Object.entries(skills)
    .filter(([_, s]) => (s.unlock?.level ?? 1) <= level)
    .map(([id, s]) => ({ id, ...s }));
}