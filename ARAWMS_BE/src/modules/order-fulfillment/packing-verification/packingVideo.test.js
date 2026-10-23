import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import PackingSession from "../../../models/PackingSession.js";
import PackingVideo from "../../../models/PackingVideo.js";
import SalesOrder from "../../../models/SalesOrder.model.js";
import {
  syncPackingVideo,
  uploadPackingVideo,
} from "./packingVideo.service.js";

const sessionId = "507f1f77bcf86cd799439011";
const recordingId = "recording_12345678";
const packing = (video) => ({
  _id: sessionId,
  orderKey: "DEMO-TEST",
  sourceType: "DEMO",
  state: "SCANNING",
  items: [],
  scannedUnits: [],
  video,
});

const withStubs = async (stubs, work) => {
  const originals = stubs.map(([object, key, replacement]) => {
    const original = object[key];
    object[key] = replacement;
    return [object, key, original];
  });
  const originalEnv = {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  };
  Object.assign(process.env, {
    CLOUDINARY_CLOUD_NAME: "test",
    CLOUDINARY_API_KEY: "key",
    CLOUDINARY_API_SECRET: "secret",
  });
  try {
    await work();
  } finally {
    for (const [object, key, original] of originals) object[key] = original;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("retry cùng recordingId đã lưu trả thành công mà không upload lại", async () => {
  let resumed = false;
  await withStubs(
    [
      [
        PackingSession,
        "findById",
        async () =>
          packing({
            publicId: "packing/test/recording",
            recordingId,
          }),
      ],
      [PackingVideo, "findOne", async () => ({ recordingId, sessionId })],
      [PackingVideo, "updateOne", async () => ({ matchedCount: 1 })],
      [
        cloudinary.uploader,
        "upload_chunked_stream",
        () => {
          throw new Error("duplicate upload");
        },
      ],
    ],
    async () => {
      const result = await uploadPackingVideo({
        sessionId,
        recordingId,
        mimeType: "video/webm",
        durationMs: 1000,
        input: {
          resume: () => {
            resumed = true;
          },
        },
      });
      assert.equal(result.status, "COMPLETED");
      assert.equal(resumed, true);
    },
  );
});

test("sync links an existing Cloudinary video URL to its sales order", async () => {
  const url =
    "https://res.cloudinary.com/test/video/authenticated/packing/test.webm";
  const realPacking = {
    ...packing({ publicId: "packing/test/recording", recordingId }),
    sourceType: "REAL",
    orderId: "507f1f77bcf86cd799439012",
  };
  const staged = {
    recordingId,
    sessionId,
    cloudinaryPublicId: realPacking.video.publicId,
    cloudinaryUrl: url,
  };
  const linked = [];
  await withStubs(
    [
      [PackingSession, "findById", async () => realPacking],
      [PackingVideo, "findOne", async () => staged],
      [PackingVideo, "updateOne", async () => ({ matchedCount: 1 })],
      [
        SalesOrder,
        "updateOne",
        async (filter, update) => {
          linked.push({ filter, update });
          return { matchedCount: 1 };
        },
      ],
    ],
    async () => {
      const result = await syncPackingVideo({ sessionId, recordingId });
      assert.equal(result.status, "COMPLETED");
      assert.equal(linked[0].filter._id, realPacking.orderId);
      assert.equal(
        linked[0].update.$set["warehouseFulfillment.packagingVideoUrl"],
        url,
      );
      assert.equal(linked[1].update.$set.status, "PACKED");
    },
  );
});

test("first sync stores the Cloudinary URL on the matching sales order", async () => {
  const url = "https://res.cloudinary.com/test/video/authenticated/packing/new.webm";
  const orderId = "507f1f77bcf86cd799439012";
  const current = { ...packing(), sourceType: "REAL", orderId,
    orderVersion: new Date("2026-01-01T00:00:00Z"), save: async () => {} };
  const staged = { recordingId, sessionId, cloudinaryPublicId: "packing/test/new",
    cloudinaryAssetId: "asset-1", cloudinaryUrl: url, mimeType: "video/webm",
    fileSize: 100, durationMs: 1000, uploadedAt: new Date() };
  let savedOrder;
  await withStubs([
    [PackingSession, "findById", () => ({
      then: (resolve) => resolve(current), session: async () => current,
    })],
    [PackingSession, "findOneAndUpdate", async () => ({ ...current, video: {
      recordingId, publicId: staged.cloudinaryPublicId, url,
    } })],
    [PackingVideo, "findOne", async () => staged],
    [PackingVideo, "updateOne", async () => ({ matchedCount: 1 })],
    [SalesOrder, "findOneAndUpdate", async (filter, update) => {
      savedOrder = { filter, update };
      return { updatedAt: new Date("2026-01-01T00:00:01Z") };
    }],
    [mongoose, "startSession", async () => ({
      withTransaction: async (work) => work(), endSession: async () => {},
    })],
  ], async () => {
    const result = await syncPackingVideo({ sessionId, recordingId });
    assert.equal(result.status, "COMPLETED");
    assert.equal(savedOrder.filter._id, orderId);
    assert.equal(savedOrder.update.$set["warehouseFulfillment.packagingVideoUrl"], url);
    assert.equal(savedOrder.update.$set.status, "PACKED");
  });
});

test("sync trả VIDEO_NOT_UPLOADED khi Cloudinary chưa có file", async () => {
  await withStubs(
    [
      [PackingSession, "findById", async () => packing()],
      [PackingVideo, "findOne", async () => null],
      [
        cloudinary.api,
        "resource",
        async () => {
          throw { error: { http_code: 404 } };
        },
      ],
    ],
    async () => {
      await assert.rejects(
        syncPackingVideo({ sessionId, recordingId }),
        (error) => error.code === "VIDEO_NOT_UPLOADED",
      );
    },
  );
});

test("Cloudinary đã nhận nhưng giao dịch Mongo lỗi thì giữ SYNC_PENDING", async () => {
  const staged = {
    recordingId,
    sessionId,
    cloudinaryPublicId: `packing/${sessionId}/${recordingId}`,
  };
  await withStubs(
    [
      [PackingSession, "findById", async () => packing()],
      [PackingVideo, "findOne", async () => staged],
      [
        mongoose,
        "startSession",
        async () => ({
          withTransaction: async () => {
            throw new Error("Mongo unavailable");
          },
          endSession: async () => {},
        }),
      ],
    ],
    async () => {
      const result = await syncPackingVideo({ sessionId, recordingId });
      assert.equal(result.status, "SYNC_PENDING");
      assert.equal(result.publicId, staged.cloudinaryPublicId);
    },
  );
});
