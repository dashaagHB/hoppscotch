const POSSIBLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export const uniqueID = (length = 16) => {
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (x) => POSSIBLE[x % POSSIBLE.length]).join("")
}
