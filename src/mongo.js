const DB = require('./db')
const Table = require('./table')

module.exports = async config => {
  const db = await DB(config)

  return async schema =>{
    return Table(db,schema)
  }

}
