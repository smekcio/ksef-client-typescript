import { KsefValidationError } from "../errors/errors";
import { InvoiceXmlInput } from "../xml/invoice";
import { parseUpoXml, UpoPotwierdzenie } from "../xml/upo";
import {
  OnlineInvoiceSendOptions,
  OnlineSessionOpenOptions,
  OnlineSessionWorkflow,
} from "./onlineSessionWorkflow";
import { WaitForUpoOptions } from "./upo";

export type OfflineInvoiceMode = "offline24" | "offline" | "awaryjny";

export interface OfflineProcedureInstructions {
  mode: OfflineInvoiceMode;
  responsibility: string;
  sendDeadline: string;
  legalBasis: string;
  operationalSteps: string[];
}

export interface OfflineInvoiceSendOptions extends OnlineSessionOpenOptions {
  invoice: InvoiceXmlInput;
  waitForUpo?: boolean;
  waitForUpoOptions?: WaitForUpoOptions;
}

export interface OfflineTechnicalCorrectionOptions extends OfflineInvoiceSendOptions {
  hashOfCorrectedInvoice: string;
}

export interface OfflineInvoiceSubmissionResult {
  sessionReferenceNumber: string;
  invoiceReferenceNumber: string;
  upoXml: string | null;
  upo: UpoPotwierdzenie | null;
}

const OFFLINE_PROCEDURES: Record<OfflineInvoiceMode, OfflineProcedureInstructions> = {
  offline24: {
    mode: "offline24",
    responsibility: "klient",
    sendDeadline: "do nastepnego dnia roboczego po dacie wystawienia",
    legalBasis: "art. 106nda ustawy o VAT (projekt KSeF 2.0)",
    operationalSteps: [
      "Wystaw fakture zgodna z FA(3) i ustaw offlineMode=true przy wysylce.",
      "Wygeneruj QR-I i QR-II dla wizualizacji przekazywanej nabywcy.",
      "Monitoruj komunikaty o awarii KSeF; awaria przesuwa termin doslania.",
      "Po odzyskaniu dostepnosci doslij fakture do KSeF w wymaganym terminie.",
    ],
  },
  offline: {
    mode: "offline",
    responsibility: "system KSeF",
    sendDeadline: "do nastepnego dnia roboczego po zakonczeniu niedostepnosci",
    legalBasis: "art. 106nh ustawy o VAT (od 1 II 2026)",
    operationalSteps: [
      "Wystaw fakture w okresie ogloszonej niedostepnosci KSeF.",
      "Wyslij dokument do KSeF z offlineMode=true po zakonczeniu niedostepnosci.",
      "Jesli ogloszono awarie, licz termin od zakonczenia ostatniej awarii (max 7 dni roboczych).",
      "Zachowaj UPO i numer KSeF jako dowod terminowego doslania.",
    ],
  },
  awaryjny: {
    mode: "awaryjny",
    responsibility: "system KSeF",
    sendDeadline:
      "do 7 dni roboczych od zakonczenia awarii (z resetem licznika przy kolejnej awarii)",
    legalBasis: "art. 106nf ustawy o VAT (od 1 II 2026)",
    operationalSteps: [
      "Wystaw fakture w trybie awaryjnym zgodnie z komunikatem MF/BIP.",
      "Po zakonczeniu awarii przeslij fakture do KSeF z offlineMode=true.",
      "Jesli pojawi sie kolejny komunikat o awarii, licznik 7 dni roboczych startuje od nowa.",
      "W przypadku awarii calkowitej stosuj zasady wystawiania poza KSeF (bez obowiazku doslania).",
    ],
  },
};

export class OfflineInvoiceWorkflow {
  private readonly onlineWorkflow: OnlineSessionWorkflow;

  constructor(onlineWorkflow: OnlineSessionWorkflow) {
    this.onlineWorkflow = onlineWorkflow;
  }

  async sendOfflineInvoice(
    options: OfflineInvoiceSendOptions,
  ): Promise<OfflineInvoiceSubmissionResult> {
    return await this.sendOffline(options);
  }

  async sendOfflineTechnicalCorrection(
    options: OfflineTechnicalCorrectionOptions,
  ): Promise<OfflineInvoiceSubmissionResult> {
    const hash = options.hashOfCorrectedInvoice.trim();
    if (!hash) {
      throw new KsefValidationError(
        "hashOfCorrectedInvoice is required for offline technical correction.",
      );
    }
    return await this.sendOffline(options, hash);
  }

  getProcedureInstructions(mode: OfflineInvoiceMode): OfflineProcedureInstructions {
    const instructions = OFFLINE_PROCEDURES[mode];
    return {
      ...instructions,
      operationalSteps: [...instructions.operationalSteps],
    };
  }

  listProcedureInstructions(): OfflineProcedureInstructions[] {
    return (Object.keys(OFFLINE_PROCEDURES) as OfflineInvoiceMode[]).map((mode) =>
      this.getProcedureInstructions(mode),
    );
  }

  private async sendOffline(
    options: OfflineInvoiceSendOptions,
    hashOfCorrectedInvoice?: string,
  ): Promise<OfflineInvoiceSubmissionResult> {
    const session = await this.onlineWorkflow.open({
      formCode: options.formCode,
      ...(options.publicCertificateBase64Der && {
        publicCertificateBase64Der: options.publicCertificateBase64Der,
      }),
      ...(options.upoV43 !== undefined && { upoV43: options.upoV43 }),
    });

    let closed = false;
    try {
      const sendOptions: OnlineInvoiceSendOptions = {
        invoice: options.invoice,
        offlineMode: true,
        ...(hashOfCorrectedInvoice && { hashOfCorrectedInvoice }),
      };
      const sendResponse = await session.sendInvoice(sendOptions);
      await session.close();
      closed = true;

      let upoXml: string | null = null;
      let upo: UpoPotwierdzenie | null = null;
      if (options.waitForUpo !== false) {
        upoXml = await session.waitForUpo(options.waitForUpoOptions);
        upo = upoXml ? parseUpoXml(upoXml) : null;
      }

      return {
        sessionReferenceNumber: session.referenceNumber,
        invoiceReferenceNumber: sendResponse.referenceNumber,
        upoXml,
        upo,
      };
    } catch (error) {
      if (!closed) {
        await this.closeSilently(session);
      }
      throw error;
    }
  }

  private async closeSilently(session: { close: () => Promise<void> }): Promise<void> {
    try {
      await session.close();
    } catch {
      // ignore close errors to preserve original exception
    }
  }
}
