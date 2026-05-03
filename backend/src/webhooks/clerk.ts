import type { Request, Response } from "express";
import { getEnv } from "../lib/env.ts";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { parseRole } from "../helpers/roles.ts";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { eq } from "drizzle-orm/sql/expressions/conditions";
export async function clerkWebhookHandler(req: Request, res: Response) {
  console.log("Clerk webhook received:", req.method, req.url);

  const env = getEnv();

  try {
    if (!env.CLERK_WEBHOOK_SECRET) {
      console.error("CLERK_WEBHOOK_SECRET not configured");
      res.status(503).send("Clerk Webhook Secret is not configured");
      return;
    }

    const payload =
      req.body instanceof Buffer ? req.body.toString("utf8") : String(req.body);
    console.log("Webhook payload length:", payload.length);

    const request = new Request("http://localhost/webhooks/clerk", {
      method: "POST",
      headers: new Headers(req.headers as HeadersInit),
      body: payload,
    });
    const evt = await verifyWebhook(request, {
      signingSecret: env.CLERK_WEBHOOK_SECRET,
    });

    console.log("Verified webhook event:", evt.type, evt.data.id);

    if (evt.type === "user.created" || evt.type === "user.updated") {
      const u = evt.data;

      const email =
        u.email_addresses.find((e) => e.id === u.primary_email_address_id)
          ?.email_address ?? u.email_addresses[0]?.email_address;

      const displayName =
        [u.first_name, u.last_name].filter(Boolean).join(" ") ||
        u.username ||
        null;

      const role = parseRole(u.public_metadata?.role);

      console.log("Inserting user:", { clerkUserId: u.id, email, displayName, role });

      try {
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

        console.log("User inserted/updated successfully");
      } catch (dbError) {
        console.error("Database insert error:", dbError);
        throw dbError;
      }
    }

    if (evt.type === "user.deleted") {
      const id = evt.data.id;
      if (id) {
        console.log("Deleting user:", id);
        try {
          await db.delete(users).where(eq(users.clerkUserId, id));
          console.log("User deleted successfully");
        } catch (dbError) {
          console.error("Database delete error:", dbError);
          throw dbError;
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Clerk Webhook Error:", error);
    res.status(400).send("Invalid webhook payload");
  }
}
