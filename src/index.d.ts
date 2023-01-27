/// <reference types="node" />
import * as sdk from 'aws-sdk';
import * as avro from 'avsc';
import { GetSchemaVersionResponse } from 'aws-sdk/clients/glue';
export declare enum SchemaType {
    AVRO = "AVRO"
}
export interface RegisterSchemaProps {
    type: SchemaType;
    schemaName: string;
    schema: string;
}
export declare enum SchemaCompatibilityType {
    NONE = "NONE",
    BACKWARD = "BACKWARD",
    BACKWARD_ALL = "BACKWARD_ALL",
    DISABLED = "DISABLED",
    FORWARD = "FORWARD",
    FORWARD_ALL = "FORWARD_ALL",
    FULL = "FULL",
    FULL_ALL = "FULL_ALL"
}
export interface CreateSchemaProps {
    type: SchemaType;
    schemaName: string;
    compatibility: SchemaCompatibilityType;
    schema: string;
}
export interface EncodeProps {
    compress: boolean;
}
export declare enum ERROR {
    NO_ERROR = 0,
    INVALID_HEADER_VERSION = 1,
    INVALID_COMPRESSION = 2,
    INVALID_SCHEMA_ID = 3,
    INVALID_SCHEMA = 4
}
export type AnalyzeMessageResult = {
    /**
     * true if the message is valid
     */
    valid: boolean;
    /**
     * the error code, if valid is false, otherwise undefined
     */
    error?: ERROR;
    /**
     * the header version
     */
    headerversion?: number;
    /**
     * the compression type, may be 0 (none) or 5 (gzip)
     */
    compression?: number;
    /**
     * the uuid of the schema
     */
    schemaId?: string;
    /**
     * the glue schema
     */
    schema?: GetSchemaVersionResponse;
};
export declare class GlueSchemaRegistry<T> {
    private gc;
    readonly registryName: string;
    private glueSchemaIdCache;
    private avroSchemaCache;
    /**
     * Constructs a GlueSchemaRegistry
     *
     * @param registryName - name of the Glue registry you want to use
     * @param props - optional AWS properties that are used when constructing the Glue object from the AWS SDK
     */
    constructor(registryName: string, props?: sdk.Glue.ClientConfiguration);
    /**
     * Updates the Glue client. Useful if you need to update the credentials, for example.
     *
     * @param props settings for the AWS Glue client
     */
    updateGlueClient(props?: sdk.Glue.ClientConfiguration): void;
    private loadGlueSchema;
    /**
     * Creates a new schema in the AWS Glue Schema Registry.
     * Note: do not use createSchema if you want to create a new version of an existing schema.
     * Instead use register().
     *
     * @param props - the details about the schema
     * @throws if the schema already exists
     */
    createSchema(props: CreateSchemaProps): Promise<string | undefined>;
    /**
     * Registers a new version of an existing schema.
     * Returns the id of the existing schema version if a similar version already exists.
     * Throws an exception if the schema does not exist.
     * Throws an exception if the Glue compatibility check fails.
     *
     * @param props - the details about the schema
     * @returns {string} the id of the schema version.
     */
    register(props: RegisterSchemaProps): Promise<string>;
    static COMPRESSION_DEFAULT: number;
    static COMPRESSION_ZLIB: number;
    static HEADER_VERSION: number;
    private static HEADER_VERSION_BYTE;
    private static COMPRESSION_DEFAULT_BYTE;
    private static COMPRESSION_ZLIB_BYTE;
    /**
     * Encode the object with a specific glue schema version
     *
     * @param glueSchemaId - UUID of the Glue schema version that should be used to encode the message
     * @param object - the object to encode
     * @param props - optional encoding options
     * @returns - a Buffer containing the binary message
     */
    encode(glueSchemaId: string, object: T, props?: EncodeProps): Promise<Buffer>;
    /**
     * Analyze the binary message to determine if it is valid and if so, what schema version it was encoded with.
     *
     * @param message - the binary message to analyze
     * @returns - an object containing the analysis results @see AnalyzeMessageResult
     */
    analyzeMessage(message: Buffer): Promise<AnalyzeMessageResult>;
    /**
     * Decode a message with a specific schema.
     *
     * @param message - Buffer with the binary encoded message
     * @param consumerschema - The Avro schema that should be used to decode the message
     * @returns - the deserialized message as object
     */
    decode(message: Buffer, consumerschema: avro.Type): Promise<T>;
    private getAvroSchemaForGlueId;
    private UUIDstringToByteArray;
    private getResolver;
    private static initByteBuffer;
}
