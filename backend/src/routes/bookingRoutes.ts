import { Router } from "express";
import {
  createBooking,
  getBookings,
  getBookingById,
  cancelBooking
} from "../controllers/bookingController.js";

const router = Router();

router.post("/bookings", createBooking);
router.get("/bookings", getBookings);
router.get("/bookings/:id", getBookingById);
router.delete("/bookings/:id", cancelBooking);

export default router;