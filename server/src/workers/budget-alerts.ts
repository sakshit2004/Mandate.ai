import 'dotenv/config'
import { BUDGET_ALERT_THRESHOLD, env } from '../config.js'
import { prisma } from '../db.js'
import { sendBudgetAlertEmail } from '../services/email.js'
import { periodSpendForClient } from '../services/usage.js'
import { moneyUsd, percentUsed } from '../utils/money.js'
import { periodBounds } from '../utils/periods.js'

export async function runBudgetAlertPass(): Promise<{ checked: number; sent: number }> {
  const agencies = await prisma.agency.findMany({
    where: { status: 'ACTIVE' },
    include: {
      clients: true,
      memberships: {
        where: { role: 'ADMIN' },
        include: { user: true },
        take: 1,
      },
    },
  })
  let checked = 0
  let sent = 0

  for (const agency of agencies) {
    const to = env.ALERT_EMAIL_TO || agency.memberships[0]?.user.primaryEmail
    if (!to) continue
    for (const client of agency.clients) {
      if (client.killed) continue
      checked += 1
      const period = periodBounds(client.budgetPeriod, agency.timezone)
      const spendUsd = await periodSpendForClient(client.id, period.start, period.end)
      const capUsd = moneyUsd(client.maxBudgetUsd)
      const pct = percentUsed(spendUsd, capUsd)
      if (pct < BUDGET_ALERT_THRESHOLD) continue

      const existing = await prisma.budgetAlert.findUnique({
        where: {
          clientId_thresholdPct_budgetWindowId: {
            clientId: client.id,
            thresholdPct: BUDGET_ALERT_THRESHOLD,
            budgetWindowId: period.windowId,
          },
        },
      })
      if (existing) continue

      try {
        await sendBudgetAlertEmail({
          to,
          clientName: client.name,
          spendUsd,
          capUsd,
        })
        await prisma.budgetAlert.create({
          data: {
            clientId: client.id,
            thresholdPct: BUDGET_ALERT_THRESHOLD,
            budgetWindowId: period.windowId,
            spendUsd,
            capUsd,
          },
        })
        sent += 1
      } catch (err) {
        console.error('[budget-alerts] send failed', client.slug, err)
      }
    }
  }

  return { checked, sent }
}

const INTERVAL_MS = 30_000

async function main() {
  console.log(`[budget-alerts] watching every ${INTERVAL_MS / 1000}s (threshold ${BUDGET_ALERT_THRESHOLD}%)`)
  const tick = async () => {
    try {
      const result = await runBudgetAlertPass()
      if (result.sent > 0) {
        console.log(`[budget-alerts] sent=${result.sent} checked=${result.checked}`)
      }
    } catch (err) {
      console.error('[budget-alerts] pass failed', err)
    }
  }
  await tick()
  setInterval(tick, INTERVAL_MS)
}

const isDirectRun = process.argv[1]?.includes('budget-alerts')
if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
