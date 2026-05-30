const { createClient } = require("redis");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const client = createClient({ url: redisUrl });

client.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

client.on("connect", () => {
  console.log("Redis Client Connecting...");
});

client.on("ready", () => {
  console.log("Redis Client Connected and Ready.");
});

const connectRedis = async () => {
  try {
    await client.connect();
  } catch (error) {
    console.error("Failed to connect to Redis:", error.message);
  }
};

const getCache = async (key) => {
  if (!client.isOpen) return null;
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Redis Get Error for key ${key}:`, error);
    return null;
  }
};

const setCache = async (key, value, ttlSeconds = 1800) => {
  if (!client.isOpen) return;
  try {
    await client.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    });
  } catch (error) {
    console.error(`Redis Set Error for key ${key}:`, error);
  }
};

const invalidateCachePattern = async (pattern) => {
  if (!client.isOpen) return;
  try {
    let cursor = 0;
    do {
      const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      if (reply.keys && reply.keys.length > 0) {
        await client.del(reply.keys);
        console.log(`Invalidated cache keys: ${reply.keys.join(", ")}`);
      }
    } while (cursor !== 0);
  } catch (error) {
    console.error(`Redis Cache Invalidation Error for pattern ${pattern}:`, error);
  }
};

module.exports = {
  client,
  connectRedis,
  getCache,
  setCache,
  invalidateCachePattern,
};
