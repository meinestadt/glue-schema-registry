# glue-schema-registry

A Typescript library for encoding and decoding messages with AWS Glue schemas and the wire format used by the AWS Java libraries to create and consume messages with MSK, Kafka, Kinesis, and so on. This enables the creation of Typescript applications that are compatible with messages created with the AWS Glue Java SerDe libraries.

Apache Avro-encoded messages can be created and consumed using this library. Protobof and JSON Schema are not currently supported. The library supports gzip compression, schema registration, and schema evolution. Avsc (https://github.com/mtth/avsc) is used for avro encoding/decoding.

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
const schemaId = await registry.createSchema({
    type: SchemaType.AVRO,
    schemaName: "Testschema",
    compatibility: SchemaCompatibilityType.BACKWARD,
    schema: JSON.stringify(schema),
});

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



