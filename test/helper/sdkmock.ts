import { jest } from '@jest/globals'
import * as avro from 'avsc'
import sdktypes from '@aws-sdk/types/dist-types/command'
/**
 * Singleton providing a mock of the AWS SDK with some Glue functions.
 */
export default class SDKMock {
  private static instance: SDKMock
  private testschema = avro.Type.forSchema({
    type: 'record',
    name: 'property',
    namespace: 'de.meinestadt.test',
    fields: [{ name: 'demo', type: 'string', default: 'Hello World' }],
  })

  mockedRegisterSchemaVersion = jest.fn(() => {
    return {
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
    }
  })

  mockedGetSchemaVersion = jest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .fn((arg: any) => {
      if (arg.SchemaVersionId === '00000000-0000-0000-0000-000000000000') {
        return {
          Status: 'FAILURE',
        }
      }
      return {
        SchemaDefinition: JSON.stringify(this.testschema),
        SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
      }
    })
    .mockName('getSchemaVersion')

  mockedCreateSchema = jest.fn(() => {
    return {
      SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225e',
      SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedSend = jest.fn().mockImplementation((command: any) => {
    return command
  })

  /**
   * Calls mockClear on all mocked functions.
   */
  public clear() {
    this.mockedGetSchemaVersion.mockClear()
    this.mockedRegisterSchemaVersion.mockClear()
    this.mockedCreateSchema.mockClear()
    this.mockedSend.mockClear()
  }

  private constructor() {
    jest.mock('@aws-sdk/client-glue', () => {
      return {
        GlueClient: jest.fn(() => {
          return {
            registerSchemaVersion: this.mockedRegisterSchemaVersion,
            getSchemaVersion: this.mockedGetSchemaVersion,
            createSchema: this.mockedCreateSchema,
            send: this.mockedSend,
          }
        }),
        RegisterSchemaVersionCommand: this.mockedRegisterSchemaVersion,
        CreateSchemaCommand: this.mockedCreateSchema,
        GetSchemaVersionCommand: this.mockedGetSchemaVersion,
      }
    })
  }

  /**
   * @returns the instance of the SDKMock class
   */
  public static getInstance() {
    if (!SDKMock.instance) SDKMock.instance = new SDKMock()
    return SDKMock.instance
  }
}

SDKMock.getInstance()
