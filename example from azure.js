/*
  This code sample shows Prebuilt Invoice operations with the Azure AI Document Intelligence client library. 

  To learn more, please visit the documentation - Quickstart: Document Intelligence (formerly Form Recognizer) SDKs
  https://learn.microsoft.com/azure/ai-services/document-intelligence/quickstarts/get-started-sdks-rest-api?pivots=programming-language-javascript
*/

const DocumentIntelligence = require("@azure-rest/ai-document-intelligence").default,
{ getLongRunningPoller, isUnexpected } = require("@azure-rest/ai-document-intelligence");

/*
  Remember to remove the key from your code when you're done, and never post it publicly. For production, use
  secure methods to store and access your credentials. For more information, see 
  https://docs.microsoft.com/en-us/azure/cognitive-services/cognitive-services-security?tabs=command-line%2Ccsharp#environment-variables-and-application-configuration
*/
const key = "AZURE_DOCUMENT_INTELLIGENCE_KEY";
const endpoint = "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT";

// sample document
const invoiceUrl = "https://raw.githubusercontent.com/Azure-Samples/cognitive-services-REST-api-samples/master/curl/form-recognizer/sample-invoice.pdf";

async function main() {

    const client = DocumentIntelligence(endpoint, {key:key});
    const initialResponse = await client
        .path("/documentModels/{modelId}:analyze", "prebuilt-invoice")
        .post({
        contentType: "application/json",
        body: {
            urlSource: invoiceUrl
        },
        });

        if (isUnexpected(initialResponse)) {
        throw initialResponse.body.error;
        }

    const poller = getLongRunningPoller(client, initialResponse);
    const analyzeResult = (await poller.pollUntilDone()).body.analyzeResult;

    const documents = analyzeResult?.documents;
    const result = documents && documents[0];

    if (result) {
        const invoice = result.fields;
        console.log("Vendor Name:", invoice.VendorName?.valueString);
        console.log("Customer Name:", invoice.CustomerName?.valueString);
        console.log("Invoice Date:", invoice.InvoiceDate?.valueDate);
        console.log("Due Date:", invoice.DueDate?.valueDate);

        console.log("Items:");
        const items = invoice.Items?.valueArray ?? [];
        for (const { valueObject: item } of items) {
            console.log(item);
            console.log("-", item.ProductCode?.content ?? "<no product code>");
            console.log("  Description:", item.Description?.valueString);
            console.log("  Quantity:", item.Quantity?.valueNumber);
            console.log("  Date:", item.Date?.valueDate);
            console.log("  Unit:", item.Unit?.valueNumber);
            console.log("  Unit Price:", item.UnitPrice?.valueCurrency.amount);
            console.log("  Tax:", item.Tax?.valueCurrency.amount);
            console.log("  Amount:", item.Amount?.valueCurrency.amount);
        }

        console.log("Subtotal:", invoice.SubTotal?.valueCurrency.amount);
        console.log("Previous Unpaid Balance:", invoice.PreviousUnpaidBalance?.valueCurrency.amount);
        console.log("Tax:", invoice.TotalTax?.valueCurrency.amount);
        console.log("Amount Due:", invoice.AmountDue?.valueCurrency.amount);
    } else {
        throw new Error("Expected at least one receipt in the result.");
    }
}

main().catch((error) => {
    console.error("An error occurred:", error);
    process.exit(1);
});