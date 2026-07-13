// Netlify Edge Function (Deno) – ruft OpenAI serverseitig auf.
// Wartezeit auf externe Aufrufe zaehlt NICHT ans Zeitlimit -> kein Timeout bei langsamer Bilderzeugung.
const MODELL = "gpt-image-1.5";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function bauePrompt(untertitel, gerichte, gruss) {
  return `Erzeuge NUR den grafischen HINTERGRUND für ein hochformatiges Restaurant-Plakat, im selben Stil wie das beigefügte Referenzbild. Der Text wird später digital eingesetzt – DU DARFST KEINEN TEXT ZEICHNEN.

Beibehalten wie im Referenzbild:
- Pergament-/Papier-Hintergrund in Creme, dünner grüner Zierrahmen mit verspielten Ecken.
- Rotes, handgezeichnetes Herz mit kleinen Strahlen oben rechts.
- Deko unten links: grün-kariertes Küchentuch, Holz-Pfeffermühle, Knoblauch, Schälchen mit Pfefferkörnern, frische Kräuter.

Rechte Bildhälfte: fotorealistische, appetitliche Essensfotos in rustikalen Keramikschalen – jeweils passend zu diesen Gerichten:
${gerichte.map((g, i) => `${i + 1}. ${g}`).join("\n")}
Die Schalen von oben nach unten anordnen. ALLE Schalen/Teller MÜSSEN etwa GLEICH GROSS sein (einheitliche, mittlere Größe) und gleichmäßig verteilt – KEINE Schale darf deutlich größer sein als die anderen. Die Fotos bleiben in der rechten Bildhälfte.

STRENG VERBOTEN (bitte unbedingt einhalten):
- KEINE Buchstaben, Wörter, Zahlen oder Schrift – nirgends im Bild.
- KEINE Trennlinien, Striche, Pfeile, horizontalen Linien oder Zierlinien.
- KEINE Herz-Aufzählungszeichen und keine Menü-Symbole.
- Die LINKE Bildhälfte bleibt eine leere, ruhige Pergamentfläche (nur Rahmen; unten links die Deko) – dort kommt später der Text hin, daher unbedingt freihalten.

Gleiches Hochformat (Seitenverhältnis) wie das Referenzbild. Sauberer, druckfertiger Hintergrund ohne jeden Text.`;
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
