const { createClient } = require("redis");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let hasLoggedMaxRetries = false;

const client = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries >= 3) {
        if (!hasLoggedMaxRetries) {
          console.warn("Redis Server is offline. Running application in database-only mode (caching disabled).");
          hasLoggedMaxRetries = true;
        }
        return new Error("Redis connection failed");
      }
      return 2000;
    },
  },
});

client.on("error", (err) => {
  if (!hasLoggedMaxRetries) {
    console.error("Redis connection attempt failed. Retrying...");
  }
});

client.on("connect", () => {
  console.log("Redis Client Connecting...");
});

client.on("ready", () => {
  console.log("Redis Client Connected and Ready.");
  hasLoggedMaxRetries = false;
});

const connectRedis = async () => {
  try {
    await client.connect();
  } catch (error) {
    if (!hasLoggedMaxRetries) {
      console.warn("Redis Connection failed on startup:", error.message);
    }
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
