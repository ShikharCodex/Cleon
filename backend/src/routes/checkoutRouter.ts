import { Router } from "express";
import { createCheckout } from "../controllers/checkoutController.ts";

const router = Router();

router.post("/", createCheckout);

export default router;