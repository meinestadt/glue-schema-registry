import * as crypto from 'crypto'
import * as uuid from 'uuid'
import * as avro from 'avsc'
import * as zlib from 'zlib'
import * as gluesdk from '@aws-sdk/client-glue'

export enum SchemaType {
  AVRO = 'AVRO',
}
export interface RegisterSchemaProps {
  type: SchemaType
  schemaName: string
  schema: string
}
export enum SchemaCompatibilityType {
  NONE = 'NONE',
  BACKWARD = 'BACKWARD',
  BACKWARD_ALL = 'BACKWARD_ALL',
  DISABLED = 'DISABLED',
  FORWARD = 'FORWARD',
  FORWARD_ALL = 'FORWARD_ALL',
  FULL = 'FULL',
  FULL_ALL = 'FULL_ALL',
}
export interface CreateSchemaProps {
  type: SchemaType
  schemaName: string
  compatibility: SchemaCompatibilityType
  schema: string
}
export interface EncodeProps {
  compress: boolean
}

export enum ERROR {
  NO_ERROR = 0,
  INVALID_HEADER_VERSION = 1,
  INVALID_COMPRESSION = 2,
  INVALID_SCHEMA_ID = 3,
  INVALID_SCHEMA = 4,
}

export type AnalyzeMessageResult = {
  /**
   * true if the message is valid
   */
  valid: boolean
  /**
   * the error code, if valid is false, otherwise undefined
   */
  error?: ERROR
  /** the original exception, if available */
  exception?: unknown
  /**
   * the header version
   */
  headerversion?: number
  /**
   * the compression type, may be 0 (none) or 5 (gzip)
   */
  compression?: number
  /**
   * the uuid of the schema
   */
  schemaId?: string
  /**
   * the glue schema
   */
  schema?: gluesdk.GetSchemaVersionResponse
}

class PromiseDispatcher {
  private active = 0
  private queue: Array<() => void> = []
  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

export class GlueSchemaRegistry {
  /*
  This class aims to be compatible with the java serde implementation from AWS.
  https://github.com/awslabs/aws-glue-schema-registry/blob/master/serializer-deserializer/src/main/java/com/amazonaws/services/schemaregistry/serializers/SerializationDataEncoder.java
  https://github.com/awslabs/aws-glue-schema-registry/blob/master/common/src/main/java/com/amazonaws/services/schemaregistry/utils/AWSSchemaRegistryConstants.java
  */
  private gc: gluesdk.GlueClient
  public readonly registryName: string

  private glueSchemaIdCache: {
    [hash: string]: string
  }
  private avroSchemaCache: {
    [key: string]: avro.Type
  }

  private runningGlueSchemaLoads = new Map<string, Promise<gluesdk.GetSchemaVersionResponse>>()
  private limiter: PromiseDispatcher

  /**
   * Constructs a GlueSchemaRegistry
   *
   * @param registryName - name of the Glue registry you want to use
   * @param props - optional AWS properties that are used when constructing the Glue object from the AWS SDK
   * @param maxConcurrentGlueCalls - optional maximum number of concurrent calls to the Glue service. Defaults to 1.
   */
  constructor(registryName: string, props: gluesdk.GlueClientConfig, maxConcurrentGlueCalls = 1) {
    this.gc = new gluesdk.GlueClient(props)
    this.registryName = registryName
    this.glueSchemaIdCache = {}
    this.avroSchemaCache = {}
    this.limiter = new PromiseDispatcher(Math.max(1, maxConcurrentGlueCalls))
  }

  /**
   * Updates the Glue client. Useful if you need to update the credentials, for example.
   *
   * @param props settings for the AWS Glue client
   */
  updateGlueClient(props: gluesdk.GlueClientConfig) {
    this.gc = new gluesdk.GlueClient(props)
  }

  private async loadGlueSchema(schemaId: string) {
    const existing = this.runningGlueSchemaLoads.get(schemaId)
    if (existing) return existing
    const p = this.limiter.run(() =>
      this.gc.send(
        new gluesdk.GetSchemaVersionCommand({
          SchemaVersionId: schemaId,
        }),
      ),
    )

    this.runningGlueSchemaLoads.set(schemaId, p)

    try {
      const res = await p
      return res
    } finally {
      this.runningGlueSchemaLoads.delete(schemaId)
    }
  }

