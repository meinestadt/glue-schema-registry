import SDKMock from './helper/sdkmock'
import { describe, expect, test, beforeAll } from '@jest/globals'
import { ERROR, GlueSchemaRegistry, SchemaCompatibilityType, SchemaType } from '../src'
import * as avro from 'avsc'

interface TestType {
  demo: string
}

interface TestTypeV2 {
  demo: string
  v2demo: string
}

const testschema = avro.Type.forSchema({
  type: 'record',
  name: 'property',
  namespace: 'de.meinestadt.test',
  fields: [{ name: 'demo', type: 'string', default: 'Hello World' }],
})

const testschemaV2 = avro.Type.forSchema({
  type: 'record',
  name: 'property',
  namespace: 'de.meinestadt.test',
  fields: [
    { name: 'demo', type: 'string', default: 'Hello World' },
    { name: 'v2demo', type: 'string', default: 'Meinestadt' },
  ],
})

const sdkmock = SDKMock.getInstance()

// valid message with gzip compressed content
const compressedHelloWorld =
  '0305b7912285527d42de88eee389a763225f789c93f048cdc9c95728cf2fca495104001e420476'

const messageWithNotExistingSchema =
  '030500000000000000000000000000000000789c93f048cdc9c95728cf2fca495104001e420476'

// valid message with uncompressed content
const uncompressedHelloWorld = '0300b7912285527d42de88eee389a763225f1848656c6c6f20776f726c6421'

// message with wrong magic byte
const malformedMessage = '0000b7912285527d42de88eee389a763225f1848656c6c6f20776f726c6421'

// message with wrong compression byte
const malformedCompression = '0301b7912285527d42de88eee389a763225f1848656c6c6f20776f726c6421'

describe('schema management', () => {
  test('create schema', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestType>('testregistry')
    await schemaregistry.createSchema({
      schema: JSON.stringify(testschemaV2),
      schemaName: 'Testschema',
      compatibility: SchemaCompatibilityType.BACKWARD,
      type: SchemaType.AVRO,
    })
    expect(sdkmock.mockedCreateSchema).toBeCalledTimes(1)
  })
})

describe('serde with compression', () => {
  let schemaregistry: GlueSchemaRegistry<TestType>
  let schemaId: string

  beforeAll(async () => {
    schemaregistry = new GlueSchemaRegistry<TestType>('testregistry')
    sdkmock.clear()
  })

  test('serialization', async () => {
    schemaId = await schemaregistry.register({
      schema: JSON.stringify(testschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const bindata = await schemaregistry.encode(schemaId, {
      demo: 'Hello world!',
    })
    const binmessage = bindata.toString('hex')
    expect(sdkmock.mockedRegisterSchemaVersion).toBeCalled()
    expect(binmessage).toBe(compressedHelloWorld)
  })

  test('deserialization', async () => {
    schemaId = await schemaregistry.register({
      schema: JSON.stringify(testschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const binmessage = compressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschema)
    expect(object.demo).toBe('Hello world!')
  })

  test('deserialization with schema evolution', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry')
    schemaId = await schemaregistry.register({
      schema: JSON.stringify(testschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const binmessage = compressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschemaV2)
    expect(object.demo).toBe('Hello world!')
    expect(object.v2demo).toBe('Meinestadt')
  })

  test('deserialization with clear cache', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry')
    const binmessage = compressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschemaV2)
    expect(object.demo).toBe('Hello world!')
    expect(object.v2demo).toBe('Meinestadt')
  })
})

describe('serde without compression', () => {
  let schemaregistry: GlueSchemaRegistry<TestType>
  let schemaId: string

  beforeAll(async () => {
    schemaregistry = new GlueSchemaRegistry<TestType>('testregistry')
    sdkmock.clear()
  })

  test('serialization', async () => {
    schemaId = await schemaregistry.register({
      schema: JSON.stringify(testschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const bindata = await schemaregistry.encode(
      schemaId,
      {
        demo: 'Hello world!',
      },
      {
        compress: false,
      },
    )
    const binmessage = bindata.toString('hex')
    // expect that mockRegisterSchemaVersion got called only once, otherwise the cache wouldn't work
    expect(sdkmock.mockedRegisterSchemaVersion).toBeCalledTimes(1)
    expect(binmessage).toBe(uncompressedHelloWorld)
  })

  test('deserialization', async () => {
    schemaId = await schemaregistry.register({
      schema: JSON.stringify(testschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const binmessage = uncompressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschema)
    // expect that mockRegisterSchemaVersion got called only once, otherwise the cache wouldn't work
    expect(sdkmock.mockedRegisterSchemaVersion).toBeCalledTimes(1)
    expect(object.demo).toBe('Hello world!')
  })
})

describe('test analyze message', () => {
  test('analyze should succeed for a valid message', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry')
    const result = await schemaregistry.analyzeMessage(Buffer.from(compressedHelloWorld, 'hex'))
    expect(result.valid).toBe(true)
    expect(result.compression).toBe(GlueSchemaRegistry.COMPRESSION_ZLIB)
    expect(result.schemaId).toBe('b7912285-527d-42de-88ee-e389a763225f')
    expect(result.schema?.SchemaArn).toBe(
      'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
    )
  })
  test('analyze should not succeed for an invalid message', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry')
    const result = await schemaregistry.analyzeMessage(Buffer.from(malformedMessage, 'hex'))
    expect(result.valid).toBe(false)
    expect(result.error).toBe(ERROR.INVALID_HEADER_VERSION)
  })
  test('analyze should not succeed for an invalid compression type', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry')
    const result = await schemaregistry.analyzeMessage(Buffer.from(malformedCompression, 'hex'))
    expect(result.valid).toBe(false)
    expect(result.error).toBe(ERROR.INVALID_COMPRESSION)
  })
  test('analyze should throw an error if the schema does not exist', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry')
    const result = await schemaregistry.analyzeMessage(
      Buffer.from(messageWithNotExistingSchema, 'hex'),
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe(ERROR.INVALID_SCHEMA)
  })
})

describe('test error cases', () => {
  test('exception if header is wrong', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry')
    const binmessage = malformedMessage
    expect.assertions(1)
    try {
      await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschema)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      expect(error.message).toMatch('Only header version 3 is supported, received 0')
    }
  })
  test('exception compression byte is wrong', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry')
    const binmessage = malformedCompression
    expect.assertions(1)
    try {
      await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschema)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      expect(error.message).toMatch('Only compression type 0 and 5 are supported, received 1')
    }
  })
})
