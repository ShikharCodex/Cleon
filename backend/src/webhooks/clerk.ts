import type { Request, Response } from "express";
import { getEnv } from "../lib/env.ts";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { parseRole } from "../helpers/roles.ts";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { eq } from "drizzle-orm/sql/expressions/conditions";
export async function clerkWebhookHandler(req: Request, res: Response) {
  const env = getEnv();

  try {
    if (!env.CLERK_WEBHOOK_SECRET) {
      res.status(503).send("Clerk Webhook Secret is not configured");
      return;
    }

    const payload =
      req.body instanceof Buffer ? req.body.toString("utf8") : String(req.body);
    const request = new Request("http://localhost/webhooks/clerk", {
      method: "POST",
      headers: new Headers(req.headers as HeadersInit),
      body: payload,
    });
    const evt = await verifyWebhook(request, {
      signingSecret: env.CLERK_WEBHOOK_SECRET,
    });

    if (evt.type === "user.created" || evt.type === "user.updated") {
      const u = evt.data;

      const email =
        u.email_addresses.find((e) => e.id === u.primary_email_address_id)
          ?.email_address ?? u.email_addresses[0]?.email_address;

      const displayName =
        [u.first_name, u.last_name].filter(Boolean).join(" ") ||
        u.username ||
        null;
      0;

      const role = parseRole(u.public_metadata?.role);

      await db
        .insert(users)
        .values({
          clerkUserId: u.id,
          email,
          displayName,
          role,
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: {
            email,
            displayName,
            role,
            updatedAt: new Date(),
          },
        });
    }

    if (evt.type === "user.deleted") {
      const id = evt.data.id;
      if (id) {
        await db.delete(users).where(eq(users.clerkUserId, id));
      }
    }
    res.json({ ok: true });
  } catch (error) {
    console.log("Clerk Webhook Error", error);
    res.status(400).send("Invalid webhook payload");
  }
}
