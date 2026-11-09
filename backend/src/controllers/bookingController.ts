
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

const bookingSchema = z.object({
  slot_id: z.string({ error: "Slot ID is required" }).trim().min(1, "Slot ID is required"),
  name: z.string({ error: "Name is required" }).trim().min(1, "Name is required"),
  email: z.string({ error: "Email is required" }).trim().min(1, "Email is required").email("Please provide a valid email address"),
});

const checkBookingRateLimit = async (email: string) => {
  return prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw(
    Prisma.sql`
      WITH lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))
      )
      SELECT 1 AS locked FROM lock
    `
  );

    const now = new Date();
    const windowStart = new Date(now.getTime() - 60_000);

    const attempts = await tx.bookingAttempt.findMany({
      where: {
        email,
        attemptedAt: {
          gte: windowStart,
        },
      },
      orderBy: {
        attemptedAt: "asc",
      },
      take: 5,
    });

    if (attempts.length >= 5) {
      const retryAfter = Math.max(
        1,
        Math.ceil(
          (attempts[0].attemptedAt.getTime() + 60_000 - now.getTime()) / 1000
        )
      );

      return { limited: true, retryAfter };
    }

    await tx.bookingAttempt.create({
      data: { email },
    });

    return { limited: false, retryAfter: 0 };
  });
};

