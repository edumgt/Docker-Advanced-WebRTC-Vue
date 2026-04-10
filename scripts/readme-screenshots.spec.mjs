import fs from "node:fs/promises"
import path from "node:path"
import { test } from "@playwright/test"

const FRONTEND_URL = process.env.FRONTEND_URL || "http://acc748b6c0f6846a0aab7dd1cbd92d9d-1468928971.ap-northeast-2.elb.amazonaws.com"
const SIGNAL_URL = process.env.SIGNAL_URL || "ws://a16745688227442f8827d9802e109290-1655988714.ap-northeast-2.elb.amazonaws.com:3001"
const ROOM_ID = process.env.ROOM_ID || "11111"
const outputDir = path.resolve("DOC/readme-screenshots")

async function closeMenuIfOpen(page) {
  const dock = page.locator(".dock.is-open")
  if (await dock.count()) {
    await page.evaluate(() => {
      document.querySelector(".dock")?.classList.remove("is-open")
      document.querySelector(".dock-backdrop")?.classList.remove("is-open")
    })
  }
}

async function openMenu(page) {
  await page.evaluate(() => {
    document.querySelector(".dock")?.classList.add("is-open")
    document.querySelector(".dock-backdrop")?.classList.add("is-open")
  })
}

async function selectMenu(page, label) {
  await openMenu(page)
  await page.getByRole("button", { name: new RegExp(label, "i") }).click()
  await page.waitForTimeout(400)
}

test("capture README screenshots from EKS frontend", async ({ page }) => {
  await fs.mkdir(outputDir, { recursive: true })

  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle", timeout: 120000 })

  await page.screenshot({ path: path.join(outputDir, "01-home.png"), fullPage: true })

  await openMenu(page)
  await page.screenshot({ path: path.join(outputDir, "02-offcanvas-menu.png"), fullPage: true })

  await closeMenuIfOpen(page)
  await page.getByPlaceholder("ws://your-signaling-host:3001").fill(SIGNAL_URL)
  await page.getByPlaceholder("Enter room id").fill(ROOM_ID)
  await page.getByRole("button", { name: /join room/i }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(outputDir, "03-drawing-workspace.png"), fullPage: true })

  await selectMenu(page, "Chat")
  await page.screenshot({ path: path.join(outputDir, "04-chat-module.png"), fullPage: true })

  await selectMenu(page, "System")
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(outputDir, "05-system-dashboard.png"), fullPage: true })
})
