import type { EmailRecord, RfqRecord } from "../types";

export type EmailProvider = {
  sendRfq(rfq: RfqRecord): Promise<EmailRecord[]>;
};
