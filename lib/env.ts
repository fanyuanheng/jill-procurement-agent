export type DemoMode = "simulation" | "live";

export function getDemoMode(): DemoMode {
  if (process.env.DEMO_MODE === "simulation") return "simulation";
  if (process.env.DEMO_MODE === "live" || process.env.AGENTMAIL_API_KEY) return "live";
  return "simulation";
}

export function isSimulation(): boolean {
  return getDemoMode() === "simulation";
}