  /**
   *
   * Creates a new schema in the glue schema registry.
   *
   * Throws if a SchemaVersionStatus in the response equals 'FAILURE'.
   * @param props
   * @returns the id of the created schema version
   */
  async createSchema(props: CreateSchemaProps) {
    const res = await this.limiter.run(() =>
      this.gc.send(
        new gluesdk.CreateSchemaCommand({
          DataFormat: props.type,
          Compatibility: props.compatibility,
          SchemaName: props.schemaName,
          SchemaDefinition: props.schema,
          RegistryId: { RegistryName: this.registryName },
        }),
      ),
    )
    if (res.SchemaVersionStatus === 'FAILURE') throw new Error('Schema registration failure')
    return res.SchemaVersionId
  }

  /**
   * Registers a new version of an existing schema.
   * Returns the id of the existing schema version if a similar version already exists.
   *
   * @param props - the details about the schema
   * @returns {string} the id of the schema version
   * @throws if the schema does not exist
   * @throws if the Glue compatibility check fails
   */
  async register(props: RegisterSchemaProps): Promise<string> {
    const hash = crypto.createHash('SHA256').update(props.schemaName + '.' + props.schema)
    const hashString = hash.digest('hex').toString()
    const cachehit = this.glueSchemaIdCache[hashString]
    if (cachehit) {
      return cachehit
    }
    const schema = await this.gc.send(
      new gluesdk.RegisterSchemaVersionCommand({
        SchemaDefinition: props.schema,
        SchemaId: {
          RegistryName: this.registryName,
          SchemaName: props.schemaName,
        },
      }),
    )
    if (!schema.SchemaVersionId) throw new Error('Schema does not have SchemaVersionId')
    if (schema.Status === 'FAILURE') throw new Error('Schema registration failure')
    this.glueSchemaIdCache[hashString] = schema.SchemaVersionId
    // store the avro schema in its cache to avoid another glue lookup when it's used
    const avroSchema = avro.Type.forSchema(JSON.parse(props.schema))
    this.avroSchemaCache[schema.SchemaVersionId] = avroSchema
    return schema.SchemaVersionId
  }

  static COMPRESSION_DEFAULT = 0
  static COMPRESSION_ZLIB = 5
  static HEADER_VERSION = 3
  private static HEADER_VERSION_BYTE = GlueSchemaRegistry.initByteBuffer(
    GlueSchemaRegistry.HEADER_VERSION,
  ) // default version 3
  private static COMPRESSION_DEFAULT_BYTE = GlueSchemaRegistry.initByteBuffer(
    GlueSchemaRegistry.COMPRESSION_DEFAULT, // no compression
  )
  private static COMPRESSION_ZLIB_BYTE = GlueSchemaRegistry.initByteBuffer(
    GlueSchemaRegistry.COMPRESSION_ZLIB,
  )

