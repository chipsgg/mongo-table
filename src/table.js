const Promise = require("bluebird");
const assert = require("assert");
const highland = require("highland");

module.exports = async (db, schema) => {
  const {
    name,
    table,
    indices = [],
    compound = [],
    text = [],
    ttl = [],
    ...options
  } = schema;

  function createCollection(name, opts) {
    return db.createCollection(name, opts).catch((err) => {
      console.log("createCollection.error:", err.message);
    });
  }

  // https://docs.mongodb.com/manual/core/index-single/
  function createIndex(collection, name, type = 1) {
    return collection.createIndex({
      [name]: type,
    });
  }

  // https://docs.mongodb.com/manual/tutorial/expire-data/
  // https://hackernoon.com/how-to-erase-expired-docs-automatically-with-mongodb-ttl-index-97283wll
  function createTtlIndex(collection, name, options = {}) {
    assert(options, "requires ttl options");
    assert(
      options.expireAfterSeconds,
      "requires ttl option: expireAfterSeconds"
    );

    return collection.createIndex(
      {
        [name]: 1,
      },
      options
    );
  }

  function createTtlIndexes(collection, indexes) {
    return Promise.mapSeries(indexes, ([index, options]) => {
      return createTtlIndex(collection, index, options);
    });
  }

  function createIndexes(collection, indexes) {
    return Promise.mapSeries(indexes, (index) => {
      return createIndex(collection, index);
    });
  }

  // https://docs.mongodb.com/manual/core/index-compound/
  function createCompoundIndex(collection, fields) {
    const config = fields.reduce((result, name) => {
      result[name] = 1;
      return result;
    }, {});
    return collection.createIndex(config);
  }

  function createCompoundIndexes(collection, indexes) {
    return Promise.mapSeries(indexes, (index) => {
      return createCompoundIndex(collection, index);
    });
  }

  function createTextSearchIndexes(collection, indexes) {
    return Promise.mapSeries(indexes, (index) => {
      return createIndex(collection, index, "text");
    });
  }

  await createCollection(name || table, options);
  const col = db.collection(name || table);
  await createIndexes(col, indices);
  await createCompoundIndexes(col, compound);
  await createTextSearchIndexes(col, text);
  await createTtlIndexes(col, ttl);

  async function get(id) {
    assert(id, "requires id");
    return col.findOne({
      _id: id,
    });
  }

  async function getAll(ids = []) {
    return col.find({ _id: { $in: ids } }).toArray();
  }

  async function getBy(index, id, options) {
    return col.find({ [index]: id }, options).toArray();
  }

  async function has(id) {
    const result = await col.findOne({ _id: id }, { projection: { _id: 1 } });
    return result ? true : false;
  }
  async function set(id, props, opts = { upsert: true }) {
    const query = {};
    if (id) query._id = id;
    else query._id = props.id;
    await col.replaceOne(query, props, opts);
    return { ...query, ...props };
  }
  async function upsert(props, opts) {
    return set(undefined, props, opts);
  }

  async function upsertMany(docs = []) {
    const ops = docs.map((d) => {
      return {
        replaceOne: {
          filter: { _id: d.id },
          replacement: d,
          upsert: true,
        },
      };
    });
    await col.bulkWrite(ops);

    return docs;
  }

  async function update(id, props, opts = { upsert: true }) {
    assert(id, "requires id");
    return col
      .findOneAndUpdate(
        { _id: id },
        { $set: props },
        {
          ...opts,
          returnNewDocument: true,
        }
      )
      .then((row) => row.value);
  }

  async function insert(props, opts) {
    await col.insertOne(props, opts);
    return props;
  }

  async function create(props, opts) {
    props._id = props.id;
    return insert(props, opts);
  }

  async function del(id) {
    await col.deleteOne({ _id: id });
    return { _id: id, id };
  }
  async function deleteAll(ids = []) {
    return col.deleteMany({ _id: { $all: ids } });
  }

  function count(props) {
    return col.countDocuments(props);
  }

  function streamify(cursor) {
    return highland(cursor);
  }

  async function insertMany(docs = []) {
    docs = docs.map((x) => {
      if (x.id && x._id == null) x._id = x.id;
      return x;
    });
    await col.insertMany(docs);
    return docs;
  }

  function drop(query = {}) {
    return col.deleteMany(query);
  }

  function query() {
    return col;
  }

  function distinct(field) {
    return col.distinct(field);
  }

  function list() {
    return col.find({}).toArray();
  }

  function readStream(query = {}) {
    return highland(col.find(query).stream());
  }

  function close() {
    return db.close();
  }

  function search(index, term, skip = 0, limit = 100) {
    //return col.find({ $text: { $search: term } }, { skip, limit }).toArray()
    return col
      .find({ [index]: { $regex: term, $options: "i" } }, { skip, limit })
      .toArray();
  }

  function searchFuzzy(index, term, skip = 0, limit = 100) {
    return col
      .find({ [index]: { $regex: term, $options: "i" } }, { skip, limit })
      .toArray();
  }

  function getBySortedBetween(
    filter = {},
    max = Date.now(),
    min = 0,
    skip = 0,
    limit = 100,
    sortKey = "created"
  ) {
    //console.log("getBySortedBetween", { filter, max, min, skip, limit });
    assert(filter, "requires filter");
    assert(max > 0, "requires max");
    //assert(max <= Date.now(), "requires max");
    assert(min >= 0, "requires min");
    assert(skip >= 0, "requires skip");
    assert(limit >= 1, "requires limit");

    return col
      .find(
        { ...filter, [sortKey]: { $lte: max, $gte: min } },
        {
          sort: { [sortKey]: -1 },
          skip,
          limit,
        }
      )
      .toArray();
  }

  // push items into an array field
  function push(id, key, items) {
    assert(id, "requires id");
    assert(key, "requires field key");
    assert(Array.isArray(items), "requires tags");

    return table.updateOne(
      {
        _id: id,
      },
      {
        $addToSet: {
          [key]: { $each: items },
        },
      }
    );
  }

  // pull items from and array field
  function pull(id, key, items) {
    assert(id, "requires id");
    assert(key, "requires field key");
    assert(Array.isArray(items), "requires tags");

    return table.updateOne(
      {
        _id: id,
      },
      {
        $pull: {
          [key]: { $in: items },
        },
      }
    );
  }

  return {
    set,
    get,
    getBy,
    getAll,
    has,
    delete: del,
    streamify,
    count,
    drop,
    insertMany,
    query,
    distinct,
    list,
    readStream,
    deleteAll,
    collection: query,
    close,
    insert,
    create,
    upsert,
    upsertMany,
    update,
    db: () => db,
    search,
    searchFuzzy,
    getBySortedBetween,
    push,
    pull,
  };
};
