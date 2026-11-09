import { Router } from "express";
import { apiKeyAuth } from "../middleware/apiKey.js";
import slotRoutes from "./slotRoutes.js";
import bookingRoutes from "./bookingRoutes.js";

const router = Router();

router.use(apiKeyAuth);
router.use(slotRoutes);
router.use(bookingRoutes);


export default router;