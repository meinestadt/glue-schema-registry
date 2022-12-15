import * as sdk from 'aws-sdk'
import * as crypto from 'crypto'
import * as uuid from 'uuid'
import * as avro from 'avsc'
import * as zlib from 'zlib'

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

export class GlueSchemaRegistry<T> {
  /*
  This class aims to be compatible with the java serde implementation from AWS.
  https://github.com/awslabs/aws-glue-schema-registry/blob/master/serializer-deserializer/src/main/java/com/amazonaws/services/schemaregistry/serializers/SerializationDataEncoder.java
  https://github.com/awslabs/aws-glue-schema-registry/blob/master/common/src/main/java/com/amazonaws/services/schemaregistry/utils/AWSSchemaRegistryConstants.java
  */
  private gc: sdk.Glue
  registryName: string
  private glueSchemaIdCache: {
    [hash: string]: string
  }
  private avroSchemaCache: {
    [key: string]: avro.Type
  }

  /**
   * Constructs a GlueSchemaRegistry
   *
   * @param registryName - name of the Glue registry you want to use
   * @param props - optional AWS properties that are used when constructing the Glue object from the AWS SDK
   */
  constructor(registryName: string, props?: sdk.Glue.ClientConfiguration) {
    this.gc = new sdk.Glue(props)
    this.registryName = registryName
    this.glueSchemaIdCache = {}
    this.avroSchemaCache = {}
  }

  private async loadGlueSchema(schemaId: string) {
    const existingschema = await this.gc
      .getSchemaVersion({
        SchemaVersionId: schemaId,
      })
      .promise()
    return existingschema
  }

  /**
   * Creates a new schema in the AWS Glue Schema Registry.
   * Note: do not use createSchema if you want to create a new version of an existing schema.
   * Instead use register().
   *
   * @param props - the details about the schema
   * @throws if the schema already exists
   */
  public async createSchema(props: CreateSchemaProps) {
    const res = await this.gc
      .createSchema({
        DataFormat: props.type,
        Compatibility: props.compatibility,
        SchemaName: props.schemaName,
        SchemaDefinition: props.schema,
        RegistryId: {
          RegistryName: this.registryName,
        },
      })
      .promise()
    return res.SchemaVersionId
  }

  /**
   * Registers a new version of an existing schema.
   * Returns the id of the existing schema version if a similar version already exists.
   * Throws an exception if the schema does not exist.
   * Throws an exception if the Glue compatibility check fails.
   *
   * @param props - the details about the schema
   * @returns {string} the id of the schema version.
   */
  async register(props: RegisterSchemaProps): Promise<string> {
    const hash = crypto.createHash('SHA256').update(props.schemaName + '.' + props.schema)
    const hashString = hash.digest('hex').toString()
    const cachehit = this.glueSchemaIdCache[hashString]
    if (cachehit) {
      return cachehit
    }
    const schema = await this.gc
      .registerSchemaVersion({
        SchemaDefinition: props.schema,
        SchemaId: {
          RegistryName: this.registryName,
          SchemaName: props.schemaName,
        },
      })
      .promise()
    if (!schema.SchemaVersionId) throw new Error('Schema does not have SchemaVersionId')
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
  async encode(glueSchemaId: string, object: T, props?: EncodeProps) {
    const ZLIB_COMPRESS_FUNC = (buf: Buffer) => zlib.deflateSync(buf)
    const NO_COMPRESS_FUNC = (buf: Buffer) => buf
    const schema = await this.getAvroSchemaForGlueId(glueSchemaId)
    // construct the message binary
    const buf = schema.toBuffer(object)
    let compression_func = ZLIB_COMPRESS_FUNC
    let compressionbyte = GlueSchemaRegistry.COMPRESSION_ZLIB_BYTE
    if (props?.compress) {
      compression_func = NO_COMPRESS_FUNC
      compressionbyte = GlueSchemaRegistry.COMPRESSION_DEFAULT_BYTE
    }
    const output = Buffer.concat([
      GlueSchemaRegistry.HEADER_VERSION_BYTE,
      compressionbyte,
      this.UUIDstringToByteArray(glueSchemaId),
      compression_func(buf),
    ])
    return output
  }

  /**
   * Decode a message with a specific schema.
   *
   * @param message - Buffer with the binary encoded message
   * @param consumerschema - The Avro schema that should be used to decode the message
   * @returns - the deserialized message as object
   */
  async decode(message: Buffer, consumerschema: avro.Type): Promise<T> {
    const headerversion = message.readInt8(0)
    const compression = message.readInt8(1)
    const ZLIB_UNCOMPRESS_FUNC = zlib.inflateSync
    const NO_UNCOMPRESS_FUNC = (buf: Buffer) => buf

    if (headerversion !== GlueSchemaRegistry.HEADER_VERSION) {
      throw new Error('Only header version 3 is supported, received ' + headerversion)
    }
    if (
      compression !== GlueSchemaRegistry.COMPRESSION_DEFAULT &&
      compression !== GlueSchemaRegistry.COMPRESSION_ZLIB
    ) {
      throw new Error('Only compression type 0 and 5 are supperted, received ' + compression)
    }
    const producerSchemaId = uuid.stringify(message, 2)
    const producerschema = await this.getAvroSchemaForGlueId(producerSchemaId)
    const resolver = this.getResolver(producerschema, consumerschema)
    const content = Buffer.from(message.subarray(18))
    let handlecompression = NO_UNCOMPRESS_FUNC
    if (compression === GlueSchemaRegistry.COMPRESSION_ZLIB) {
      handlecompression = ZLIB_UNCOMPRESS_FUNC
    }
    return consumerschema.fromBuffer(handlecompression(content), resolver)
  }

  private async getAvroSchemaForGlueId(id: string) {
    const cacheHit = this.avroSchemaCache[id]
    if (cacheHit) return cacheHit
    const schemastring = (await this.loadGlueSchema(id)).SchemaDefinition
    if (!schemastring) throw new Error('Glue returned undefined schema definition')
    const schema = avro.Type.forSchema(JSON.parse(schemastring))
    this.avroSchemaCache[id] = schema
    return schema
  }

  private UUIDstringToByteArray(id: string) {
    const SCHEMA_VERSION_ID_SIZE = 16
    const idasbytes = uuid.parse(id)
    const a = new Uint8Array(SCHEMA_VERSION_ID_SIZE)
    for (let x = 0; x < SCHEMA_VERSION_ID_SIZE; x++) {
      a[x] = idasbytes[x]
    }
    return a
  }

  private getResolver(producerschema: avro.Type, consumerschema: avro.Type) {
    const resolver = consumerschema.createResolver(producerschema)
    return resolver
  }

  private static initByteBuffer(value: number) {
    const buffer = Buffer.alloc(1)
    buffer.writeInt8(value, 0)
    return buffer
  }
}
