const db = require("../db");
const BookingsService = require("../../service/bookings.service");
const mongoose = require("mongoose");
const { Booking, Vehicle, Service } = require("../../model");
const DomainError = require("../../errors/domainError");
const config = require("../../service/config");
const ServiceOrderService = require("../../service/service_order.service");

// disable notification service calls during testing
jest.mock("../../service/notification.service");
jest.mock("../../service/service_order.service");

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.closeDatabase();
});

afterEach(async () => {
  await db.clearDatabase();
});

function createDateFromTimeSlot(timeSlot) {
  const { day, month, year, hours, minutes } = timeSlot;
  return new Date(year, month - 1, day, hours, minutes);
}

describe("BookingsService", () => {
  describe("createBooking method", () => {

    const CUSTOMER_CLERK_ID = "user_2w2a6PJC4T4BfXDsg72AQsLNEyU";
    const OTHER_CUSTOMER_CLERK_ID = "user_3x3b7QKD5U5CgeYth83BRtMOFzV";

    const VEHICLE_IDS = [
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439012"),
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439015"),
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439016"),
    ]

    const SERVICE_IDS = [
      [
        new mongoose.Types.ObjectId("507f1f77bcf86cd799439013"),
      ],
      [
        new mongoose.Types.ObjectId("507f1f77bcf86cd799439015"),
      ],
      [
        new mongoose.Types.ObjectId("507f1f77bcf86cd799439016"),
        new mongoose.Types.ObjectId("507f1f77bcf86cd799439014"),
      ]
    ]

    const TIME_SLOTS = [
      {year: 2027, month: 9, day: 25, hours: 10, minutes: 0},
      {year: 2027, month: 9, day: 25, hours: 14, minutes: 0}
    ]

    beforeEach(async () => {
      await Vehicle.collection.insertMany([
        {
          _id: VEHICLE_IDS[0],
          OwnerClerkId: CUSTOMER_CLERK_ID,
        },
        {
          _id: VEHICLE_IDS[2],
          OwnerClerkId: OTHER_CUSTOMER_CLERK_ID
        },
      ]);

      await Service.collection.insertMany([
        {
          _id: SERVICE_IDS[0][0],
        },
        {
          _id: SERVICE_IDS[2][0],
        },
        {
          _id: SERVICE_IDS[2][1],
        },
      ]);
    });

    test("UC0001_checkVehicleNotExists", async () => {
      const promise = BookingsService.createBooking(
        CUSTOMER_CLERK_ID,
        VEHICLE_IDS[1],
        SERVICE_IDS[0].map((s) => s.toString()),
        TIME_SLOTS[0]
      );

      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("VEHICLE_NOT_FOUND");
    });

    test("UC0002_checkVehicleAlreadyBooked", async () => {
      await Booking.collection.insertOne({
        vehicle_id: VEHICLE_IDS[0],
        status: "booked",
      });

      const promise = BookingsService.createBooking(
        CUSTOMER_CLERK_ID,
        VEHICLE_IDS[0],
        SERVICE_IDS[0].map((s) => s.toString()),
        TIME_SLOTS[0]
      );

      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("BOOKINGS_VEHICLE_ALREADY_BOOKED");
    });

    test("UC0003_validateServices", async () => {
      const promise = BookingsService.createBooking(
        CUSTOMER_CLERK_ID,
        VEHICLE_IDS[0],
        SERVICE_IDS[1].map((s) => s.toString()),
        TIME_SLOTS[0]
      );

      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("SERVICE_NOT_FOUND");
    });

    test("UC0004_rejectFullyBookedTimeslot", async () => {
      const MAX_BOOKINGS_PER_SLOT = config.MAX_BOOKINGS_PER_SLOT;
      const TIMESLOT_INTERVAL_MILLISECONDS =
        config.TIMESLOT_INTERVAL_MILLISECONDS;
      const timeslot = TIME_SLOTS[1];

      for (let i = 0; i < MAX_BOOKINGS_PER_SLOT; i++) {
        const start = createDateFromTimeSlot(timeslot);
        const end = new Date(start.getTime() + TIMESLOT_INTERVAL_MILLISECONDS);

        await Booking.collection.insertOne({
          slot_start_time: start,
          slot_end_time: end,
          status: "booked",
        });
      }

      const promise = BookingsService.createBooking(
        CUSTOMER_CLERK_ID,
        VEHICLE_IDS[0],
        SERVICE_IDS[0].map((s) => s.toString()),
        timeslot
      );

      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("BOOKINGS_INVALID_TIME_SLOT");
    });

    test("UC0005_rejectBookingByNonOwner", async () => {
      const promise = BookingsService.createBooking(
        CUSTOMER_CLERK_ID,
        VEHICLE_IDS[2],
        SERVICE_IDS[0].map((s) => s.toString()),
        TIME_SLOTS[0]
      );

      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("VEHICLE_NOT_BELONG_TO_USER");
    });

    test("UC0006_successfulBookingCreationWithOneService", async () => {
      const promise = BookingsService.createBooking(
        CUSTOMER_CLERK_ID,
        VEHICLE_IDS[0],
        SERVICE_IDS[0].map((s) => s.toString()),
        TIME_SLOTS[0]
      );

      await expect(promise).resolves.toBeDefined();
      const booking = await promise;
      expect(booking.service_ids.length).toBe(1);
      expect(booking.service_ids[0].toString()).toBe(
        SERVICE_IDS[0][0].toString()
      );
      expect(booking.vehicle_id.toString()).toBe(VEHICLE_IDS[0].toString());
      expect(booking.status).toBe("booked");
    });

    test("UC0007_successfulBookingCreationWithMultipleServices", async () => {
      const promise = BookingsService.createBooking(
        CUSTOMER_CLERK_ID,
        VEHICLE_IDS[0],
        SERVICE_IDS[2].map((s) => s.toString()),
        TIME_SLOTS[0]
      );

      await expect(promise).resolves.toBeDefined();
      const booking = await promise;
      expect(booking.service_ids.length).toBe(2);
      expect(booking.service_ids.map((id) => id.toString()).sort()).toEqual(
        SERVICE_IDS[2].map((s) => s.toString()).sort()
      );
      expect(booking.vehicle_id.toString()).toBe(VEHICLE_IDS[0].toString());
      expect(booking.status).toBe("booked");
    });
  });

  describe("checkInBooking method", () => {
    const STAFF_ID = "user_2w2a6PJC4T4BfXDsg72AQsLNEyU";
    const BOOKING_IDS = [
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439091"),
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439092"),
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439093"),
    ];

    test("UC0001_bookingNotFound", async () => {
      const promise = BookingsService.checkInBooking(STAFF_ID, BOOKING_IDS[0]);

      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("BOOKINGS_NOT_FOUND");
    });

    test("UC0002_bookingNotInBookedState", async () => {
      await Booking.collection.insertOne({
        _id: BOOKING_IDS[1],
        status: "cancelled",
      });

      const promise = BookingsService.checkInBooking(STAFF_ID, BOOKING_IDS[1]);

      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("BOOKINGS_STATE_INVALID");
    });

    test("UC0003_successfulCheckIn", async () => {
      await Booking.collection.insertOne({
        _id: BOOKING_IDS[2],
        customer_clerk_id: "user_2w2a6PJC4T4BfXDsg72AQsLNEyU",
        vehicle_id: "507f1f77bcf86cd799439012",
        service_ids: ["507f1f77bcf86cd799439013"],
        slot_start_time: createDateFromTimeSlot({year: 2027, month: 9, day: 25, hours: 10, minutes: 0}),
        slot_end_time: createDateFromTimeSlot({year: 2027, month: 9, day: 25, hours: 11, minutes: 0}),
        status: "booked",
      });

      const ServiceOrderService = require("../../service/service_order.service");
      ServiceOrderService.createServiceOrderFromBooking = jest
        .fn()
        .mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      const booking = await BookingsService.checkInBooking(
        STAFF_ID,
        BOOKING_IDS[2]
      );

      expect(booking).toBeDefined();
      expect(booking.status).toBe("checked_in");
      expect(
        ServiceOrderService.createServiceOrderFromBooking
      ).toHaveBeenCalledWith(STAFF_ID, BOOKING_IDS[2]);
    });
  });

  describe("getTimeSlotsForDMY method", () => {
    test("UC0001_pastDate", async () => {
      const timeSlots = await BookingsService.getTimeSlotsForDMY(1, 1, 1990);

      expect(timeSlots).toBeDefined();
      expect(Array.isArray(timeSlots)).toBe(true);
      expect(timeSlots.every((slot) => slot.isAvailable === false)).toBe(true);
    });

    test("UC0002_futureDate_noBookings", async () => {
      const timeSlots = await BookingsService.getTimeSlotsForDMY(20, 10, 2099);

      expect(timeSlots).toBeDefined();
      expect(Array.isArray(timeSlots)).toBe(true);
      expect(timeSlots.every((slot) => slot.isAvailable === true)).toBe(true);
    });

    test("UC0003_futureDate_specificSlotMaxedOut", async () => {
      const MAX_BOOKINGS_PER_SLOT = config.MAX_BOOKINGS_PER_SLOT;
      const TIMESLOT_INTERVAL_MILLISECONDS =
        config.TIMESLOT_INTERVAL_MILLISECONDS;

      // Create max bookings for 10:00 slot
      const targetSlot = {
        year: 2099,
        month: 10,
        day: 21,
        hours: 10,
        minutes: 0,
      };
      const slotStart = createDateFromTimeSlot(targetSlot);
      const slotEnd = new Date(
        slotStart.getTime() + TIMESLOT_INTERVAL_MILLISECONDS
      );

      for (let i = 0; i < MAX_BOOKINGS_PER_SLOT; i++) {
        await Booking.collection.insertOne({
          slot_start_time: slotStart,
          slot_end_time: slotEnd,
          status: "booked",
        });
      }

      const timeSlots = await BookingsService.getTimeSlotsForDMY(21, 10, 2099);

      expect(timeSlots).toBeDefined();
      expect(Array.isArray(timeSlots)).toBe(true);

      // Find the 10:00 slot
      const tenAMSlot = timeSlots.find(
        (slot) => slot.hours === 10 && slot.minutes === 0
      );
      expect(tenAMSlot).toBeDefined();
      expect(tenAMSlot.isAvailable).toBe(false);

      // Check that other slots are still available
      const otherSlots = timeSlots.filter(
        (slot) => !(slot.hours === 10 && slot.minutes === 0)
      );
      expect(otherSlots.every((slot) => slot.isAvailable === true)).toBe(true);
    });

    test("UC0004_futureDate_allSlotsMaxedOut", async () => {
      const MAX_BOOKINGS_PER_SLOT = config.MAX_BOOKINGS_PER_SLOT;
      const TIMESLOT_INTERVAL_MILLISECONDS =
        config.TIMESLOT_INTERVAL_MILLISECONDS;
      const BUSINESS_START_HOUR = config.BUSINESS_START_HOUR;
      const BUSINESS_END_HOUR = config.BUSINESS_END_HOUR;
      const TIMESLOT_INTERVAL_MINUTES = config.TIMESLOT_INTERVAL_MINUTES;

      // Create max bookings for all time slots on this day
      for (let hour = BUSINESS_START_HOUR; hour <= BUSINESS_END_HOUR; hour++) {
        for (
          let minute = 0;
          minute < 60;
          minute += TIMESLOT_INTERVAL_MINUTES
        ) {
          const slot = {
            year: 2099,
            month: 10,
            day: 22,
            hours: hour,
            minutes: minute,
          };
          const slotStart = createDateFromTimeSlot(slot);
          const slotEnd = new Date(
            slotStart.getTime() + TIMESLOT_INTERVAL_MILLISECONDS
          );

          for (let i = 0; i < MAX_BOOKINGS_PER_SLOT; i++) {
            await Booking.collection.insertOne({
              slot_start_time: slotStart,
              slot_end_time: slotEnd,
              status: "booked",
            });
          }
        }
      }

      const timeSlots = await BookingsService.getTimeSlotsForDMY(22, 10, 2099);

      expect(timeSlots).toBeDefined();
      expect(Array.isArray(timeSlots)).toBe(true);
      expect(timeSlots.every((slot) => slot.isAvailable === false)).toBe(true);
    });
  });

  describe("cancelBooking method", () => {
    const CANCEL_BOOKING_IDS = [
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439101"),
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439102"),
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439103"),
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439104"),
    ];

    test("UC0001_bookingNotFound", async () => {
      const promise = BookingsService.cancelBooking(CANCEL_BOOKING_IDS[0]);

      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("BOOKINGS_NOT_FOUND");
    });

    test("UC0002_bookingAlreadyCancelled", async () => {
      await Booking.collection.insertOne({
        _id: CANCEL_BOOKING_IDS[1],
        status: "cancelled",
      });

      const promise = BookingsService.cancelBooking(CANCEL_BOOKING_IDS[1]);

      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("BOOKINGS_STATE_INVALID");
    });

    test("UC0003_bookingCompleted", async () => {
      await Booking.collection.insertOne({
        _id: CANCEL_BOOKING_IDS[2],
        status: "completed",
      });

      const promise = BookingsService.cancelBooking(CANCEL_BOOKING_IDS[2]);
      await expect(promise).rejects.toThrow(DomainError);
      const error = await promise.catch((e) => e);
      expect(error.errorCode).toBe("BOOKINGS_STATE_INVALID");
    });

    test("UC0004_successfulCancellation", async () => {
      //successful case needs full booking data
      await Booking.collection.insertOne({
        _id: CANCEL_BOOKING_IDS[3],
        customer_clerk_id: "user_2w2a6PJC4T4BfXDsg72AQsLNEyU",
        vehicle_id: "507f1f77bcf86cd799439012",
        service_ids: ["507f1f77bcf86cd799439013"],
        slot_start_time: createDateFromTimeSlot({year: 2027, month: 9, day: 25, hours: 10, minutes: 0}),
        slot_end_time: createDateFromTimeSlot({year: 2027, month: 9, day: 25, hours: 11, minutes: 0}),
        status: "booked",
      });

      const booking = await BookingsService.cancelBooking(
        CANCEL_BOOKING_IDS[3]
      );

      expect(booking).toBeDefined();
      expect(booking.status).toBe("cancelled");
    });
  });
});

