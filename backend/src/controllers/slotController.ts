import { Request, Response } from "express";
import { prisma } from "../config/prisma.js";

export const resetSlots = async (req: Request, res: Response) => {
  try {
    const { slots } = req.body;

    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: "Slots must be an array" });
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.booking.deleteMany();
      await tx.slot.deleteMany();

      await tx.slot.createMany({
        data: slots.map((slot: any) => ({
          id: slot.id,
          provider: slot.provider,
          start: new Date(slot.start),
          end: new Date(slot.end),
        })),
      });
    });

    return res.status(200).json({ message: "Slots reset successfully" });
  } catch (error) {
    console.error("Reset error:", error);
    return res.status(500).json({ error: "Failed to reset slots" });
  }
};

export const getSlots = async (req: Request, res: Response) => {
  try {
    const provider = req.query.provider;

    const slots = await prisma.slot.findMany({
      where: typeof provider === "string" ? { provider } : {},
      orderBy: {
        start: "asc",
      },
      include: {
        bookings: {
          where: {
            status: "confirmed",
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    const result = slots.map(({ bookings, ...slot }: any) => ({
      ...slot,
      available: bookings.length === 0,
    }));

    return res.status(200).json({ slots: result });
  } catch (error) {
    console.error("Get slots error:", error);
    return res.status(500).json({ error: "Failed to retrieve slots" });
  }
};