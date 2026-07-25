import nodemailer from 'nodemailer'
import { env } from '../config.js'
import { formatUsd } from '../utils/money.js'

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' }
        : undefined,
    })
  }
  return transporter
}

export async function sendBudgetAlertEmail(input: {
  to: string
  clientName: string
  spendUsd: number
  capUsd: number
}): Promise<void> {
  const subject = `Mandate: ${input.clientName} at $${formatUsd(input.spendUsd)} of $${formatUsd(input.capUsd)}`
  const text = `Client ${input.clientName} at $${formatUsd(input.spendUsd)} of $${formatUsd(input.capUsd)}.\n\nThis is an 80% budget warning from Mandate. Raise the cap or pause the key before the hard stop.`

  if (env.EMAIL_CONSOLE) {
    console.log(`[budget-email] to=${input.to}\n${subject}\n${text}`)
    return
  }

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject,
    text,
  })
}
