import { FA3Invoice, FA3Party, FA3TaxCategory } from "../../dist/index.js";

const seller = FA3Party.polishCompany({
  nip: "1111111111",
  name: "Sprzedawca Sp. z o.o.",
  address: { line1: "Prosta 1", line2: "00-001 Warszawa" },
});

const buyer = FA3Party.polishCompany({
  nip: "2222222222",
  name: "Nabywca S.A.",
  address: "Jasna 2",
});

export function buildSampleFa3FakturaInput(overrides = {}) {
  const invoice = FA3Invoice.basic("FV/001/2026")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-05-16")
    .createdAt("2026-05-16T10:11:12Z")
    .issuePlace("Warszawa")
    .saleDate("2026-05-15")
    .addServiceLine("Usluga konsultingowa", {
      quantity: "2",
      unitNetPrice: "500",
      tax: FA3TaxCategory.standard23(),
    })
    .addGoodsLine("Towar eksportowy", {
      quantity: "1",
      unitNetPrice: "100",
      tax: FA3TaxCategory.zeroExport(),
      unit: "szt.",
    });

  if (typeof overrides.apply === "function") {
    overrides.apply(invoice);
  }

  return invoice.build().toFakturaInput();
}

export function buildMultiRateFa3FakturaInput() {
  return buildSampleFa3FakturaInput({
    apply: (invoice) => {
      invoice
        .addServiceLine("Usluga 8%", {
          quantity: "1",
          unitNetPrice: "46",
          tax: FA3TaxCategory.reduced8(),
        })
        .addGoodsLine("Towar 0% kraj", {
          quantity: "1",
          unitNetPrice: "20",
          tax: FA3TaxCategory.zeroDomestic(),
        });
    },
  });
}
