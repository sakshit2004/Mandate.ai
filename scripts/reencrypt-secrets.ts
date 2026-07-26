import 'dotenv/config'
import { prisma } from '../server/src/db.js'
import { isLegacySealedSecret, sealSecret, unsealSecret } from '../server/src/utils/seal.js'

async function main() {
  const [agencies, clients] = await Promise.all([
    prisma.agency.findMany({
      select: { id: true, sealedOpenaiKey: true, sealedAnthropicKey: true },
    }),
    prisma.client.findMany({ select: { id: true, sealedKey: true } }),
  ])

  let updated = 0
  for (const agency of agencies) {
    const openai = agency.sealedOpenaiKey
    const anthropic = agency.sealedAnthropicKey
    if (
      (openai && isLegacySealedSecret(openai)) ||
      (anthropic && isLegacySealedSecret(anthropic))
    ) {
      await prisma.agency.update({
        where: { id: agency.id },
        data: {
          sealedOpenaiKey:
            openai && isLegacySealedSecret(openai) ? sealSecret(unsealSecret(openai)) : undefined,
          sealedAnthropicKey:
            anthropic && isLegacySealedSecret(anthropic)
              ? sealSecret(unsealSecret(anthropic))
              : undefined,
        },
      })
      updated += 1
    }
  }

  for (const client of clients) {
    if (!isLegacySealedSecret(client.sealedKey)) continue
    await prisma.client.update({
      where: { id: client.id },
      data: { sealedKey: sealSecret(unsealSecret(client.sealedKey)) },
    })
    updated += 1
  }

  console.log(`[mandate] re-encrypted ${updated} records`)
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
