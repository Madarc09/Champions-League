const PUCKPEDIA_BASE = "https://puckpedia.com/player";
const CACHE_SECONDS = 60 * 60 * 24;

function slugifyPlayerName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[.'’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseCapHit(html) {
  const decoded = decodeHtml(html);

  const descriptionMatch = decoded.match(/contract with (?:an? )?cap hit of \$([0-9,]+) per season/i);
  if (descriptionMatch) return Number(descriptionMatch[1].replace(/,/g, ""));

  const currentContractIndex = decoded.search(/Current Contract/i);
  const relevant = currentContractIndex >= 0
    ? decoded.slice(currentContractIndex, currentContractIndex + 16000)
    : decoded.slice(0, 30000);

  const capHitMatch = relevant.match(/Cap Hit[\s\S]{0,2500}?\$([0-9]{3,}(?:,[0-9]{3})*)/i);
  if (capHitMatch) return Number(capHitMatch[1].replace(/,/g, ""));

  return null;
}

export async function lookupPuckPediaSalary(player) {
  const slug = slugifyPlayerName(player.name);
  if (!slug) return null;

  const response = await fetch(`${PUCKPEDIA_BASE}/${slug}`, {
    next: { revalidate: CACHE_SECONDS },
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Champions-League-Fantasy-Hockey/1.0"
    }
  });

  if (!response.ok) return null;
  const html = await response.text();
  const capHit = parseCapHit(html);

  if (!Number.isFinite(capHit) || capHit <= 0 || capHit > 30_000_000) return null;

  return {
    playerId: Number(player.playerId),
    name: String(player.name),
    capHit,
    source: "PuckPedia",
    updatedAt: new Date().toISOString()
  };
}
