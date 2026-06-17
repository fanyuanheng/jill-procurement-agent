import type { EmailProvider } from "./provider";

export const mockEmailProvider: EmailProvider = {
  async sendRfq(rfq) {
    return rfq.suppliers.map((supplier) => ({
      id: `mock-send-${rfq.id}-${supplier.vendor.id}`,
      at: new Date().toISOString(),
      direction: "outbound",
      provider: "mock",
      vendorId: supplier.vendor.id,
      to: supplier.vendor.email,
      subject: rfq.draft.title,
      body: `${rfq.draft.scope}\n\n${rfq.draft.technicalSpecs}`,
      status: "sent"
    }));
  }
};
