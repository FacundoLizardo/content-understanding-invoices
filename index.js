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
function mapInvoiceFields(ar, minConfidence = 0.3) {
  const docs = ar?.documents ?? [];
  if (!docs.length) throw new Error("No se detectaron facturas");

  const money = (c) => c?.valueCurrency?.amount ?? null;
  const text  = (t) => t?.content ?? t?.valueString ?? null;

  return docs.map((doc, idx) => {
    const f = doc.fields ?? {};

    /* ───────── Items ───────── */
    const items = (f.Items?.valueArray ?? [])
      .filter((it) => (it.confidence ?? 1) >= minConfidence)
      .map((arrItem) => {
        const it = arrItem.valueObject ?? arrItem ?? {};
        return {
          page:        arrItem.boundingRegions?.[0]?.pageNumber ?? null,
          productCode: text(it.ProductCode),
          description: text(it.Description),
          quantity:    it.Quantity?.valueNumber ?? null,
          date:        it.Date?.valueDate ?? null,
          unit:        it.Unit?.valueNumber ?? null,
          unitPrice:   money(it.UnitPrice),
          tax:         money(it.Tax),
          amount:      money(it.Amount),
          rawContent:  arrItem.content
        };
      });

    /* ───────── Factura ─────── */
    return {
      invoiceIndex:       idx + 1,
      pages:              doc.boundingRegions?.map((b) => b.pageNumber) ?? [],
      /* --- Cabecera ────────────────────────────── */
      vendorName:         text(f.VendorName ?? null),
      vendorTaxId:        text(f.VendorTaxId ?? null),
      vendorAddress:      text(f.VendorAddressRecipient ?? null),
      customerName:       text(f.CustomerName ?? null),
      customerId:         text(f.CustomerId ?? null),
      customerTaxId:      text(f.CustomerTaxId ?? null),
      customerAddress:    text(f.CustomerAddress ?? null),
      /* --- Fechas ─────────────────────────────── */
      invoiceDate:        f.InvoiceDate?.valueDate ?? null,
      dueDate:            f.DueDate?.valueDate ?? null,
      /* --- Totales ────────────────────────────── */
      subtotal:           money(f.SubTotal ?? null),
      invoiceTotal:       money(f.InvoiceTotal ?? null),     
      totalTax:           money(f.TotalTax ?? null),
      previousBalance:    money(f.PreviousUnpaidBalance ?? null),
      amountDue:          money(f.AmountDue ?? null),
      currency:           text(f.TaxDetails[0].valueObject.Amount.valueCurrency.currencyCode ?? null),
      /* --- Ítems ──────────────────────────────── */
      items,
      /* --- Otros (opcional) --------------------- */
      invoicedNumber:     text(f.Invoiced ?? null),           
      taxDetails:         f.TaxDetails?.valueArray ?? []
    };
  });
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
