import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals'
import * as avro from 'avsc'
import * as protobuf from 'protobufjs'
import { ERROR, GlueSchemaRegistry, SchemaCompatibilityType, SchemaType } from '../src'
import * as GlueClientMock from './__mocks__/@aws-sdk/client-glue'

jest.mock('@aws-sdk/client-glue')

interface TestType {
  demo: string
}

interface TestTypeV2 {
  demo: string
  v2demo: string
}

const testavroschema = avro.Type.forSchema({
  type: 'record',
  name: 'property',
  namespace: 'de.meinestadt.test',
  fields: [{ name: 'demo', type: 'string', default: 'Hello World' }],
})

const testavroschemaV2 = avro.Type.forSchema({
  type: 'record',
  name: 'property',
  namespace: 'de.meinestadt.test',
  fields: [
    { name: 'demo', type: 'string', default: 'Hello World' },
    { name: 'v2demo', type: 'string', default: 'Meinestadt' },
  ],
})

const testprotobufschema = `
syntax = "proto2";

package de.meinestadt.test;

message property {
  optional string demo = 1 [default="Hello World"];
}
`

const testprotobufschemaV2 = `
syntax = "proto2";

package de.meinestadt.test;

message property {
  optional string demo = 1 [default="Hello World"];
  optional string v2demo = 2 [default="Meinestadt"];
}
`
const testprotobufschemaType = protobuf.parse(testprotobufschema).root.lookup('de.meinestadt.test.property')


// const sdkmock = SDKMock.getInstance()

// valid message with gzip compressed content
const compressedAvroHelloWorld =
  '0305b7912285527d42de88eee389a763225f789c93f048cdc9c95728cf2fca495104001e420476'
