import { jest } from '@jest/globals'

// type for all Glue commands
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GlueCommandMock = jest.MockedFunction<(params: unknown) => any>

const mockedSend = jest.fn().mockImplementation((command: unknown) => {
  return new Promise((resolve) => {
    resolve(command)
  })
})
const mockedRegisterSchemaVersion: GlueCommandMock = jest.fn()
const mockedGetSchemaVersion: GlueCommandMock = jest.fn()
const mockedCreateSchema: GlueCommandMock = jest.fn()

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

export {
  GlueClientMock as GlueClient,
  mockedCreateSchema as CreateSchemaCommand,
  mockedRegisterSchemaVersion as RegisterSchemaVersionCommand,
  mockedGetSchemaVersion as GetSchemaVersionCommand,
  mockedSend as send,
  clear,
}
