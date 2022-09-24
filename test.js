require('dotenv').config()
const test = require('tape')
const Mongo = require('./src')

const config = {
  uri : process.env.uri,
  useNewUrlParser:true,
  useUnifiedTopology:true,
}

const schema = {
  name: 'test',
  indices:['type','done'],
  compound:[
    ['type','done'],
    ['userid','done'],
  ]
}

test('mongo',t=>{
  let table,Tables
  t.test('init',async t=>{
    Tables = await Mongo(config)
    t.ok(Tables)
    table = await Tables(schema)
    t.ok(table)
    t.end()
  })
  t.test('drop',async t=>{
    await table.drop()
    t.end()
  })

  t.test('set',async t=>{
    const result = await table.set('test',{
      id:'test',
    })
    console.log(result)
    t.end()
  })
  t.test('upsert',async t=>{
    const result = await table.upsert({
      id: 'upsert',
      test:'blah'
    })
    t.end()
  })
  t.test('insert',async t=>{
    const result = await table.insert({
      'test':'test'
    })
    t.end()
  })
  t.test('update',async t=>{
    const result = await table.update('test', {
      'test':'ok'
    })
    console.log(result)
    t.end()
  })
  t.test('get',async t=>{
    const result = await table.get('test')
    t.end()
  })
  t.test('readStream',async t=>{
    const result = await table.readStream().collect().toPromise(Promise)
    t.ok(result.length)
    console.log(result)
    t.end()
  })
})


