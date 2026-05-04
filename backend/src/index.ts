import express from "express";
import cors from "cors";
import "dotenv/config";

import * as Sentry from "@sentry/node";
import { clerkMiddleware } from "@clerk/express";
import { clerkWebhookHandler } from "./webhooks/clerk.ts";
import { getEnv } from "./lib/env.ts";
import meRouter from "./routes/meRouter.ts";
import productsRouter from "./routes/productRouter.ts";
import streamRouter from "./routes/streamRouter.ts";
import adminRouter from "./routes/adminRouter.ts";
import orderRouter from "./routes/orderRouter.ts";
import checkoutRouter from "./routes/checkoutRouter.ts";
import { polarWebhookHandler } from "./webhooks/polar.ts";

import fs from "node:fs";
import path from "node:path";
import job from "./lib/cron.ts";
import { sentryClerkUserMiddleware } from "./middlewares/sentryClerkUser.ts";

console.log("Starting server initialization...");
let env;
try {
  env = getEnv();
  console.log("Environment loaded successfully");
} catch (e) {
  console.error("Failed to load environment:", e);
  process.exit(1);
}

const app = express();

const rawJson = express.raw({ type: "application/json", limit: "1mb" });

app.post("/webhooks/clerk", rawJson, async (req, res) => {
  await clerkWebhookHandler(req, res);
});

app.post("/webhooks/polar", rawJson, async (req, res) => {
  await polarWebhookHandler(req, res);
});

app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());
app.use(sentryClerkUserMiddleware);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/me", meRouter);
app.use("/api/products", productsRouter);
app.use("/api/stream", streamRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/admin", adminRouter);
app.use("/api/orders", orderRouter);

const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  app.get("/{*any}", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    if (req.path.startsWith("/api") || req.path.startsWith("/webhooks")) {
      next();
      return;
    }

    res.sendFile(path.join(publicDir, "index.html"), (err) => {
      if (err) {
        next(err);
      }
    });
  });
}
//Sentry will be attached to the response object, so we need to set it up before any routes or middleware that might throw errors
Sentry.setupExpressErrorHandler(app);

app.use(
  (
    _err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const sentryId = (res as express.Response & { sentry?: string }).sentry;
    res.status(500).json({
      error: "Internal Server Error",
      ...(sentryId !== undefined && { sentryId }),
    });
  },
);

app.listen(env.PORT, () => {
  console.log(`Server is Running on PORT ${env.PORT}`);
  if (env.NODE_ENV === "production") {
    job.start();
  }
});
