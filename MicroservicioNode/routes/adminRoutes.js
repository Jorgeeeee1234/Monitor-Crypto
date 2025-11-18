const express = require("express");
const mongoose = require("mongoose");
const Favorite = require("../data/Favorite");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const { HttpError } = require("../utils/httpErrors");
const { validateObjectId } = require("../utils/validators");

const router = express.Router();

router.use(auth, admin);

router.get("/mongo/collections", async (_req, res, next) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new HttpError(500, "Conexion con MongoDB no inicializada");
    }
    const collections = await db.listCollections().toArray();
    const detailed = await Promise.all(
      collections
        .filter((col) => !col.name.startsWith("system."))
        .map(async (col) => {
          const collection = db.collection(col.name);
          let count = null;
          try {
            count = await collection.estimatedDocumentCount();
          } catch (_err) {
            count = null;
          }
          return {
            name: col.name,
            type: col.type || "collection",
            documentCount: count,
          };
        })
    );
    detailed.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ collections: detailed });
  } catch (err) {
    next(err);
  }
});

router.get("/mongo/collections/:name", async (req, res, next) => {
  try {
    const name = String(req.params.name || "");
    if (!name) {
      throw new HttpError(400, "Nombre de coleccion no proporcionado");
    }

    const db = mongoose.connection.db;
    if (!db) {
      throw new HttpError(500, "Conexion con MongoDB no inicializada");
    }

    const existing = await db.listCollections({ name }).next();
    if (!existing) {
      throw new HttpError(404, "Coleccion no encontrada");
    }

    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(limitParam, 100))
      : 20;

    const collection = db.collection(name);
    const docs = await collection.find({}).limit(limit).toArray();
    const rows = docs.map((doc) => normalizeDocument(doc));
    let documentCount = null;
    try {
      documentCount = await collection.estimatedDocumentCount();
    } catch (_err) {
      documentCount = null;
    }

    res.json({
      collection: name,
      documentCount,
      rows,
    });
  } catch (err) {
    next(err);
  }
});

function normalizeDocument(doc) {
  const result = {};
  for (const [key, value] of Object.entries(doc)) {
    result[key] = formatValue(value);
  }
  return result;
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item));
  }
  if (typeof value === "object") {
    const plain = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      plain[nestedKey] = formatValue(nestedValue);
    }
    return plain;
  }
  return value;
}

router.get("/favorites/metrics", async (_req, res, next) => {
  try {
    const totalFavorites = await Favorite.countDocuments();
    const distinctUsers = await Favorite.distinct("userId");
    const avgFavoritesPerUser = distinctUsers.length > 0 ? totalFavorites / distinctUsers.length : 0;
    const topFavorites = await Favorite.aggregate([
      {
        $group: {
          _id: { symbol: "$symbol", name: "$name" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);
    const formattedTop = topFavorites.map((item) => {
      const symbol = item && item._id && item._id.symbol ? item._id.symbol : "";
      const name = item && item._id && item._id.name ? item._id.name : "";
      let count = 0;
      if (item && typeof item.count === "number") {
        count = item.count;
      } else if (item && item.count && typeof item.count === "object") {
        if (typeof item.count.toNumber === "function") {
          count = item.count.toNumber();
        } else if (typeof item.count.$numberLong === "string") {
          count = Number.parseInt(item.count.$numberLong, 10) || 0;
        }
      }
      return { symbol, name, count };
    });

    if (formattedTop.length === 0 && totalFavorites > 0) {
      const recent = await Favorite.findOne().sort({ addedAt: -1 }).lean();
      if (recent) {
        formattedTop.push({
          symbol: recent.symbol || "",
          name: recent.name || "",
          count: 1,
        });
      }
    }

    res.json({
      totalFavorites,
      avgFavoritesPerUser,
      topFavorites: formattedTop,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/favorites/:id", async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id);
    const favorites = await Favorite.find({ userId: id }).sort({ addedAt: -1 });
    res.json(favorites);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
