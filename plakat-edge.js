// Netlify Edge Function (Deno) – ruft OpenAI serverseitig auf.
// Wartezeit auf externe Aufrufe zaehlt NICHT ans Zeitlimit -> kein Timeout bei langsamer Bilderzeugung.
const MODELL = "gpt-image-1.5";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function bauePrompt(untertitel, gerichte, gruss) {
  return `Erzeuge ein hochformatiges Restaurant-Plakat im EXAKT gleichen Design wie das beigefügte Referenzbild.

UNVERÄNDERT übernehmen (identisch zum Referenzbild):
- Pergament-/Papier-Hintergrund in Creme, dünner grüner Zierrahmen mit verspielten Ecken
- Großer grüner Schrifttitel oben: "Wuchäend-Menü" (handschriftlicher Kalligrafie-Stil)
- Rotes, handgezeichnetes Herz oben rechts mit kleinen Strahlen
- Grüne, handschriftliche Schrift für alle Texte
- Runde Herz-Symbole als Aufzählungszeichen links vor jedem Gericht
- Zierliche Trennlinien (Pfeile + Herz) zwischen den Gerichten
- Deko unten links: grün-kariertes Küchentuch, Holz-Pfeffermühle, Knoblauch, Schälchen mit Pfefferkörnern, frische Kräuter
- Spitzen-Deckchen und rustikale Keramikschalen rechts

NUR DIESE INHALTE ändern:
- Untertitel unter dem Titel (zwei Zeilen, zentriert-links, grün):
${untertitel}

- Menü-Liste links (jedes Gericht mit grünem Herz-Bullet, in dieser Reihenfolge):
${gerichte.map((g, i) => `${i + 1}. ${g}`).join("\n")}

- Grussformel unten links (kleiner, kursiv, grün):
${gruss}

- Rechts appetitliche, fotorealistische Essensfotos in rustikalen Keramikschalen, die GENAU zu den oben genannten Gerichten passen (pro Gericht ein passendes Foto, schön von oben/schräg arrangiert wie im Referenzbild).

WICHTIG:
- Schreibe ALLE Texte exakt Zeichen für Zeichen wie oben angegeben, inklusive Schweizerdeutscher Schreibweise und Umlaute. Keine Wörter erfinden, weglassen oder verändern.
- Gleiches Hochformat (Seitenverhältnis) wie das Referenzbild.
- Sauberes, professionelles, druckfertiges Layout.`;
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Nur POST." }, 405);
  const key = Netlify.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "Server: OPENAI_API_KEY ist nicht gesetzt." });

  let body;
  try { body = await request.json(); } catch { return json({ error: "Ungültige Anfrage." }); }
  const untertitel = (body.untertitel || "").trim();
  const gruss = (body.gruss || "").trim();
  const gerichte = Array.isArray(body.gerichte) ? body.gerichte.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!gerichte.length) return json({ error: "Bitte mindestens ein Gericht angeben." });

  // Referenzbild von der eigenen Seite laden
  let refBlob;
  try {
    const origin = new URL(request.url).origin;
    const rr = await fetch(origin + "/vorlage.jpg");
    if (!rr.ok) throw new Error("HTTP " + rr.status);
    refBlob = await rr.blob();
  } catch (e) {
    return json({ error: "Vorlage konnte nicht geladen werden: " + e.message });
  }

  const form = new FormData();
  form.append("model", MODELL);
  form.append("prompt", bauePrompt(untertitel, gerichte, gruss));
  form.append("size", "1024x1536");
  form.append("quality", "medium");
  form.append("n", "1");
  form.append("image[]", refBlob, "vorlage.jpg");

  let r, j;
  try {
    r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    j = await r.json();
  } catch (e) {
    return json({ error: "Netzwerkfehler zum Bilddienst: " + e.message });
  }
  if (!r.ok) return json({ error: (j && j.error && j.error.message) || ("HTTP " + r.status) });
  const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
  if (!b64) return json({ error: "Kein Bild erhalten." });
  return json({ image: "data:image/png;base64," + b64 });
};