  /**
   * Encode the object with a specific glue schema version
   *
   * @param glueSchemaId - UUID of the Glue schema version that should be used to encode the message
   * @param object - the object to encode
   * @param props - optional encoding options
   * @returns - a Buffer containing the binary message
   */
  async encode<T>(glueSchemaId: string, object: T, props?: EncodeProps) {
    const ZLIB_COMPRESS_FUNC = (buf: Buffer): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        zlib.deflate(buf, (err, data) => {
          if (err) {
            reject(err)
          } else {
            resolve(data)
          }
        })
      })
    }
    const NO_COMPRESS_FUNC = (buf: Buffer): Promise<Buffer> =>
      new Promise((resolve) => {
        resolve(buf)
      })
    const schema = await this.getAvroSchemaForGlueId(glueSchemaId)
    // construct the message binary
    const buf = schema.toBuffer(object)
    let compression_func = ZLIB_COMPRESS_FUNC
    let compressionbyte = GlueSchemaRegistry.COMPRESSION_ZLIB_BYTE
    if (props && !props.compress) {
      compression_func = NO_COMPRESS_FUNC
      compressionbyte = GlueSchemaRegistry.COMPRESSION_DEFAULT_BYTE
    }
    const output = Buffer.concat([
      GlueSchemaRegistry.HEADER_VERSION_BYTE,
      compressionbyte,
      this.UUIDstringToByteArray(glueSchemaId),
      await compression_func(buf),
    ])
    return output
  }

  /**
   * Analyze the binary message to determine if it is valid and if so, what schema version it was encoded with.
   *
   * @param message - the binary message to analyze
   * @returns - an object containing the analysis results @see AnalyzeMessageResult
   */
  async analyzeMessage(message: Buffer): Promise<AnalyzeMessageResult> {
    const headerversion = message.readInt8(0)
    if (headerversion !== GlueSchemaRegistry.HEADER_VERSION) {
      return {
        valid: false,
        error: ERROR.INVALID_HEADER_VERSION,
      }
    }
    const compression = message.readInt8(1)
    if (
      compression !== GlueSchemaRegistry.COMPRESSION_DEFAULT &&
      compression !== GlueSchemaRegistry.COMPRESSION_ZLIB
    ) {
      return {
        valid: false,
        error: ERROR.INVALID_COMPRESSION,
      }
    }
    try {
      const producerSchemaId = uuid.stringify(message, 2)
      try {
        const producerschema = await this.loadGlueSchema(producerSchemaId)
        if (!producerschema) throw new Error('Schema not found')
        if (producerschema.Status === 'FAILURE') {
          return {
            valid: false,
            error: ERROR.INVALID_SCHEMA,
          }
        }
        return {
          valid: true,
          headerversion,
          compression,
          schemaId: producerSchemaId,
          schema: producerschema,
        }
      } catch (e) {
        return {
          valid: false,
          exception: e,
          error: ERROR.INVALID_SCHEMA,
        }
      }
    } catch (e) {
      return {
        valid: false,
        exception: e,
        error: ERROR.INVALID_SCHEMA_ID,
      }
    }
  }

  /**
   * Decode a message with a specific schema.
   *
   * @param message - Buffer with the binary encoded message
   * @param consumerschema - The Avro schema that should be used to decode the message
   * @returns - the deserialized message as object
   */
  async decode<T>(message: Buffer, consumerschema: avro.Type): Promise<T> {
    const headerversion = message.readInt8(0)
    const compression = message.readInt8(1)
    if (headerversion !== GlueSchemaRegistry.HEADER_VERSION) {
      throw new Error(
        `Only header version ${GlueSchemaRegistry.HEADER_VERSION} is supported, received ${headerversion}`,
      )
    }
    if (
      compression !== GlueSchemaRegistry.COMPRESSION_DEFAULT &&
      compression !== GlueSchemaRegistry.COMPRESSION_ZLIB
    ) {
      throw new Error(`Only compression type 0 and 5 are supported, received ${compression}`)
    }
    const ZLIB_UNCOMPRESS_FUNC = (buf: Buffer): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        zlib.inflate(buf, (err, data) => {
          if (err) {
            reject(err)
          } else {
            resolve(data)
          }
        })
      })
    }
    const NO_UNCOMPRESS_FUNC = (buf: Buffer): Promise<Buffer> =>
      new Promise((resolve) => {
        resolve(buf)
      })
    const producerSchemaId = uuid.stringify(message, 2)
    const producerschema = await this.getAvroSchemaForGlueId(producerSchemaId)
    const resolver = this.getResolver(producerschema, consumerschema)
    const content = Buffer.from(message.subarray(18))
    let handlecompression = NO_UNCOMPRESS_FUNC
    if (compression === GlueSchemaRegistry.COMPRESSION_ZLIB) {
      handlecompression = ZLIB_UNCOMPRESS_FUNC
    }
    return consumerschema.fromBuffer(await handlecompression(content), resolver)
  }

  private async getAvroSchemaForGlueId(id: string) {
    if (this.avroSchemaCache[id]) return this.avroSchemaCache[id]
    const schemastring = (await this.loadGlueSchema(id)).SchemaDefinition
    if (!schemastring) throw new Error('Glue returned undefined schema definition')
    const schema = avro.Type.forSchema(JSON.parse(schemastring))
    this.avroSchemaCache[id] = schema
    return schema
  }

  private UUIDstringToByteArray(id: string) {
    const idasbytes = uuid.parse(id)
    return new Uint8Array(idasbytes)
  }
  private getResolver(producerschema: avro.Type, consumerschema: avro.Type) {
    return consumerschema.createResolver(producerschema)
  }
  private static initByteBuffer(value: number) {
    return Buffer.from([value])
  }
}
