import fs from "node:fs";
import path from "node:path";
import { FA3BatchDraft, FA3Invoice } from "./builder";

export class FA3Template {
  static sampleBatch(): FA3BatchDraft {
    const draft = FA3Invoice.basic("FV/SAMPLE/1")
      .issueDate("2026-01-15")
      .seller({
        name: "Sprzedawca Sp. z o.o.",
        taxId: "1234567890",
        addressLine1: "ul. Prosta 1, 00-001 Warszawa",
      })
      .buyer({
        name: "Nabywca Sp. z o.o.",
        taxId: "1111111111",
        addressLine1: "ul. Testowa 2, 00-002 Warszawa",
      })
      .addLine({
        description: "Usługa",
        quantity: 1,
        unit: "szt",
        unitNetPrice: 100,
        vatRate: 23,
      })
      .build();
    return new FA3BatchDraft([draft]);
  }

  static createJson(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    const batch = FA3Template.sampleBatch();
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, batch.toJson(), "utf8");
    return resolved;
  }

  static create_xlsx(): never {
    throw new Error(
      "Szablon XLSX nie jest jeszcze dostępny w TypeScript SDK. Użyj FA3Template.createJson(...).",
    );
  }
}
