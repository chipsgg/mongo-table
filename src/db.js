const assert = require("assert");
const { MongoClient } = require("mongodb");
module.exports = async (config = {}) => {
  const { uri, ...options } = config;
  assert(uri, "requires uri");
  const mongo = new MongoClient(config.uri, options)

  await mongo.connect()

  return mongo.db()
};
