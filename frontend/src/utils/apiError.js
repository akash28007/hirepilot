// Turns an axios error into a message a user can act on.
// 402 means the server refused the action because the balance is too low.
export const apiErrorMessage = (error, fallback = "Something went wrong. Please try again.") => {
    const data = error?.response?.data
    if (error?.response?.status === 402) {
        const have = data?.interviewCoin
        const need = data?.required
        return have !== undefined && need !== undefined
            ? `Not enough interview coins: this needs ${need}, you have ${have}. Top up on the Billing page.`
            : "Not enough interview coins. Top up on the Billing page."
    }
    return data?.message || fallback
}

// Coin balance carried on an error response (for example after a refund).
export const coinsFromError = (error) => error?.response?.data?.interviewCoin
