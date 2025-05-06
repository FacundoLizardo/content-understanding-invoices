import express from "express";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();                                   // AZURE_ENDPOINT y AZURE_KEY en .env

if (!process.env.AZURE_ENDPOINT || !process.env.AZURE_KEY) {
  console.error("Config faltante: define AZURE_ENDPOINT y AZURE_KEY en .env");
  process.exit(1);
}

const upload = multer();                           // archivo en memoria
const app = express();
const port = process.env.PORT || 3000;

/* ─────────────────── Llama al modelo prebuilt‑invoice ─────────────────── */
async function analyzeInvoice(buffer) {
  const url =
    `${process.env.AZURE_ENDPOINT}` +
    `/documentIntelligence/documentModels/prebuilt-invoice:analyze` +
    `?api-version=2024-11-30`;

  const first = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "Ocp-Apim-Subscription-Key": process.env.AZURE_KEY,
    },
    body: buffer,
  });
  if (!first.ok) throw new Error(await first.text());

  const op = first.headers.get("operation-location");
  if (!op) throw new Error("Falta operation-location");

  while (true) {
    const poll = await fetch(op, {
      headers: { "Ocp-Apim-Subscription-Key": process.env.AZURE_KEY },
    });
    const data = await poll.json();
    if (data.status === "succeeded") return data.analyzeResult;
    if (data.status === "failed") throw new Error(JSON.stringify(data));
    await new Promise((r) => setTimeout(r, 2000)); // espera 2 s
  }
}

/* ─────────────────── Limpia los campos del resultado ─────────────────── */
function mapInvoiceFields(ar) {
  const doc = ar?.documents?.[0];
  if (!doc) throw new Error("Sin documento reconocido");
  const f = doc.fields;
  const money = (c) => c?.valueCurrency?.amount ?? null;

  const items = (f.Items?.valueArray ?? []).map(({ valueObject: it }) => ({
    productCode: it.ProductCode?.content ?? null,
    description: it.Description?.valueString ?? null,
    quantity:    it.Quantity?.valueNumber ?? null,
    date:        it.Date?.valueDate ?? null,
    unit:        it.Unit?.valueNumber ?? null,
    unitPrice:   money(it.UnitPrice),
    tax:         money(it.Tax),
    amount:      money(it.Amount),
  }));

  return {
    vendorName:       f.VendorName?.valueString ?? null,
    customerName:     f.CustomerName?.valueString ?? null,
    invoiceDate:      f.InvoiceDate?.valueDate ?? null,
    dueDate:          f.DueDate?.valueDate ?? null,
    subtotal:         money(f.SubTotal),
    previousBalance:  money(f.PreviousUnpaidBalance),
    tax:              money(f.TotalTax),
    amountDue:        money(f.AmountDue),
    items,
  };
}

/* ──────────────────────── Endpoint /invoice ──────────────────────────── */
app.post("/invoice", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Falta archivo PDF" });
    const raw = await analyzeInvoice(req.file.buffer);
    res.json(mapInvoiceFields(raw));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(port, () => {
  console.log(`API lista en http://localhost:${port}`);
});
