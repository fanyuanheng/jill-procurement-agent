import dashboardMetricsJson from "../data/dashboard-metrics.json";
import messyQuoteEmailsJson from "../data/messy-quote-emails.json";
import rfqsJson from "../data/rfqs.json";
import vendorsJson from "../data/vendors.json";
import type { DashboardMetrics, EmailMessage, Rfq, Vendor } from "./types";

export const dashboardMetrics = dashboardMetricsJson as DashboardMetrics;
export const seedVendors = vendorsJson as Vendor[];
export const seedRfqs = rfqsJson as Rfq[];
export const messyQuoteEmails = messyQuoteEmailsJson as EmailMessage[];

export function buildSeedActivity() {
  return [];
}
