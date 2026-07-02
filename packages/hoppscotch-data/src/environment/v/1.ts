import { z } from "zod"
import { defineVersion } from "verzod"
import { V0_SCHEMA } from "./0"

const POSSIBLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export const uniqueID = () => {
  const values = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(values, (x) => POSSIBLE[x % POSSIBLE.length]).join("")
}

export const V1_SCHEMA = z.object({
  v: z.literal(1),
  id: z.string(),
  name: z.string(),
  variables: z.array(
    z.union([
      z.object({
        key: z.string(),
        secret: z.literal(true),
      }),
      z.object({
        key: z.string(),
        value: z.string(),
        secret: z.literal(false).catch(false),
      }),
    ])
  ),
})

export default defineVersion({
  initial: false,
  schema: V1_SCHEMA,
  up(old: z.infer<typeof V0_SCHEMA>) {
    const result: z.infer<typeof V1_SCHEMA> = {
      ...old,
      v: 1,
      id: old.id || uniqueID(),
      variables: old.variables.map((variable) => {
        return {
          ...variable,
          secret: false,
        }
      }),
    }

    return result
  },
})
