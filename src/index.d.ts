/// <reference types="node" />
import * as sdk from 'aws-sdk';
import * as avro from 'avsc';
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
    DISABLED = "DISABLED"
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
export declare class GlueSchemaRegistry<T> {
    private gc;
    registryName: string;
    private glueSchemaIdCache;
    private avroSchemaCache;
    constructor(registryName: string, props?: sdk.Glue.ClientConfiguration);
    private loadGlueSchema;
    createSchema(props: CreateSchemaProps): Promise<string | undefined>;
    /**
     * Registers a new version of an existing schema.
     * Returns the id of the existing schema version if a similar version already exists.
     * Throws an exception if the schema does not exist.
     *
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
     * Encode the object with the glue schema with the given id
     */
    encode(glueSchemaId: string, object: T, props?: EncodeProps): Promise<Buffer>;
    /**
     * Decode a message with a specific schema.
     */
    decode(message: Buffer, consumerschema: avro.Type): Promise<T>;
    private getAvroSchemaForGlueId;
    private UUIDstringToByteArray;
    private getResolver;
    private static initByteBuffer;
}
