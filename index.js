import express from "express";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();                // AZURE_KEY y AZURE_ENDPOINT en .env
const upload = multer();        // guarda el archivo solo en memoria
const app = express();
const port = process.env.PORT || 3000;

async function analyzeInvoice(buffer) {
  const analyzeUrl =
    `${process.env.AZURE_ENDPOINT}` +
    `/documentIntelligence/documentModels/prebuilt-invoice:analyze` +
    `?api-version=2024-11-30`;

  // 1️⃣ envías el PDF binario
  const first = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "Ocp-Apim-Subscription-Key": process.env.AZURE_KEY,
    },
    body: buffer,
  });
  if (!first.ok) {
    const msg = await first.text();
    throw new Error(`Inicio falló: ${first.status} – ${msg}`);
  }
  const op = first.headers.get("operation-location");
  if (!op) throw new Error("Falta header operation-location");

  // 2️⃣ se hace polling hasta que Azure termine
  while (true) {
    const poll = await fetch(op, {
      headers: { "Ocp-Apim-Subscription-Key": process.env.AZURE_KEY },
    });
    const data = await poll.json();
    if (data.status === "succeeded") return data.analyzeResult;
    if (data.status === "failed") throw new Error(JSON.stringify(data));
    await new Promise((r) => setTimeout(r, 2000));        // espera 2 s
  }
}

/* POST /invoice
   body multipart/form-data  field "file": <PDF>           */
app.post("/invoice", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Falta archivo" });
    const result = await analyzeInvoice(req.file.buffer);
    res.json(result);                                     // 3️⃣ respuesta final
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () =>
  console.log(`Servidor corriendo en http://localhost:${port}`),
);
