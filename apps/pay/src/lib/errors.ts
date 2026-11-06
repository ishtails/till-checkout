// Server and wallet errors, in words a customer or merchant can act on.
const RULES: [RegExp, string][] = [
  [/order expired|410/i, "This checkout expired. Go back to the shop to start a new one."],
  [/order is paid|already paid|AlreadyPaid/i, "This order is already paid."],
  [/too many requests|429/i, "Too many tries in a minute. Wait a moment and try again."],
  [/already got test USDT/i, "This wallet already got its test USDT."],
  [/already has enough test USDT/i, "Your wallet already has enough test USDT to pay."],
  [/faucet.*daily limit|limit reached for today/i, "The demo's free test USDT is used up for today. Try again tomorrow."],
  [/faucet is off/i, "Free test USDT isn't available here."],
  [/user rejected|rejected the request|denied/i, "You cancelled the signature. Nothing was paid."],
  [/exceeds balance|insufficient/i, "Your wallet doesn't have enough USDT for this."],
  [/RefundTooLarge|Refund between/i, "That's more than is left to refund on this order."],
  [/daily gas cap|daily transaction cap/i, "The shop's daily limit for gas-free payments is reached. Try again tomorrow."],
  [/Failed to fetch|NetworkError|Load failed/i, "Can't reach Till right now. Check your connection and try again."],
]

export function friendly(message: string): string {
  for (const [pattern, text] of RULES) if (pattern.test(message)) return text
  return message
}
