// Netlify Edge Function (Deno) – erzeugt NUR den dekorativen Hintergrund (ohne Text).
// Der Menütext wird anschliessend im Browser als echter Text darübergelegt (garantiert korrekte Umlaute).
const MODELL = "gpt-image-1.5";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function bauePrompt(gerichte) {
  return `Erzeuge NUR eine leere, dekorative Plakat-Vorlage im rustikalen Landhaus-Stil — OHNE jeglichen Text, OHNE Buchstaben, OHNE Zahlen, OHNE Schriftzeichen irgendwo im Bild.

Bildaufbau (Hochformat 2:3):
- Cremefarbener Pergament-/Papierhintergrund mit dezenter Textur.
- Dünner dunkelgrüner Zierrahmen mit verspielten Ecken rundum.
- Oben rechts ein rotes, handgezeichnetes Herz mit kleinen Strahlen (nur Zeichnung, kein Text).
- Rechte Bildhälfte: appetitliche, fotorealistische Essensfotos in rustikalen hellen Keramikschalen, vertikal untereinander angeordnet, passend zu diesen Gerichten (nur die Speisen zeigen, KEINE Beschriftung): ${gerichte.join("; ")}.
- Unten links, klein in der Ecke: Deko aus grün-kariertem Küchentuch, Holz-Pfeffermühle, Knoblauch, kleinem Schälchen mit Pfefferkörnern und frischen Kräutern.

GANZ WICHTIG:
- Die gesamte LINKE Bildhälfte (mindestens 55% der Breite) bleibt komplett FREI — nur leeres, sauberes Pergament, keine Motive und keine Deko dort (außer der kleinen Ecke ganz unten links), damit dort später Text platziert werden kann.
- ABSOLUT KEIN Text, keine Buchstaben, keine Wörter, keine Zahlen, keine Logos irgendwo im Bild.
- Fotorealistisch, hochwertig, druckfertig, Hochformat.`;
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Nur POST." }, 405);
  const key = Netlify.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "Server: OPENAI_API_KEY ist nicht gesetzt." });

  let body;
  try { body = await request.json(); } catch { return json({ error: "Ungültige Anfrage." }); }
  const gerichte = Array.isArray(body.gerichte) ? body.gerichte.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!gerichte.length) return json({ error: "Bitte mindestens ein Gericht angeben." });

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
  form.append("prompt", bauePrompt(gerichte));
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
