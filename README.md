# glue-schema-registry

![Build status](https://github.com/meinestadt/glue-schema-registry/actions/workflows/build-only.yml/badge.svg)

A Javasript/Typescript library for encoding and decoding messages with AWS Glue schemas and the wire format used by the AWS Java libraries to create and consume messages with MSK, Kafka, Kinesis, and so on. This enables the creation of Typescript applications that are compatible with messages created with the AWS Glue Java SerDe libraries.

Apache Avro-encoded messages can be created and consumed using this library. Protobuf and JSON Schema are not currently supported. The library supports gzip compression, schema registration, and schema evolution. Avsc (https://github.com/mtth/avsc) is used for avro encoding/decoding.

This library works well with kafkajs (https://kafka.js.org).


## Getting started

Install with npm

````
npm i @meinestadt.de/glue-schema-registry
````

## Usage

First, create an avro schema and register it.

```typescript
import * as msglue from "@meinestadt.de/glue-schema-registry";
import * as avro from "avsc";


// avro schema
const schema = avro.Type.forSchema({
    type: "record",
    name: "property",
    namespace: "de.meinestadt.demo",
    fields: [
        { name: "demo", type: "string", default: "Hello World" },
    ]
});

const registry = new msglue.GlueSchemaRegistry<SCHEMATYPE>("<GLUE REGISTRY NAME>", {
    region: "<AWS_REGION>",
});

// create a new schema
// throws an error if the schema already exists
try {
    const schemaId = await registry.createSchema({
        type: SchemaType.AVRO,
        schemaName: "Testschema",
        compatibility: SchemaCompatibilityType.BACKWARD,
        schema: JSON.stringify(schema),
    });
} catch (error) {
    ...
}

// or register a version of an existing schema
// creates a new version or returns the id of an existing one, if a similar version already exists
const schemaId = await registry.register({
    schemaName: "Testschema",
    type: SchemaType.AVRO,
    schema: JSON.stringify(schema),
});

// now you can encode an object
const encodedmessage = await registry.encode(schemaId, object);
`````

the encoded message can then be sent to Kafka or MSK, for example:

````typescript
// import * as kafka from "kafkajs"
// ...
const kc = new kafka.Kafka(); 
const producer = kc.producer();
await producer.connect();
await producer.send({
    topic: "<TOPICNAME>",
    messages: [{ value: encodedmessage }],
});
````

To decode received messages:

````typescript
    const schema = avro.Type.forSchema({
        type: "record",
        name: "property",
        namespace: "de.meinestadt.demo",
        fields: [
            { name: "demo", type: "string", default: "Hello World" },
        ]
    });
    const dataset = await registry.decode(message.value, schema);
````

Note: registry.decode expects the raw message as the first parameter, plus the target schema as the second parameter.
If the message is encoded with a different version of the schema, the encoding schema gets loaded from Glue.
The record is then converted to the target schema.
If the schemas are not compatible an exception is thrown.

## Advanced

### Type parameter

You can set the type of the object that you want to encode, and that you receive when you decode a message, as type parameter when you create the instance.

For example:
````typescript
interface Address {
  street: string;
  zip: string;
  city: string;
}

const registry = new msglue.GlueSchemaRegistry<Address>("<GLUE REGISTRY NAME>", {
    region: "<AWS_REGION>",
});
````

The constructor takes an sdk.Glue.ClientConfiguration object as optional parameter.

### Create a new schema

Creates a new schema in the glue schema registry.
Throws an error if the schema already exists.

````typescript
registry.createSchema({
    type: SchemaType // currently only SchemaType.AVRO
    schemaName: string
    compatibility: SchemaCompatibilityType // NONE, BACKWARD, BACKWARD_ALL, DISABLED, FORWARD, FORWARD_ALL, FULL, FULL_ALL
    schema: string // the schema as JSON string
})
````

### Register a schema

Registers a schema and makes it available for encoding/decoding.
Creates a new version if the schema does not exist yet.
Throws an exception if the Glue compatibility check fails. 
Schemas are cached so that subsequent calls of `register` do not lead to multiple AWS Glue calls.

````typescript
const schemaId = await registry.register({
    schemaName: string,
    type: SchemaType,  // currently only SchemaType.AVRO
    schema: string, // schemas as JSON string
});
````


### Encode an object

Encode the object with a given glueSchemaId and returns a Buffer containing the binary data.

````typescript
async encode(glueSchemaId: string, object: T, props?: EncodeProps): Promise<Buffer>
````

Optional properties:

````typescript
{
  compress: boolean // default: true
}
````


### Decode an object

Decodes the binary message with the passed avro schema.
Reads the ID of the producer schema from the message, and loads the schema from the Glue
schema registry. Caches schemas for subsequent use.
Converts the incoming message from the producers schema into the consumers schema.
Throws an error if the producer schema does not exist, or cannot be loaded from glue, or
if producer and consumer schema are not compatible.

Decodes both uncompressed and gzip compressed messages.

````typescript
async decode(message: Buffer, consumerschema: avro.Type): Promise<T>
````

### Update the Glue client

You can refresh the internally cached Glue client by calling `updateGlueClient`.
This is particulary useful when credentials need to get updated.

```typescript
updateGlueClient(props?: sdk.Glue.ClientConfiguration)
````

## Examples

### Nodejs Lambda function consuming a MSK/Kafka stream

The following lambda function consumes messages from Kafka/MSK, and prints the deserialized 
object to the console.
Incoming messages must be encoded with a compatible Avro schema.

````typescript
import * as avro from "avsc";
import { GlueSchemaRegistry } from "@meinestadt.de/glue-schema-registry";

// define the interface for the deserialized message
interface IHelloWorld {
  message: string;
}

// the avro schema
const schema = avro.Type.forSchema({
  type: "record",
  namespace: "de.meinestadt.glueschema.demo",
  name: "HelloWorld",
  fields: [
    {
      name: "message",
      type: "string",
      default: "",
    },
  ],
});

export const handler = async (event: any) => {
  // create the registry object
  // Note: the lambda function must have the permission to read schemas and
  // schema versions from AWS Glue
  const registry = new GlueSchemaRegistry<IHelloWorld>("MySchemas", {
    region: "eu-central-1",
  });
  // Iterate through keys
  for (let key in event.records) {
    console.log("Key: ", key);
    // Iterate through records
    const p = event.records[key].map((record: any) => {
        console.log(`Message key: ${record.key}`);
      // base64 decode the incoming message
      const msg = Buffer.from(record.value, "base64");
      // decode the avro encoded message
      return registry.decode(msg, schema).then((dataset) => {
        // print the deserialized object to the console
        console.log(dataset);
      });
    });
    await Promise.all(p);
  }
};
`````

## Protocol details

@meinestadt.de/glue-schema-registry uses the same simple wire protocol as AWS' java libraries (https://github.com/awslabs/aws-glue-schema-registry).
The protocol is defined as follows:

VERSION_HEADER (1 Byte) + COMPRESSION_BYTE (1 Byte) + SCHEMA_VERSION_ID (16 Byte) + CONTENT

The current supported version is 3. Compression can be 0 (no compression) or 5 (zlib compression).

## Future plans

- support for Protobuf
- support for JSON Schema

