import { jest } from '@jest/globals'
import * as avro from 'avsc'

export default class SDKMock {
  private static instance: SDKMock
  private testschema = avro.Type.forSchema({
    type: 'record',
    name: 'property',
    namespace: 'de.meinestadt.test',
    fields: [{ name: 'demo', type: 'string', default: 'Hello World' }],
  })

  mockedRegisterSchemaVersion = jest
    .fn()
    .mockReturnValue({
      promise: () => {
        return {
          SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
        }
      },
    })
    .mockName('registerSchemaVersion')

  mockedGetSchemaVersion = jest
    .fn()
    .mockReturnValue({
      promise: () => {
        return {
          SchemaDefinition: JSON.stringify(this.testschema),
        }
      },
    })
    .mockName('getSchemaVersion')

  mockedCreateSchema = jest
    .fn()
    .mockReturnValue({
      promise: () => {
        return {
          SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225e',
        }
      },
    })
    .mockName('createSchema')

  public clear() {
    this.mockedGetSchemaVersion.mockClear()
    this.mockedRegisterSchemaVersion.mockClear()
    this.mockedCreateSchema.mockClear()
  }

  private constructor() {
    jest.mock('aws-sdk', () => {
      return {
        Glue: jest.fn(() => {
          return {
            registerSchemaVersion: this.mockedRegisterSchemaVersion,
            getSchemaVersion: this.mockedGetSchemaVersion,
            createSchema: this.mockedCreateSchema,
          }
        }),
      }
    })
  }

  public static getInstance() {
    if (!SDKMock.instance) SDKMock.instance = new SDKMock()
    return SDKMock.instance
  }
}

SDKMock.getInstance()