export const createBooking = async (req: Request, res: Response) => {
  try {
    const validation = bookingSchema.safeParse(req.body);

    if (!validation.success) {
      const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

      if (rawEmail) {
        const rateLimit = await checkBookingRateLimit(rawEmail);

        if (rateLimit.limited) {
          res.setHeader("Retry-After", String(rateLimit.retryAfter));

          return res.status(429).json({
            error: "Too many attempts for this email",
          });
        }
      }

      const firstError = validation.error.issues[0];

      return res.status(400).json({
        error: firstError.message,
      });
    }

    const { slot_id, name, email } = validation.data;
    const idempotencyKey = req.header("Idempotency-Key");

    const requestBody = {
      slot_id,
      name,
      email,
    };

    // Check whether this idempotency key has already been used.
    if (idempotencyKey) {
      const existingRecord = await prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });

      if (existingRecord) {
        const savedBody = existingRecord.requestBody as typeof requestBody;

        if (
          savedBody.slot_id !== slot_id ||
          savedBody.name !== name ||
          savedBody.email !== email
        ) {
          const rateLimit = await checkBookingRateLimit(email.toLowerCase());

          if (rateLimit.limited) {
            res.setHeader("Retry-After", String(rateLimit.retryAfter));

            return res.status(429).json({
              error: "Too many attempts for this email",
            });
          }

          return res.status(422).json({
            error: "Idempotency key reused with different request body",
          });
        }

        return res
          .status(existingRecord.responseStatus)
          .json(existingRecord.responseBody);
      }
    }

    // Count this new booking attempt before checking the slot.
    const rateLimit = await checkBookingRateLimit(email.toLowerCase());

    if (rateLimit.limited) {
      res.setHeader("Retry-After", String(rateLimit.retryAfter));

      return res.status(429).json({
        error: "Too many attempts for this email",
      });
    }

    const result = await prisma.$transaction(async (tx: any) => {
      // Check again inside the transaction to handle simultaneous requests.
      if (idempotencyKey) {
        const existingRecord = await tx.idempotencyRecord.findUnique({
          where: { key: idempotencyKey },
        });

        if (existingRecord) {
          const savedBody = existingRecord.requestBody as typeof requestBody;

          if (
            savedBody.slot_id !== slot_id ||
            savedBody.name !== name ||
            savedBody.email !== email
          ) {
            return {
              status: 422,
              body: {
                error: "Idempotency key reused with different request body",
              },
            };
          }

          return {
            status: existingRecord.responseStatus,
            body: existingRecord.responseBody,
          };
        }
      }

      const saveResponse = async (status: number, body: object) => {
        if (idempotencyKey) {
          await tx.idempotencyRecord.create({
            data: {
              key: idempotencyKey,
              requestBody,
              responseStatus: status,
              responseBody: body,
            },
          });
        }

        return { status, body };
      };

      const slot = await tx.slot.findUnique({
        where: { id: slot_id },
      });

      if (!slot) {
        return saveResponse(404, { error: "Slot not found" });
      }

      if (slot.start <= new Date()) {
        return saveResponse(400, { error: "Slot has already started" });
      }

      const existingBooking = await tx.booking.findFirst({
        where: {
          slotId: slot_id,
          status: "confirmed",
        },
      });

      if (existingBooking) {
        return saveResponse(409, {
          error: "Slot is already booked",
        });
      }

      const booking = await tx.booking.create({
        data: {
          slotId: slot_id,
          name,
          email: email.toLowerCase(),
        },
      });

      const responseBody = {
        id: booking.id,
        slot_id: booking.slotId,
        name: booking.name,
        email: booking.email,
        status: booking.status,
        created_at: booking.createdAt.toISOString(),
      };

      return saveResponse(201, responseBody);
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Create booking error:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const idempotencyKey = req.header("Idempotency-Key");

      if (idempotencyKey) {
        const existingRecord = await prisma.idempotencyRecord.findUnique({
          where: { key: idempotencyKey },
        });

        if (existingRecord) {
          const { slot_id, name, email } = bookingSchema.parse(req.body);
          const savedBody = existingRecord.requestBody as {
            slot_id: string;
            name: string;
            email: string;
          };

          if (savedBody.slot_id !== slot_id || savedBody.name !== name || savedBody.email !== email) {
            return res.status(422).json({
              error: "Idempotency key reused with different request body",
            });
          }

          return res.status(existingRecord.responseStatus).json(existingRecord.responseBody);
        }
      }

      return res.status(409).json({
        error: "Slot is already booked",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

export const getBookings = async (req: Request, res: Response) => {
  try {
    const email = req.query.email;
    const limitQuery = req.query.limit;
    const cursor = req.query.cursor;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "Email is required" });
    }

    const limit = limitQuery === undefined ? 10 : Number(limitQuery);

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({
        error: "Limit must be between 1 and 50",
      });
    }

    if (cursor !== undefined && typeof cursor !== "string") {
      return res.status(400).json({ error: "Invalid cursor" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const bookings = await prisma.booking.findMany({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      take: limit + 1,
      ...(cursor ? {
        cursor: { id: cursor },
        skip: 1,
      } : {}),
    });

    const hasMore = bookings.length > limit;
    const result = bookings.slice(0, limit);

    const nextCursor = hasMore
      ? result[result.length - 1].id
      : null;

    return res.status(200).json({
      bookings: result.map((booking) => ({
        id: booking.id,
        slot_id: booking.slotId,
        name: booking.name,
        email: booking.email,
        status: booking.status,
        created_at: booking.createdAt.toISOString(),
      })),
      next_cursor: nextCursor,
    });
  } catch (error) {
    console.error("Get bookings error:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.status(400).json({ error: "Invalid cursor" });
    }

    return res.status(500).json({
      error: "Failed to retrieve bookings",
    });
  }
};

export const getBookingById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    if (typeof id !== "string") {
        return res.status(400).json({ error: "Invalid booking ID" });
    }

    const booking = await prisma.booking.findUnique({
        where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    return res.status(200).json({
      id: booking.id,
      slot_id: booking.slotId,
      name: booking.name,
      email: booking.email,
      status: booking.status,
      created_at: booking.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Get booking error:", error);

    return res.status(500).json({
      error: "Failed to retrieve booking",
    });
  }
};

export const cancelBooking = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    if (typeof id !== "string") {
      return res.status(400).json({ error: "Invalid booking ID" });
    }

    const result = await prisma.booking.updateMany({
      where: {
        id,
        status: "confirmed",
      },
      data: {
        status: "cancelled",
      },
    });

    if (result.count === 0) {
      const booking = await prisma.booking.findUnique({
        where: { id },
      });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      return res.status(409).json({
        error: "Booking is already cancelled",
      });
    }

    const booking = await prisma.booking.findUnique({ where: { id }});

    return res.status(200).json({
        id: booking!.id,
        slot_id: booking!.slotId,
        name: booking!.name,
        email: booking!.email,
        status: booking!.status,
        created_at: booking!.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Cancel booking error:", error);

    return res.status(500).json({
      error: "Failed to cancel booking",
    });
  }
};
