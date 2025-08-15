import {
  CreateSchemaCommandInput,
  CreateSchemaCommandOutput,
  GetSchemaVersionCommandInput,
  GetSchemaVersionCommandOutput,
  RegisterSchemaVersionCommandInput,
  RegisterSchemaVersionCommandOutput,
} from '@aws-sdk/client-glue'
import { jest } from '@jest/globals'

// type for all Glue commands
type GlueCommandMock<Input, Output> = jest.MockedFunction<(params: Input) => Promise<Output>>

const mockedSend = jest.fn().mockImplementation((command: unknown) => {
  return new Promise((resolve) => {
    const delay = Math.floor(Math.random() * 50) + 250 // 50–250 ms
    setTimeout(() => {
      resolve(command)
    }, delay)
  })
})

const mockedRegisterSchemaVersion: GlueCommandMock<
  RegisterSchemaVersionCommandInput,
  RegisterSchemaVersionCommandOutput
> = jest.fn()
const mockedGetSchemaVersion: GlueCommandMock<
  GetSchemaVersionCommandInput,
  GetSchemaVersionCommandOutput
> = jest.fn()
const mockedCreateSchema: GlueCommandMock<CreateSchemaCommandInput, CreateSchemaCommandOutput> =
  jest.fn()

const GlueClientMock = jest.fn().mockImplementation(() => {
  return {
    send: mockedSend,
  }
})

const clear = () => {
  mockedSend.mockClear()
  mockedRegisterSchemaVersion.mockClear()
  mockedGetSchemaVersion.mockClear()
  mockedCreateSchema.mockClear()
}

const reset = () => {
  mockedRegisterSchemaVersion.mockReset()
  mockedGetSchemaVersion.mockReset()
  mockedCreateSchema.mockReset()
}

export {
  GlueClientMock as GlueClient,
  mockedCreateSchema as CreateSchemaCommand,
  mockedRegisterSchemaVersion as RegisterSchemaVersionCommand,
  mockedGetSchemaVersion as GetSchemaVersionCommand,
  mockedSend as send,
  reset,
  clear,
}
