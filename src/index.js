const Mongo = require("./mongo");

// expose libs
Mongo.Table = require("./table");
Mongo.DB = require("./db");

module.exports = Mongo;
