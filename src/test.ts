import assert from 'node:assert/strict'
import { test } from 'node:test'

import { generate } from 'astring'
import { type Expression } from 'estree'
import { valueToEstree } from 'estree-util-value-to-estree'
import { testFixturesDirectory } from 'snapshot-fixtures'

testFixturesDirectory({
  directory: new URL('../fixtures', import.meta.url),
  prettier: true,
  tests: {
    async 'input.js'(input) {
      const { default: value } = await import(input.path)
      const withPreserveReferences = generate(valueToEstree(value, { preserveReferences: true }))
      let withoutPreserveReferences: string
      try {
        withoutPreserveReferences = `const withoutPreserveReferences = ${generate(valueToEstree(value))}`
      } catch {
        withoutPreserveReferences =
          '// Recursive references are not supported witout preserveReferences'
      }
      return `
        // Used as input
        // { preserveReferences: true }
        export default ${withPreserveReferences}

        // -------------------------------------------------------------------------------------------------

        // Default output
        // { preserveReferences: false }
        ${withoutPreserveReferences}
      `
    }
  }
})

test('throw for local symbols', () => {
  const symbol = Symbol('local')
  assert.throws(
    () => valueToEstree(symbol),
    (error) => {
      assert(error instanceof TypeError)
      assert.equal(error.message, 'Only global symbols are supported, got: Symbol(local)')
      assert.equal(error.cause, symbol)
      return true
    }
  )
})

test('throw for unsupported values', () => {
  const fn = (): null => null
  assert.throws(
    () => valueToEstree(fn),
    (error) => {
      assert(error instanceof TypeError)
      assert.equal(error.message, 'Unsupported value: () => null')
      assert.equal(error.cause, fn)
      return true
    }
  )

  class A {
    a = ''
  }

  const a = new A()
  assert.throws(
    () => valueToEstree(a),
    (error) => {
      assert(error instanceof TypeError)
      assert.equal(error.message, 'Unsupported value: [object Object]')
      assert.equal(error.cause, a)
      return true
    }
  )
})

test('throw for cyclic references', () => {
  const object: Record<string, unknown> = {}
  object.reference = object
  assert.throws(
    () => valueToEstree(object),
    (error) => {
      assert(error instanceof Error)
      assert.equal(error.message, 'Found circular reference: [object Object]')
      assert.equal(error.cause, object)
      return true
    }
  )
})

test('transform to json on unsupported values w/ `instanceAsObject`', () => {
  class Point {
    line: number

    column: number

    constructor(line: number, column: number) {
      this.line = line
      this.column = column
    }
  }

  const point = new Point(2, 3)

  assert.throws(() => valueToEstree(point), new TypeError('Unsupported value: [object Object]'))

  assert.deepEqual(valueToEstree(point, { instanceAsObject: true }), {
    type: 'ObjectExpression',
    properties: [
      {
        type: 'Property',
        method: false,
        shorthand: false,
        computed: false,
        kind: 'init',
        key: { type: 'Literal', value: 'line' },
        value: { type: 'Literal', value: 2 }
      },
      {
        type: 'Property',
        method: false,
        shorthand: false,
        computed: false,
        kind: 'init',
        key: { type: 'Literal', value: 'column' },
        value: { type: 'Literal', value: 3 }
      }
    ]
  })
})

test('transform with fallbacks', () => {
  class Ignore {
    value: Expression

    constructor(v: Expression) {
      this.value = v
    }
  }

  assert.deepEqual(
    valueToEstree(new Ignore({ type: 'Literal', value: 'Hello World' }), {
      fallback(v) {
        if (v instanceof Ignore) {
          return v.value as Expression
        }

        throw new Error(`Unsupported value: ${v}`)
      }
    }),
    {
      type: 'Literal',
      value: 'Hello World'
    }
  )

  assert.deepEqual(
    valueToEstree(
      {
        name: 'Hey',
        description: new Ignore({ type: 'Literal', value: 'Hello World' })
      },
      {
        fallback(v) {
          if (v instanceof Ignore) {
            return v.value
          }

          throw new Error(`Unsupported value: ${v}`)
        }
      }
    ),
    {
      type: 'ObjectExpression',
      properties: [
        {
          type: 'Property',
          method: false,
          shorthand: false,
          computed: false,
          kind: 'init',
          key: { type: 'Literal', value: 'name' },
          value: { type: 'Literal', value: 'Hey' }
        },
        {
          type: 'Property',
          method: false,
          shorthand: false,
          computed: false,
          kind: 'init',
          key: { type: 'Literal', value: 'description' },
          value: { type: 'Literal', value: 'Hello World' }
        }
      ]
    }
  )
})
