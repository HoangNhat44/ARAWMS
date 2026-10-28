/*
 * File: layout.service.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Validates, versions, and publishes the shared raw-material and finished-goods floor plan.
 */
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import WarehouseLayout from "../../../models/WarehouseLayout.model.js";
import WarehouseLocation from "../../../models/WarehouseLocation.model.js";
import User from "../../../models/User.model.js";
import WarehouseBarcodeHistory from "../../../models/WarehouseBarcodeHistory.model.js";
import ProductUnit from "../../../models/ProductUnit.js";
import FabricRoll from "../../../models/FabricRoll.model.js";
import MaterialStockLot from "../../../models/MaterialStockLot.model.js";
import PutawayAllocation from "../../../models/PutawayAllocation.model.js";
import SystemLog from "../../../models/SystemLog.model.js";

const id = (value) => String(value || "");
const fail = (code, message, status = 409) => {
  throw Object.assign(new Error(message), { code, status });
};
const snap = (value) => {
  const data = JSON.parse(JSON.stringify(
    value || { zones: [], racks: [], bins: [], nearFullThreshold: 0.8 },
  ));
  return {
    ...data,
    zones: (data.zones || []).map(({ x, y, width, height, ...zone }) => zone),
    racks: (data.racks || []).map(({ x, y, orientation, ...rack }) => rack),
  };
};
const presentLayout = (value) => {
  const layout = value?.toObject ? value.toObject() : value;
  return layout && { ...layout, active: snap(layout.active),
    draft: layout.draft ? snap(layout.draft) : null };
};
const codePattern = /^[A-Z0-9_-]{1,32}$/;
const rawCapacityUnits = ["METER", "KG", "PIECE", "SPOOL", "BOX"];
const positive = (value, max) =>
  Number.isSafeInteger(Number(value)) &&
  Number(value) >= 1 &&
  Number(value) <= max;
const barcodeFor = (code) =>
  `LOC-${code}-${randomBytes(6).toString("hex").toUpperCase()}`;
const audit = (user, action, target, before, after, session) =>
  SystemLog.create(
    [
      {
        actorId: user._id,
        actorRole: user.roleCode,
        majorFeature: "WAREHOUSE_LAYOUT",
        subFeature: "FINISHED_GOODS",
        action,
        targetCollection: target.collection.name,
        targetId: target._id,
        beforeSnapshot: before,
        afterSnapshot: after,
      },
    ],
    { session },
  );

export async function getLayout() {
  const layout = await WarehouseLayout.findOne({
    warehouseType: "FINISHED_GOODS",
  })
    .populate("updatedByUserId", "fullName")
    .populate("publishedByUserId", "fullName");
  if (layout) return presentLayout(layout);
  return (
    {
      warehouseType: "FINISHED_GOODS",
      activeVersion: 0,
      active: snap(),
      draft: null,
      draftVersion: 0,
    }
  );
}

