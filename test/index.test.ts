import { describe, expect, test, beforeAll, beforeEach, jest } from '@jest/globals'
import { ERROR, GlueSchemaRegistry, SchemaCompatibilityType, SchemaType } from '../src'
import * as avro from 'avsc'
import { GlueClient } from '@aws-sdk/client-glue'
import * as GlueClientMock from './__mocks__/@aws-sdk/client-glue'

jest.mock('@aws-sdk/client-glue')

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

// const sdkmock = SDKMock.getInstance()

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
  let schemaregistry: GlueSchemaRegistry<TestType>
  beforeAll(async () => {
    GlueClientMock.GlueClient.mockClear()
    schemaregistry = new GlueSchemaRegistry<TestType>('testregistry', {
      region: 'eu-central-1',
    })
  })
  test('create schema', async () => {
    // sdkmock.mockedCreateSchema.mockResolvedValue({})
    GlueClientMock.CreateSchemaCommand.mockResolvedValue({})
    await schemaregistry.createSchema({
      schema: JSON.stringify(testschemaV2),
      schemaName: 'Testschema',
      compatibility: SchemaCompatibilityType.BACKWARD,
      type: SchemaType.AVRO,
    })
    expect(GlueClientMock.send).toBeCalledTimes(1)
  })
})

describe('serde with compression', () => {
  let schemaregistry: GlueSchemaRegistry<TestType>
  let schemaId: string

  beforeEach(async () => {
    schemaregistry = new GlueSchemaRegistry<TestType>('testregistry', {
      region: 'eu-central-1',
    })
    GlueClientMock.clear()
  })

  test('serialization', async () => {
    GlueClientMock.RegisterSchemaVersionCommand.mockResolvedValue({
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
    })
    schemaId = await schemaregistry.register({
      schema: JSON.stringify(testschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const bindata = await schemaregistry.encode(schemaId, {
      demo: 'Hello world!',
    })
    const binmessage = bindata.toString('hex')
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(binmessage).toBe(compressedHelloWorld)
  })

  test('deserialization with newly registered schema', async () => {
    GlueClientMock.RegisterSchemaVersionCommand.mockResolvedValue({
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
    })
    schemaId = await schemaregistry.register({
      schema: JSON.stringify(testschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const binmessage = compressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschema)
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(object.demo).toBe('Hello world!')
  })

  test('deserialization with schema from registry', async () => {
    GlueClientMock.GetSchemaVersionCommand.mockResolvedValue({
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
      SchemaDefinition: JSON.stringify(testschema),
    })
    const binmessage = compressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschema)
    expect(GlueClientMock.GetSchemaVersionCommand).toBeCalledTimes(1)
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(object.demo).toBe('Hello world!')
  })
})

describe('serde with schema evolution', () => {
  let schemaregistry: GlueSchemaRegistry<TestTypeV2>
  beforeAll(async () => {
    schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry', {
      region: 'eu-central-1',
    })
  })
  beforeEach(async () => {
    GlueClientMock.clear()
  })
  test('deserialization with schema evolution', async () => {
    const schemaId = await schemaregistry.register({
      schema: JSON.stringify(testschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const binmessage = compressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschemaV2)
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(object.demo).toBe('Hello world!')
    expect(object.v2demo).toBe('Meinestadt')
  })

  test('deserialization with cache', async () => {
    GlueClientMock.GetSchemaVersionCommand.mockResolvedValue({
      SchemaDefinition: JSON.stringify(testschema),
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
    })

    const binmessage = compressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschemaV2)
    // expect to have no calls to the schema registry as the schema should be cached from the previos test
    expect(GlueClientMock.send).toBeCalledTimes(0)
    expect(object.demo).toBe('Hello world!')
    expect(object.v2demo).toBe('Meinestadt')
  })
})

describe('serde without compression', () => {
  let schemaregistry: GlueSchemaRegistry<TestType>

  beforeAll(async () => {
    schemaregistry = new GlueSchemaRegistry<TestType>('testregistry', {
      region: 'eu-central-1',
    })
  })
  beforeEach(async () => {
    GlueClientMock.clear()
  })
  test('serialization', async () => {
    const schemaId = await schemaregistry.register({
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
    expect(GlueClientMock.RegisterSchemaVersionCommand).toBeCalledTimes(1)
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(binmessage).toBe(uncompressedHelloWorld)
  })

  test('deserialization', async () => {
    const schemaId = await schemaregistry.register({
      schema: JSON.stringify(testschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const binmessage = uncompressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testschema)
    // expect that mockRegisterSchemaVersion was not called, otherwise the cache wouldn't work
    expect(GlueClientMock.RegisterSchemaVersionCommand).toBeCalledTimes(0)
    expect(object.demo).toBe('Hello world!')
  })
})

describe('test analyze message', () => {
  test('analyze should succeed for a valid message', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry', {
      region: 'eu-central-1',
    })
    const result = await schemaregistry.analyzeMessage(Buffer.from(compressedHelloWorld, 'hex'))
    expect(result.valid).toBe(true)
    expect(result.compression).toBe(GlueSchemaRegistry.COMPRESSION_ZLIB)
    expect(result.schemaId).toBe('b7912285-527d-42de-88ee-e389a763225f')
    expect(result.schema?.SchemaArn).toBe(
      'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
    )
  })
  test('analyze should not succeed for an invalid message', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry', {
      region: 'eu-central-1',
    })
    const result = await schemaregistry.analyzeMessage(Buffer.from(malformedMessage, 'hex'))
    expect(result.valid).toBe(false)
    expect(result.error).toBe(ERROR.INVALID_HEADER_VERSION)
  })
  test('analyze should not succeed for an invalid compression type', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry', {
      region: 'eu-central-1',
    })
    const result = await schemaregistry.analyzeMessage(Buffer.from(malformedCompression, 'hex'))
    expect(result.valid).toBe(false)
    expect(result.error).toBe(ERROR.INVALID_COMPRESSION)
  })
  test('analyze should throw an error if the schema does not exist', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry', {
      region: 'eu-central-1',
    })
    GlueClientMock.GetSchemaVersionCommand.mockResolvedValue({
      Status: 'FAILURE',
    })
    const result = await schemaregistry.analyzeMessage(
      Buffer.from(messageWithNotExistingSchema, 'hex'),
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBe(ERROR.INVALID_SCHEMA)
  })
})

describe('test error cases', () => {
  let schemaregistry: GlueSchemaRegistry<TestType>
  beforeEach(async () => {
    schemaregistry = new GlueSchemaRegistry<TestType>('testregistry', {
      region: 'eu-central-1',
    })
    GlueClientMock.clear()
  })
  test('exception if header is wrong', async () => {
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
