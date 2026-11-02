// Which subject a course is about, read from its title (the backend has no
// subject field). The icon is a MaterialCommunityIcons name. First match
// wins, so put the more specific words first.
const SUBJECTS = [
  { icon: "calculator-variant", label: "Math", words: ["math", "algebra", "geometry", "calculus", "statistic", "arithmetic", "trigonometry"] },
  { icon: "atom", label: "Physics", words: ["physic", "mechanic", "electric", "optic"] },
  { icon: "flask", label: "Chemistry", words: ["chemi"] },
  { icon: "dna", label: "Biology", words: ["biolog", "anatomy", "genetic", "ecology", "botany"] },
  { icon: "laptop", label: "Computing", words: ["computer", "program", "coding", "python", "javascript", "software", "informatic", "ict", "web"] },
  { icon: "bank", label: "Business", words: ["econom", "business", "account", "finance", "commerce", "marketing"] },
  { icon: "scale-balance", label: "Civics", words: ["civic", "ethic", "law", "government", "politic"] },
  { icon: "history", label: "History", words: ["history"] },
  { icon: "earth", label: "Geography", words: ["geograph", "environment", "geology", "earth"] },
  { icon: "palette", label: "Arts", words: ["art", "design", "drawing", "music"] },
  { icon: "translate", label: "Languages", words: ["amharic", "oromo", "tigrin", "french", "arabic", "language"] },
  // English, including CEFR level names like "A2 Advanced" or "B1".
  { icon: "book-open-variant", label: "English", words: ["english", "grammar", "literature", "reading", "writing", "vocab", "conditional"] },
];

const LEVEL = /^[abc][12]\b/;
const FALLBACK = { key: "general", label: "Other", icon: "book-open-variant" };

export function subjectFor(title) {
  const text = String(title ?? "").toLowerCase().trim();
  if (LEVEL.test(text)) return { key: "book-open-variant", label: "English", icon: "book-open-variant" };
  // Short words ("art", "law", "ict") must be whole words, so "smart" or
  // "predict" don't match; longer ones may be stems ("physic" → physics).
  const has = (word) => (word.length <= 3 ? new RegExp(`\\b${word}\\b`).test(text) : text.includes(word));
  const match = SUBJECTS.find((subject) => subject.words.some(has));
  return match ? { key: match.icon, label: match.label, icon: match.icon } : FALLBACK;
}
