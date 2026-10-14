export interface AppSettings {
  port: number;
  mode: "simulation";
  paymentGatewayMode: "simulation";
  mmbcLiveEnabled: false;
  demoOrdersEnabled: boolean;
  databaseUrl: string | undefined;
  databaseSsl: boolean;
  googleIdentityPlatformProjectId: string | undefined;
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): AppSettings {
  const mode = env.BEELKA_MODE ?? "simulation";
  const paymentGatewayMode = env.PAYMENT_GATEWAY_MODE ?? "simulation";
  const mmbcLiveEnabled = env.MMBC_LIVE_ENABLED === "true";
  const nodeEnv = env.NODE_ENV ?? "development";
  const demoFlag = env.BEELKA_DEMO_ORDERS_ENABLED;

  if (mode !== "simulation") {
    throw new Error("Only BEELKA_MODE=simulation is allowed until live-provider gates pass");
  }
  if (paymentGatewayMode !== "simulation") {
    throw new Error("Live payment gateway mode is disabled");
  }
  if (mmbcLiveEnabled) {
    throw new Error("MMBC live mutations are disabled");
  }
  if (demoFlag !== undefined && demoFlag !== "true" && demoFlag !== "false") {
    throw new Error("BEELKA_DEMO_ORDERS_ENABLED must be true or false");
  }

  const demoOrdersEnabled = demoFlag === undefined ? nodeEnv !== "production" : demoFlag === "true";
  if (nodeEnv === "production" && demoOrdersEnabled) {
    throw new Error("Unauthenticated demo order endpoints cannot be enabled in production");
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
  const googleIdentityPlatformProjectId =
    env.GOOGLE_CLOUD_PROJECT?.trim() || env.FIREBASE_PROJECT_ID?.trim() || undefined;

  return {
    port,
    mode: "simulation",
    paymentGatewayMode: "simulation",
    mmbcLiveEnabled: false,
    demoOrdersEnabled,
    databaseUrl,
    databaseSsl: databaseSslValue === "true",
    googleIdentityPlatformProjectId
  };
}
