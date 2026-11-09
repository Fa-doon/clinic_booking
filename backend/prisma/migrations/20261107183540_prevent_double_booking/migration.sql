CREATE UNIQUE INDEX "Booking_one_confirmed_per_slot"
ON "Booking" ("slotId")
WHERE status = 'confirmed';