export async function openDraft(user) {
  let layout = await WarehouseLayout.findOne({
    warehouseType: "FINISHED_GOODS",
  });
  if (!layout) {
    try {
      layout = await WarehouseLayout.create({
        warehouseType: "FINISHED_GOODS",
        updatedByUserId: user._id,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      layout = await WarehouseLayout.findOne({
        warehouseType: "FINISHED_GOODS",
      });
    }
  }
  if (layout.draft) return presentLayout(layout);
  const updated = await WarehouseLayout.findOneAndUpdate(
    { _id: layout._id, draft: null },
    {
      $set: {
        draft: snap(layout.active),
        draftBaseVersion: layout.activeVersion,
        updatedByUserId: user._id,
      },
      $inc: { draftVersion: 1 },
    },
    { new: true },
  );
  if (updated)
    await audit(
      user,
      "OPEN_DRAFT",
      layout,
      { activeVersion: layout.activeVersion },
      { draftVersion: updated.draftVersion },
    );
  return presentLayout(updated || await WarehouseLayout.findById(layout._id));
}

/** Rebases a draft after the active layout changes, without changing the active layout. */
export async function resetDraft(user, version) {
  const layout = await WarehouseLayout.findOne({ warehouseType: "FINISHED_GOODS" });
  if (!layout?.draft) fail("NO_DRAFT", "Chưa có bản nháp");
  if (Number(version) !== layout.draftVersion)
    fail("VERSION_CONFLICT", "Bản nháp đã thay đổi");
  const updated = await WarehouseLayout.findOneAndUpdate(
    { _id: layout._id, activeVersion: layout.activeVersion,
      draftVersion: layout.draftVersion },
    { $set: { draft: snap(layout.active), draftBaseVersion: layout.activeVersion,
      updatedByUserId: user._id }, $inc: { draftVersion: 1 } },
    { new: true },
  );
  if (!updated) fail("VERSION_CONFLICT", "Sơ đồ đã thay đổi");
  await audit(user, "RESET_DRAFT", layout,
    { draftVersion: layout.draftVersion, draftBaseVersion: layout.draftBaseVersion },
    { draftVersion: updated.draftVersion, draftBaseVersion: updated.draftBaseVersion });
  return presentLayout(updated);
}

/** Generates stable IDs and barcodes once, when a rack is added to a draft. */
export async function addRack(user, input) {
  const layout = await WarehouseLayout.findOne({
    warehouseType: "FINISHED_GOODS",
  });
  if (!layout?.draft) fail("NO_DRAFT", "Hãy mở bản nháp trước");
  if (Number(input.version) !== layout.draftVersion)
    fail("VERSION_CONFLICT", "Bản nháp đã thay đổi");
  const zoneCode = String(input.zoneCode || "")
    .toUpperCase()
    .trim();
  const rackCode = String(input.code || "")
    .toUpperCase()
    .trim();
  const floors = Number(input.floors ?? 3);
  const binsPerFloor = Number(input.binsPerFloor ?? 1);
  const capacityUnit = zoneCode === "A" ? String(input.capacityUnit || "").toUpperCase() : "PIECE";
  if (
    !codePattern.test(rackCode) ||
    !positive(floors, 12) ||
    !positive(binsPerFloor, 20) ||
    floors * binsPerFloor > 120 ||
    (zoneCode === "A" && !rawCapacityUnits.includes(capacityUnit)) ||
    !layout.draft.zones.some(
      (zone) =>
        zone.code === zoneCode &&
        (zone.type === "STORAGE" || (zoneCode === "A" && zone.type === "WORK")) &&
        zone.status === "ACTIVE",
    )
  ) {
    fail("INVALID_RACK", "Kệ, khu hoặc số tầng/ô không hợp lệ", 400);
  }
  if (
    layout.draft.racks.some(
      (rack) => rack.zoneCode === zoneCode && rack.code === rackCode,
    )
  ) {
    fail("DUPLICATE_RACK", "Mã kệ đã tồn tại");
  }
  const rackId = new mongoose.Types.ObjectId();
  const rack = {
    id: rackId,
    code: rackCode,
    name: String(input.name || rackCode).trim(),
    zoneCode,
    status: "ACTIVE",
    note: String(input.note || ""),
    floors,
    binsPerFloor,
  };
  const bins = [];
  for (let floorNo = 1; floorNo <= floors; floorNo += 1) {
    for (let binNo = 1; binNo <= binsPerFloor; binNo += 1) {
      const locationCode = `${zoneCode}-${rackCode}-T${floorNo}-O${String(binNo).padStart(2, "0")}`;
      if (layout.draft.bins.some((bin) => bin.locationCode === locationCode))
        fail("DUPLICATE_BIN", "Mã ô đã tồn tại");
      bins.push({
        id: new mongoose.Types.ObjectId(),
        rackId,
        locationCode,
        displayName: locationCode,
        barcode: barcodeFor(locationCode),
        floorNo,
        binNo,
        capacity: 0,
        capacityUnit,
        allowedSkuMode: "SINGLE",
        allowedSkuIds: [],
        status: "ACTIVE",
        note: "",
      });
    }
  }
  const updated = await WarehouseLayout.findOneAndUpdate(
    {
      _id: layout._id,
      draftVersion: layout.draftVersion,
      activeVersion: layout.draftBaseVersion,
    },
    {
      $push: { "draft.racks": rack, "draft.bins": { $each: bins } },
      $inc: { draftVersion: 1 },
      $set: { updatedByUserId: user._id },
    },
    { new: true },
  );
  if (!updated) fail("VERSION_CONFLICT", "Bản nháp đã thay đổi");
  await audit(
    user,
    "ADD_RACK",
    layout,
    { draftVersion: layout.draftVersion },
    {
      rackCode: `${zoneCode}-${rackCode}`,
      bins: bins.length,
      draftVersion: updated.draftVersion,
    },
  );
  return presentLayout(updated);
}

export async function saveDraft(user, input) {
  const layout = await WarehouseLayout.findOne({
    warehouseType: "FINISHED_GOODS",
  });
  if (!layout?.draft) fail("NO_DRAFT", "Hãy mở bản nháp trước");
  if (Number(input.version) !== layout.draftVersion)
    fail("VERSION_CONFLICT", "Bản nháp đã thay đổi");
  const draft = snap(layout.draft);
  if (input.zones)
    draft.zones = input.zones.map((zone) => ({
      code: String(zone.code || "")
        .toUpperCase()
        .trim(),
      name: String(zone.name || "").trim(),
      type: zone.type === "WORK" ? "WORK" : "STORAGE",
      status: zone.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      note: String(zone.note || ""),
    }));
  if (input.racks) {
    const byId = new Map(draft.racks.map((rack) => [id(rack.id), rack]));
    for (const change of input.racks) {
      const rack = byId.get(id(change.id));
      if (!rack) fail("RACK_NOT_FOUND", "Không tìm thấy kệ", 404);
      if (change.name !== undefined) rack.name = String(change.name).trim();
      if (change.status !== undefined) rack.status = change.status;
      if (change.note !== undefined) rack.note = String(change.note);
    }
  }
  if (input.bins) {
    const byId = new Map(draft.bins.map((bin) => [id(bin.id), bin]));
    for (const change of input.bins) {
      const bin = byId.get(id(change.id));
      if (!bin) fail("BIN_NOT_FOUND", "Không tìm thấy ô", 404);
      for (const field of [
        "displayName",
        "capacity",
        "capacityUnit",
        "status",
        "note",
      ]) {
        if (change[field] !== undefined) bin[field] = change[field];
      }
    }
  }
  if (input.nearFullThreshold !== undefined)
    draft.nearFullThreshold = Number(input.nearFullThreshold);
  const errors = await validateSnapshot(draft);
  if (errors.length) fail("INVALID_LAYOUT", errors.join("; "));
  const updated = await WarehouseLayout.findOneAndUpdate(
    {
      _id: layout._id,
      draftVersion: layout.draftVersion,
      activeVersion: layout.draftBaseVersion,
    },
    { $set: { draft, updatedByUserId: user._id }, $inc: { draftVersion: 1 } },
    { new: true },
  );
  if (!updated) fail("VERSION_CONFLICT", "Bản nháp đã thay đổi");
  await audit(
    user,
    "SAVE_DRAFT",
    layout,
    { draftVersion: layout.draftVersion },
    {
      draftVersion: updated.draftVersion,
      zones: draft.zones.length,
      racks: draft.racks.length,
      bins: draft.bins.length,
    },
  );
  return presentLayout(updated);
}

export async function removeDraftRack(user, rackId, version) {
  const layout = await WarehouseLayout.findOne({
    warehouseType: "FINISHED_GOODS",
  });
  if (!layout?.draft) fail("NO_DRAFT", "Chưa có bản nháp");
  if (Number(version) !== layout.draftVersion)
    fail("VERSION_CONFLICT", "Bản nháp đã thay đổi");
  if (!layout.draft.racks.some((rack) => id(rack.id) === id(rackId)))
    fail("RACK_NOT_FOUND", "Không tìm thấy kệ", 404);
  const draft = snap(layout.draft);
  draft.racks = draft.racks.filter((rack) => id(rack.id) !== id(rackId));
  draft.bins = draft.bins.filter((bin) => id(bin.rackId) !== id(rackId));
  const updated = await WarehouseLayout.findOneAndUpdate(
    {
      _id: layout._id,
      draftVersion: layout.draftVersion,
      activeVersion: layout.draftBaseVersion,
    },
    { $set: { draft, updatedByUserId: user._id }, $inc: { draftVersion: 1 } },
    { new: true },
  );
  if (!updated) fail("VERSION_CONFLICT", "Bản nháp đã thay đổi");
  await audit(
    user,
    "REMOVE_RACK",
    layout,
    { rackId, draftVersion: layout.draftVersion },
    { draftVersion: updated.draftVersion },
  );
  return presentLayout(updated);
}

export async function resizeDraftRack(user, rackId, input) {
  const layout = await WarehouseLayout.findOne({
    warehouseType: "FINISHED_GOODS",
  });
  if (!layout?.draft) fail("NO_DRAFT", "Chưa có bản nháp");
  if (Number(input.version) !== layout.draftVersion)
    fail("VERSION_CONFLICT", "Bản nháp đã thay đổi");
  const floors = Number(input.floors);
  const binsPerFloor = Number(input.binsPerFloor);
  if (
    !positive(floors, 12) ||
    !positive(binsPerFloor, 20) ||
    floors * binsPerFloor > 120
  ) {
    fail("INVALID_RACK", "Số tầng hoặc số ô không hợp lệ", 400);
  }
  const draft = snap(layout.draft);
  const rack = draft.racks.find((item) => id(item.id) === id(rackId));
  if (!rack) fail("RACK_NOT_FOUND", "Không tìm thấy kệ", 404);
  rack.floors = floors;
  rack.binsPerFloor = binsPerFloor;
  const existing = draft.bins.filter((bin) => id(bin.rackId) === id(rackId));
  const capacityUnit = rack.zoneCode === "A" ? existing[0]?.capacityUnit || "PIECE" : "PIECE";
  draft.bins = draft.bins.filter((bin) => id(bin.rackId) !== id(rackId));
  for (let floorNo = 1; floorNo <= floors; floorNo += 1)
    for (let binNo = 1; binNo <= binsPerFloor; binNo += 1) {
      const found = existing.find(
        (bin) => bin.floorNo === floorNo && bin.binNo === binNo,
      );
      if (found) {
        draft.bins.push(found);
        continue;
      }
      const locationCode = `${rack.zoneCode}-${rack.code}-T${floorNo}-O${String(binNo).padStart(2, "0")}`;
      draft.bins.push({
        id: new mongoose.Types.ObjectId(),
        rackId: rack.id,
        locationCode,
        displayName: locationCode,
        barcode: barcodeFor(locationCode),
        floorNo,
        binNo,
        capacity: 0,
        capacityUnit,
        allowedSkuMode: "SINGLE",
        allowedSkuIds: [],
        status: "ACTIVE",
      });
    }
  const errors = await validateSnapshot(draft);
  if (errors.length) fail("INVALID_LAYOUT", errors.join("; "));
  const updated = await WarehouseLayout.findOneAndUpdate(
    {
      _id: layout._id,
      draftVersion: layout.draftVersion,
      activeVersion: layout.draftBaseVersion,
    },
    { $set: { draft, updatedByUserId: user._id }, $inc: { draftVersion: 1 } },
    { new: true },
  );
  if (!updated) fail("VERSION_CONFLICT", "Bản nháp đã thay đổi");
  await audit(
    user,
    "RESIZE_RACK",
    layout,
    { rackId, draftVersion: layout.draftVersion },
    { floors, binsPerFloor, draftVersion: updated.draftVersion },
  );
  return presentLayout(updated);
}

export async function validateSnapshot(draft, session) {
  const errors = [];
  const unique = (values) => new Set(values).size === values.length;
  if (
    !Number.isFinite(draft.nearFullThreshold) ||
    draft.nearFullThreshold <= 0 ||
    draft.nearFullThreshold >= 1
  )
    errors.push("Ngưỡng gần đầy phải từ 0 đến 1");
  if (
    draft.zones.length > 30 ||
    draft.racks.length > 200 ||
    draft.bins.length > 2000
  )
    errors.push("Sơ đồ vượt giới hạn kích thước");
  if (
    !unique(draft.zones.map((zone) => zone.code)) ||
    !unique(draft.bins.map((bin) => bin.locationCode)) ||
    !unique(draft.bins.map((bin) => bin.barcode))
  )
    errors.push("Mã khu, ô hoặc barcode bị trùng");
  const zoneCodes = new Set(draft.zones
    .filter((zone) => zone.type === "STORAGE" || (zone.code === "A" && zone.type === "WORK"))
    .map((zone) => zone.code));
  const rackIds = new Set(draft.racks.map((rack) => id(rack.id)));
  const rackById = new Map(draft.racks.map((rack) => [id(rack.id), rack]));
  const zoneByCode = new Map(draft.zones.map((zone) => [zone.code, zone]));
  for (const zone of draft.zones) {
    if (
      !codePattern.test(zone.code) ||
      !zone.name ||
      !["STORAGE", "WORK"].includes(zone.type) ||
      !["ACTIVE", "INACTIVE"].includes(zone.status)
    )
      errors.push(`Khu ${zone.code} không hợp lệ`);
  }
  for (const rack of draft.racks) {
    if (
      !zoneCodes.has(rack.zoneCode) ||
      !codePattern.test(rack.code) ||
      !rack.name ||
      !positive(rack.floors, 12) ||
      !positive(rack.binsPerFloor, 20) ||
      !["ACTIVE", "INACTIVE"].includes(rack.status)
    )
      errors.push(`Kệ ${rack.code} không hợp lệ`);
  }
  if (!unique(draft.racks.map((rack) => `${rack.zoneCode}:${rack.code}`)))
    errors.push("Mã kệ bị trùng trong khu");
  for (const bin of draft.bins) {
    const parentRack = rackById.get(id(bin.rackId));
    if (
      bin.status === "ACTIVE" &&
      (parentRack?.status !== "ACTIVE" ||
        zoneByCode.get(parentRack.zoneCode)?.status !== "ACTIVE")
    ) {
      errors.push(`Ô ${bin.locationCode} thuộc khu/kệ đã ngừng sử dụng`);
    }
    if (
      !rackIds.has(id(bin.rackId)) ||
      !/^[A-Z0-9_-]+-T\d+-O\d+$/.test(bin.locationCode) ||
      (parentRack?.zoneCode === "A" ? !Number.isFinite(bin.capacity) || bin.capacity > 100000000
        || !rawCapacityUnits.includes(bin.capacityUnit || "PIECE")
        : !Number.isSafeInteger(bin.capacity)) ||
      bin.capacity < 0 ||
      !["ACTIVE", "LOCKED", "INACTIVE"].includes(bin.status)
    )
      errors.push(`Ô ${bin.locationCode} không hợp lệ`);
  }
  const existing = await WarehouseLocation.find({
    _id: { $in: draft.bins.map((bin) => bin.id) },
  })
    .select("_id currentOccupancy plannedReservedQty capacityUnit warehouseType")
    .session(session || null)
    .lean();
  const byId = new Map(existing.map((item) => [id(item._id), item]));
  const [actualGroups, plans] = await Promise.all([
    ProductUnit.aggregate([
      {
        $match: {
          warehouseId: {
            $in: draft.bins.map((bin) => new mongoose.Types.ObjectId(bin.id)),
          },
          inventoryStatus: "AVAILABLE",
        },
      },
      {
        $group: {
          _id: "$warehouseId",
          quantity: { $sum: 1 },
        },
      },
    ]).session(session || null),
    PutawayAllocation.find({
      status: "CONFIRMED",
      "lines.targetLocationId": {
        $in: draft.bins.map((bin) => bin.id),
      },
    })
      .select("lines")
      .session(session || null)
      .lean(),
  ]);
  const actualByBin = new Map();
  const reservedByBin = new Map();
  for (const group of actualGroups) {
    const binId = id(group._id);
    actualByBin.set(binId, (actualByBin.get(binId) || 0) + group.quantity);
  }
  for (const plan of plans)
    for (const line of plan.lines) {
      const binId = id(line.targetLocationId);
      const remaining = Math.max(0,
        line.allocatedQuantity - (line.placedQuantity || 0) - (line.shortageQuantity || 0));
      reservedByBin.set(binId, (reservedByBin.get(binId) || 0) + remaining);
    }
  for (const bin of draft.bins) {
    const stored = byId.get(id(bin.id));
    const isRaw = rackById.get(id(bin.rackId))?.zoneCode === "A";
    if (stored && stored.warehouseType !== (isRaw ? "RAW_MATERIAL" : "FINISHED_GOODS"))
      errors.push(`Ô ${bin.locationCode} không đúng loại kho`);
    if (isRaw) {
      if (stored && stored.capacityUnit && stored.capacityUnit !== (bin.capacityUnit || "PIECE")) {
        const [roll, lot] = await Promise.all([
          FabricRoll.exists({ locationId: bin.id }).session(session || null),
          MaterialStockLot.exists({ "allocations.locationId": bin.id }).session(session || null),
        ]);
        if ((stored.currentOccupancy || 0) > 0 || roll || lot)
          errors.push(`Ô ${bin.locationCode} đã có hàng hoặc phân bổ, không thể đổi đơn vị`);
      }
      if (stored && bin.capacity + 1e-8 < (stored.currentOccupancy || 0))
        errors.push(`Ô ${bin.locationCode} không đủ sức chứa cho nguyên phụ liệu`);
      continue;
    }
    if (stored && (stored.currentOccupancy || 0) !== (actualByBin.get(id(bin.id)) || 0))
      errors.push(`Ô ${bin.locationCode} cần đối soát số hàng thực tế`);
    if (stored && (stored.plannedReservedQty || 0) !== (reservedByBin.get(id(bin.id)) || 0))
      errors.push(`Ô ${bin.locationCode} cần đối soát phần giữ chỗ`);
    if (
      stored &&
      bin.capacity <
        Math.max(
          stored.currentOccupancy || 0,
          actualByBin.get(id(bin.id)) || 0,
        ) +
          (stored.plannedReservedQty || 0)
    ) {
      errors.push(
        `Ô ${bin.locationCode} không đủ sức chứa cho hàng và chỗ đã giữ`,
      );
    }
  }
  return errors;
}

export async function validateDraft() {
  const layout = await WarehouseLayout.findOne({
    warehouseType: "FINISHED_GOODS",
  }).lean();
  if (!layout?.draft) fail("NO_DRAFT", "Chưa có bản nháp");
  const errors = await validateSnapshot(layout.draft);
  if (layout.draftBaseVersion !== layout.activeVersion)
    errors.push("Bản nháp dựa trên sơ đồ cũ");
  const keepIds = new Set(layout.draft.bins.map((bin) => id(bin.id)));
  const removed = layout.active.bins.filter((bin) => !keepIds.has(id(bin.id)));
  for (const bin of removed) {
    const [stored, units, allocations, roll, lot] = await Promise.all([
      WarehouseLocation.findById(bin.id)
        .select("currentOccupancy plannedReservedQty")
        .lean(),
      ProductUnit.exists({ warehouseId: bin.id }),
      PutawayAllocation.exists({
        status: "CONFIRMED",
        "lines.targetLocationId": bin.id,
      }),
      FabricRoll.exists({ locationId: bin.id }),
      MaterialStockLot.exists({ "allocations.locationId": bin.id }),
    ]);
    if (
      (stored?.currentOccupancy || 0) > 0 ||
      (stored?.plannedReservedQty || 0) > 0 ||
      units ||
      allocations || roll || lot
    ) {
      errors.push(`Ô ${bin.locationCode} còn hàng hoặc phân bổ, không thể bỏ`);
    }
  }
  const clashes = await WarehouseLocation.find({
    _id: { $nin: layout.draft.bins.map((bin) => bin.id) },
    $or: [
      {
        locationCode: { $in: layout.draft.bins.map((bin) => bin.locationCode) },
      },
      { barcode: { $in: layout.draft.bins.map((bin) => bin.barcode) } },
    ],
  })
    .select("locationCode")
    .lean();
  if (clashes.length)
    errors.push(
      `Mã ô đã được dùng: ${clashes.map((item) => item.locationCode).join(", ")}`,
    );
  return {
    errors,
    draftVersion: layout.draftVersion,
    activeVersion: layout.activeVersion,
  };
}

/** Applies every bin with one transaction; a stale draft cannot partially publish. */
export async function publishDraft(user, version) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const layout = await WarehouseLayout.findOne({
        warehouseType: "FINISHED_GOODS",
      }).session(session);
      if (!layout?.draft) fail("NO_DRAFT", "Chưa có bản nháp");
      if (
        Number(version) !== layout.draftVersion ||
        layout.draftBaseVersion !== layout.activeVersion
      )
        fail("VERSION_CONFLICT", "Sơ đồ đã thay đổi");
      const draft = snap(layout.draft);
      const errors = await validateSnapshot(draft, session);
      if (errors.length) fail("INVALID_LAYOUT", errors.join("; "));
      const locationLogs = [];
      const oldById = new Map(
        layout.active.bins.map((item) => [id(item.id), item]),
      );
      const keepIds = new Set(draft.bins.map((bin) => id(bin.id)));
      for (const old of layout.active.bins) {
        if (keepIds.has(id(old.id))) continue;
        const stored = await WarehouseLocation.findById(old.id).session(
          session,
        );
        const [roll, lot] = await Promise.all([
          FabricRoll.exists({ locationId: old.id }).session(session),
          MaterialStockLot.exists({ "allocations.locationId": old.id }).session(session),
        ]);
        if (
          stored &&
          ((stored.currentOccupancy || 0) > 0 ||
            (stored.plannedReservedQty || 0) > 0 ||
            (await ProductUnit.exists({ warehouseId: old.id }).session(
              session,
            )) ||
            (await PutawayAllocation.exists({
              status: "CONFIRMED",
              "lines.targetLocationId": old.id,
            }).session(session)) || roll || lot)
        )
          fail("BIN_IN_USE", `Ô ${old.locationCode} còn hàng hoặc chỗ đã giữ`);
        await WarehouseLocation.updateOne(
          { _id: old.id },
          {
            $set: {
              status: "INACTIVE",
              isDeleted: true,
              deletedAt: new Date(),
            },
          },
          { session },
        );
        locationLogs.push({
          actorId: user._id,
          actorRole: user.roleCode,
          majorFeature: "WAREHOUSE_LAYOUT",
          subFeature: "LOCATION",
          action: "REMOVE_BIN",
          targetCollection: "warehouse_locations",
          targetId: old.id,
          targetCode: old.locationCode,
          beforeSnapshot: { status: old.status },
          afterSnapshot: { status: "INACTIVE" },
        });
      }
      for (const bin of draft.bins) {
        const rack = draft.racks.find((item) => id(item.id) === id(bin.rackId));
        const old = await WarehouseLocation.findById(bin.id).session(session);
        if (old && id(old._id) !== id(bin.id))
          fail("BIN_CONFLICT", "ID ô không hợp lệ");
        const conflict = await WarehouseLocation.findOne({
          _id: { $ne: bin.id },
          $or: [{ locationCode: bin.locationCode }, { barcode: bin.barcode }],
        })
          .session(session)
          .lean();
        if (conflict)
          fail("DUPLICATE_LOCATION", `Mã ô ${bin.locationCode} đã được dùng`);
        if (!old)
          await WarehouseBarcodeHistory.create(
            [{ barcode: bin.barcode, locationId: bin.id }],
            { session },
          );
        await WarehouseLocation.updateOne(
          { _id: bin.id },
          {
            $set: {
              locationCode: bin.locationCode,
              barcode: bin.barcode,
              warehouseType: rack.zoneCode === "A" ? "RAW_MATERIAL" : "FINISHED_GOODS",
              zoneCode: rack.zoneCode,
              rackCode: rack.code,
              shelfCode: `T${bin.floorNo}`,
              floorNo: bin.floorNo,
              binNo: bin.binNo,
              displayName: bin.displayName,
              maxCapacity: bin.capacity,
              capacityUnit: rack.zoneCode === "A" ? bin.capacityUnit || "PIECE" : "PIECE",
              layoutBin: true,
              allowedSkuMode: bin.allowedSkuMode,
              allowedSkuIds: bin.allowedSkuIds,
              status: bin.status,
              layoutVersion: layout.activeVersion + 1,
              isDeleted: false,
              deletedAt: null,
            },
            $setOnInsert: { currentOccupancy: 0, plannedReservedQty: 0 },
          },
          { upsert: true, session },
        );
        const before = oldById.get(id(bin.id));
        const config = (item) =>
          item && {
            displayName: item.displayName,
            capacity: item.capacity,
            capacityUnit: item.capacityUnit,
            allowedSkuMode: item.allowedSkuMode,
            allowedSkuIds: item.allowedSkuIds.map(id),
            status: item.status,
            barcode: item.barcode,
          };
        if (JSON.stringify(config(before)) !== JSON.stringify(config(bin))) {
          locationLogs.push({
            actorId: user._id,
            actorRole: user.roleCode,
            majorFeature: "WAREHOUSE_LAYOUT",
            subFeature: "LOCATION",
            action: before ? "UPDATE_BIN" : "CREATE_BIN",
            targetCollection: "warehouse_locations",
            targetId: bin.id,
            targetCode: bin.locationCode,
            beforeSnapshot: config(before),
            afterSnapshot: config(bin),
          });
        }
      }
      // Managers already assigned to raw-material storage inherit newly published
      // zone-A bins; finished-goods-only managers keep their existing scope.
      const rawBinIds = draft.bins.filter((bin) => draft.racks.some((rack) =>
        id(rack.id) === id(bin.rackId) && rack.zoneCode === "A")).map((bin) => bin.id);
      if (rawBinIds.length) {
        const rawAccessIds = await WarehouseLocation.distinct("_id", {
          warehouseType: "RAW_MATERIAL", status: "ACTIVE", isDeleted: { $ne: true },
        }).session(session);
        await User.updateMany({ roleCode: "WAREHOUSE_MANAGER",
          warehouseIds: { $in: rawAccessIds } },
        { $addToSet: { warehouseIds: { $each: rawBinIds } } }, { session });
      }
      const updated = await WarehouseLayout.updateOne(
        {
          _id: layout._id,
          activeVersion: layout.activeVersion,
          draftVersion: layout.draftVersion,
        },
        {
          $set: {
            active: draft,
            publishedByUserId: user._id,
            publishedAt: new Date(),
            updatedByUserId: user._id,
            draft: null,
            draftBaseVersion: null,
          },
          $inc: { activeVersion: 1, draftVersion: 1 },
        },
        { session },
      );
      if (!updated.modifiedCount) fail("VERSION_CONFLICT", "Sơ đồ đã thay đổi");
      await audit(
        user,
        "PUBLISH",
        layout,
        { version: layout.activeVersion },
        { version: layout.activeVersion + 1, bins: draft.bins.length },
        session,
      );
      if (locationLogs.length)
        await SystemLog.create(locationLogs, { session, ordered: true });
      result = { activeVersion: layout.activeVersion + 1 };
    });
    return result;
  } finally {
    await session.endSession();
  }
}
