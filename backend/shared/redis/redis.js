import Redis from "ioredis"

// ES module imports are hoisted and evaluated before the importing module's own
// body runs. A service that calls dotenv.config() in index.js therefore still
// evaluates THIS module with REDIS_URL undefined -- and ioredis then silently
// falls back to 127.0.0.1:6379, connecting to the wrong Redis with no error.
// So load the service's .env here if the importer hasn't already done it.
// process.loadEnvFile() is built into Node (21.7+) and reads ./.env from the
// service's working directory, which avoids adding a dotenv dep to backend/.
if (!process.env.REDIS_URL) {
    try {
        process.loadEnvFile()
    } catch {
        // no .env file present -- fall through to the explicit check below
    }
}

if (!process.env.REDIS_URL) {
    throw new Error(
        "REDIS_URL is not set. Refusing to fall back to the ioredis default (127.0.0.1:6379), which would silently connect to the wrong Redis."
    )
}

const redis = new Redis(process.env.REDIS_URL)

redis.on("connect" , ()=>{
    console.log(`redis connected (${process.env.REDIS_URL})`)
})

export default redis
