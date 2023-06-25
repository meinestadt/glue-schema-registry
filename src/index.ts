import * as gluesdk from '@aws-sdk/client-glue'
import * as avro from 'avsc'
import * as crypto from 'crypto'
import * as protobuf from 'protobufjs'
import * as uuid from 'uuid'
import * as zlib from 'zlib'


export enum SchemaType {
  AVRO = 'AVRO',
  PROTOBUF = 'PROTOBUF',
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

export class GlueSchemaRegistry<T extends { [k: string]: any; }> {
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
  private protobufSchemaCache: {
    [key: string]: any
  }

  /**
   * Constructs a GlueSchemaRegistry
   *
   * @param registryName - name of the Glue registry you want to use
   * @param props - optional AWS properties that are used when constructing the Glue object from the AWS SDK
   */
  constructor(registryName: string, props: gluesdk.GlueClientConfig) {
    this.gc = new gluesdk.GlueClient(props)
    this.registryName = registryName
    this.glueSchemaIdCache = {}
    this.avroSchemaCache = {}
    this.protobufSchemaCache = {};
  }

  /**
   * Updates the Glue client. Useful if you need to update the credentials, for example.
   *
   * @param props settings for the AWS Glue client
   */
  public updateGlueClient(props: gluesdk.GlueClientConfig) {
    this.gc = new gluesdk.GlueClient(props)
  }

  private async loadGlueSchema(schemaId: string) {
    const existingschema = await this.gc.send(
      new gluesdk.GetSchemaVersionCommand({
        SchemaVersionId: schemaId,
      }),
    )
    if (!existingschema.SchemaDefinition) throw new Error('Glue returned undefined schema definition')
    return existingschema
  }

