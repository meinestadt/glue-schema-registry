import { jest } from '@jest/globals'
import * as avro from 'avsc'

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

  mockedRegisterSchemaVersion = jest
    .fn()
    .mockReturnValue({
      promise: () => {
        return {
          SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225f',
          SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
        }
      },
    })
    .mockName('registerSchemaVersion')

  mockedGetSchemaVersion = jest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .fn((arg: any) => {
      if (arg.SchemaVersionId === '00000000-0000-0000-0000-000000000000') {
        return {
          promise: () => {
            return {
              Status: 'FAILURE',
            }
          },
        }
      }
      return {
        promise: () => {
          return {
            SchemaDefinition: JSON.stringify(this.testschema),
            SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
          }
        },
      }
    })
    .mockName('getSchemaVersion')

  mockedCreateSchema = jest
    .fn()
    .mockReturnValue({
      promise: () => {
        return {
          SchemaVersionId: 'b7912285-527d-42de-88ee-e389a763225e',
          SchemaArn: 'arn:aws:glue:eu-central-1:123456789012:schema/testregistry/Testschema',
        }
      },
    })
    .mockName('createSchema')

  /**
   * Calls mockClear on all mocked functions.
   */
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

  /**
   * @returns the instance of the SDKMock class
   */
  public static getInstance() {
    if (!SDKMock.instance) SDKMock.instance = new SDKMock()
    return SDKMock.instance
  }
}

SDKMock.getInstance()
