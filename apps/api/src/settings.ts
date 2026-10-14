export interface AppSettings {
  port: number;
  mode: "simulation";
  paymentGatewayMode: "simulation";
  mmbcLiveEnabled: false;
  databaseUrl: string | undefined;
  databaseSsl: boolean;
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): AppSettings {
  const mode = env.BEELKA_MODE ?? "simulation";
  const paymentGatewayMode = env.PAYMENT_GATEWAY_MODE ?? "simulation";
  const mmbcLiveEnabled = env.MMBC_LIVE_ENABLED === "true";

  if (mode !== "simulation") {
    throw new Error("Only BEELKA_MODE=simulation is allowed in Phase 1");
  }
  if (paymentGatewayMode !== "simulation") {
    throw new Error("Live payment gateway mode is disabled in Phase 1");
  }
  if (mmbcLiveEnabled) {
    throw new Error("MMBC live mutations are disabled in Phase 1");
  }

  const port = Number(env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const databaseSslValue = env.DATABASE_SSL ?? "false";
  if (!["true", "false"].includes(databaseSslValue)) {
    throw new Error("DATABASE_SSL must be true or false");
  }

  const databaseUrl = env.DATABASE_URL?.trim() || undefined;

  return {
    port,
    mode: "simulation",
    paymentGatewayMode: "simulation",
    mmbcLiveEnabled: false,
    databaseUrl,
    databaseSsl: databaseSslValue === "true"
  };
}