  /**
   * Creates a new schema in the AWS Glue Schema Registry.
   * Note: do not use createSchema if you want to create a new version of an existing schema.
   * Instead use register().
   *
   * @param props - the details about the schema
   * @throws if the schema already exists
   * @throws if the Glue compatibility check fails
   */
  public async createSchema(props: CreateSchemaProps) {
    const res = await this.gc.send(
      new gluesdk.CreateSchemaCommand({
        DataFormat: props.type,
        Compatibility: props.compatibility,
        SchemaName: props.schemaName,
        SchemaDefinition: props.schema,
        RegistryId: {
          RegistryName: this.registryName,
        },
      }),
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
    if (props.type == SchemaType.AVRO) {
      // store the avro schema in its cache to avoid another glue lookup when it's used
      const avroSchema = avro.Type.forSchema(JSON.parse(props.schema))
      this.avroSchemaCache[schema.SchemaVersionId] = avroSchema
    } else if (props.type == SchemaType.PROTOBUF) {
      const parsedMessage = protobuf.parse(props.schema)
      const root = parsedMessage.root
      const protobufSchema = root.lookupType(
        this.getTypeName(
          parsedMessage, { 
            messageName: props.schemaName 
          }))
      this.protobufSchemaCache[schema.SchemaVersionId] = protobufSchema
    }
    return schema.SchemaVersionId
  }

  private getNestedTypeName(parent : { [k: string]: protobuf.ReflectionObject } | undefined) : string {
      if (!parent)
          throw new Error('Invalid parent');
      const keys = Object.keys(parent);
      const reflection = parent[keys[0]];
      // Traverse down the nested Namespaces until we find a message Type instance (which extends Namespace)
      if (reflection instanceof protobuf.Namespace && !(reflection instanceof protobuf.Type) && reflection.nested)
          return this.getNestedTypeName(reflection.nested);
      return keys[0];
  }
  private getTypeName(parsedMessage : protobuf.IParserResult, opts : { messageName? : string } = {}) {
      const root = parsedMessage.root;
      const pkg = parsedMessage.package;
      const name = opts && opts.messageName ? opts.messageName : this.getNestedTypeName(root.nested);
      return `${pkg ? pkg + '.' : ''}.${name}`;
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
    const schema = await this.getSchemaForGlueId(glueSchemaId)
    // construct the message binary
    let buf : Buffer
    if (schema instanceof avro.Type) {
      buf = schema.toBuffer(object)
    } else if (schema instanceof protobuf.Type) {
      const protoPayload = schema.create(object)
      buf = Buffer.from(schema.encode(protoPayload).finish())
    } else {
      throw new Error('Unsupported schema type')
    }
    
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
          error: ERROR.INVALID_SCHEMA,
        }
      }
    } catch (e) {
      return {
        valid: false,
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
  async decode(message: Buffer, consumerschema: avro.Type | undefined = undefined): Promise<T> {
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
    const producerschema = await this.getSchemaForGlueId(producerSchemaId)
    const content = Buffer.from(message.subarray(18))
    let handlecompression = NO_UNCOMPRESS_FUNC
    if (compression === GlueSchemaRegistry.COMPRESSION_ZLIB) {
      handlecompression = ZLIB_UNCOMPRESS_FUNC
    }
    if (consumerschema instanceof avro.Type) {
      const resolver = this.getResolver(producerschema, consumerschema)
      return consumerschema.fromBuffer(await handlecompression(content), resolver)
    } else {
      // protobuf is backward compatible
      return producerschema.decode(await handlecompression(content))
    }
  }

  /**
   * Retrieve the latest version of a schema from the AWS Glue Schema Registry, 
   * returning the schema version id.
   * @param schemaName Fully qualified schema name, e.g. com.example.MySchema
   * @returns string Glue SchemaVersionId
   */
  async getLatestSchemaId(schemaName: string): Promise<string> {
    const schema = await this.gc.send(
      new gluesdk.GetSchemaVersionCommand({
        SchemaId: {
          RegistryName: this.registryName,
          SchemaName: schemaName,
        },
        SchemaVersionNumber: {
          LatestVersion: true,
        },
      }),
    )
    if (!schema.SchemaVersionId) throw new Error('Glue loaded a schema without a SchemaVersionId')
    this.cacheGlueSchema(schema.SchemaVersionId, schema)
    return schema.SchemaVersionId
  }

  private async getSchemaForGlueId(id: string) {
    if (this.avroSchemaCache[id]) return this.avroSchemaCache[id]
    if (this.protobufSchemaCache[id]) return this.protobufSchemaCache[id]
    
    const glueSchema = await this.loadGlueSchema(id)
    this.cacheGlueSchema(id, glueSchema);

    if (this.avroSchemaCache[id]) return this.avroSchemaCache[id]
    if (this.protobufSchemaCache[id]) return this.protobufSchemaCache[id]
  }

  private cacheGlueSchema(id: string, glueSchema: gluesdk.GetSchemaVersionResponse) {
    const schemastring = glueSchema.SchemaDefinition
    if (glueSchema.DataFormat == SchemaType.AVRO) {
      const schema = avro.Type.forSchema(JSON.parse(schemastring))
      this.avroSchemaCache[id] = schema
    } else if (glueSchema.DataFormat == SchemaType.PROTOBUF) {
      const parsedMessage = protobuf.parse(schemastring)
      const root = parsedMessage.root
      const schema = root.lookupType(
        this.getTypeName(
          parsedMessage, {  // could get messageName from the arn: arn:aws:glue:us-east-1:accountID:schema/registryName/package.name.MessageName
            //messageName: glueSchema
          }))
      this.protobufSchemaCache[id] = schema
    } else {
      // unsupported data format
      throw new Error('Unsupported data format: ' + glueSchema.DataFormat);
    }
  }

  private UUIDstringToByteArray(id: string) {
    const idasbytes = uuid.parse(id)
    return new Uint8Array(idasbytes)
  }

  private getResolver(producerschema: avro.Type, consumerschema: avro.Type) {
    const resolver = consumerschema.createResolver(producerschema)
    return resolver
  }

  private static initByteBuffer(value: number) {
    return Buffer.from([value])
  }
}
