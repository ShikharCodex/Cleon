import { Router } from "express";
import { createStreamToken } from "../controllers/streamController.ts";

const router = Router();

router.post("/token", createStreamToken);

export default router;