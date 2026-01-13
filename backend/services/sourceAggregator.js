
/**
 * Clean raw text (remove extra spaces, line breaks)
 */
function cleanText(text = "") {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

/**
 * Fetch Wikipedia summary safely
 */
async function fetchWikipedia(entity) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      entity
    )}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();

    if (!data.extract) return null;

    return {
      source: "Wikipedia",
      url: data.content_urls?.desktop?.page,
      content: cleanText(data.extract)
    };
  } catch (err) {
    console.error("Wikipedia fetch failed:", err.message);
    return null;
  }
}

/**
 * Aggregate all sources for AI summary
 */
export async function aggregateSources({
  query,
  profile = [],
  records = [],
  auxiliary = []
}) {
  const sources = [];

  // 1️⃣ Wikipedia
  const wiki = await fetchWikipedia(query);
  if (wiki) sources.push(wiki);

  // 2️⃣ SQLite PROFILE
  profile.forEach(p => {
    sources.push({
      source: "Internal Profile",
      url: "internal://sqlite",
      content: cleanText(p.text)
    });
  });

  // 3️⃣ MongoDB RECORDS
  records.forEach(r => {
    sources.push({
      source: "Internal Records",
      url: "internal://mongodb",
      content: cleanText(r.text)
    });
  });

  // 4️⃣ JSON AUXILIARY
  auxiliary.forEach(a => {
    sources.push({
      source: "Internal Resources",
      url: a.url || "internal://json",
      content: cleanText(a.text || a.content)
    });
  });

  return sources;
}
