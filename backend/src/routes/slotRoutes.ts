import { Router } from "express";
import { resetSlots, getSlots } from "../controllers/slotController.js";

const router = Router();

router.post("/reset", resetSlots);
router.get("/slots", getSlots);

export default router;