const compressedProtobufHelloWorld =
  '0305c7912285527d42de88eee389a763225e789ce3e2f148cdc9c95728cf2fca495104001e330474'
  
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
    GlueClientMock.CreateSchemaCommand.mockResolvedValue({
      $metadata: {
        httpStatusCode: 200,
      },
    })
    await schemaregistry.createSchema({
      schema: JSON.stringify(testavroschemaV2),
      schemaName: 'Testschema',
      compatibility: SchemaCompatibilityType.BACKWARD,
      type: SchemaType.AVRO,
    })
    await schemaregistry.createSchema({
      schema: JSON.stringify(testprotobufschemaV2),
      schemaName: 'Testprotobufschema',
      compatibility: SchemaCompatibilityType.BACKWARD,
      type: SchemaType.PROTOBUF,
    })
    expect(GlueClientMock.send).toBeCalledTimes(2)
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

  test('serialization - avro', async () => {
    GlueClientMock.RegisterSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
    })
    schemaId = await schemaregistry.register({
      schema: JSON.stringify(testavroschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const bindata = await schemaregistry.encode(schemaId, {
      demo: 'Hello world!',
    })
    const binmessage = bindata.toString('hex')
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(binmessage).toBe(compressedAvroHelloWorld)
  })

  test('serialization - protobuf', async () => {
    GlueClientMock.RegisterSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      SchemaVersionId: 'c7912285-527d-42de-88ee-e389a763225e',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
    })
    schemaId = await schemaregistry.register({
      schema: testprotobufschema,
      schemaName: 'property',
      type: SchemaType.PROTOBUF,
    })
    const bindata = await schemaregistry.encode(schemaId, {
      demo: 'Hello world!',
    })
    const binmessage = bindata.toString('hex')
    expect(GlueClientMock.send).toBeCalledTimes(1)
    console.log(binmessage);
    expect(binmessage).toBe(compressedProtobufHelloWorld)
  })

  test('deserialization - avro with newly registered schema', async () => {
    GlueClientMock.RegisterSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
    })
    schemaId = await schemaregistry.register({
      schema: JSON.stringify(testavroschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const binmessage = compressedAvroHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testavroschema)
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(object.demo).toBe('Hello world!')
  })

  test('deserialization - protobuf with newly registered schema', async () => {
    GlueClientMock.RegisterSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      SchemaVersionId: 'c7912285-527d-42de-88ee-e389a763225e',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
    })
    schemaId = await schemaregistry.register({
      schema: testprotobufschema,
      schemaName: 'property',
      type: SchemaType.PROTOBUF,
    })
    const binmessage = compressedProtobufHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'))
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(object.demo).toBe('Hello world!')
  })

  test('deserialization with avro schema from registry', async () => {
    GlueClientMock.GetSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
      SchemaDefinition: JSON.stringify(testavroschema),
      DataFormat: 'AVRO',
    })
    const binmessage = compressedAvroHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testavroschema)
    expect(GlueClientMock.GetSchemaVersionCommand).toBeCalledTimes(1)
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(object.demo).toBe('Hello world!')
  })

  test('deserialization with protobuf schema from registry', async () => {
    GlueClientMock.GetSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
      SchemaVersionId: 'c7912285-527d-42de-88ee-e389a763225e',
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
      SchemaDefinition: testprotobufschema,
      DataFormat: 'PROTOBUF',
    })
    const binmessage = compressedProtobufHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'))
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
    GlueClientMock.reset()
    GlueClientMock.RegisterSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
    })
  })
  beforeEach(async () => {
    GlueClientMock.clear()
  })
  test('deserialization with schema evolution', async () => {
    const schemaId = await schemaregistry.register({
      schema: JSON.stringify(testavroschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const binmessage = compressedAvroHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testavroschemaV2)
    expect(GlueClientMock.send).toBeCalledTimes(1)
    expect(object.demo).toBe('Hello world!')
    expect(schemaId).toBe('b7912285-527d-42de-88ee-e389a763225f')
    expect(object.v2demo).toBe('Meinestadt')
  })

  test('deserialization with cache', async () => {
    GlueClientMock.GetSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
      SchemaDefinition: JSON.stringify(testavroschema),
    })

    const binmessage = compressedAvroHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testavroschemaV2)
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
    GlueClientMock.reset()
    GlueClientMock.RegisterSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
    })
  })
  beforeEach(async () => {
    GlueClientMock.clear()
  })
  test('serialization', async () => {
    const schemaId = await schemaregistry.register({
      schema: JSON.stringify(testavroschema),
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
      schema: JSON.stringify(testavroschema),
      schemaName: 'Testschema',
      type: SchemaType.AVRO,
    })
    const binmessage = uncompressedHelloWorld
    const object = await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testavroschema)
    // expect that mockRegisterSchemaVersion was not called, otherwise the cache wouldn't work
    expect(GlueClientMock.RegisterSchemaVersionCommand).toBeCalledTimes(0)
    expect(object.demo).toBe('Hello world!')
  })
})

describe('test analyze message', () => {
  beforeAll(async () => {
    GlueClientMock.reset()
    GlueClientMock.GetSchemaVersionCommand.mockResolvedValue({
      VersionNumber: 1,
      Status: 'AVAILABLE',
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
      SchemaDefinition: JSON.stringify(testavroschema),
    })
  })
  test('analyze should succeed for a valid message', async () => {
    const schemaregistry = new GlueSchemaRegistry<TestTypeV2>('testregistry', {
      region: 'eu-central-1',
    })
    const result = await schemaregistry.analyzeMessage(Buffer.from(compressedAvroHelloWorld, 'hex'))
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
      $metadata: {
        httpStatusCode: 200,
        requestId: '12345678901234567890123456789012',
      },
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
  beforeAll(async () => {
    GlueClientMock.reset()
  })
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
      await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testavroschema)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      expect(error.message).toMatch('Only header version 3 is supported, received 0')
    }
  })
  test('exception compression byte is wrong', async () => {
    const binmessage = malformedCompression
    expect.assertions(1)
    try {
      await schemaregistry.decode(Buffer.from(binmessage, 'hex'), testavroschema)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      expect(error.message).toMatch('Only compression type 0 and 5 are supported, received 1')
    }
  })
})
