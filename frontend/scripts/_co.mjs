import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
const B=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe']
const browser=await puppeteer.launch({executablePath:B.find(p=>existsSync(p)),headless:true,args:['--no-sandbox']})
const page=await browser.newPage()
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message)))
page.on('console',m=>{if(m.type()==='error'&&!/401|Failed to load resource/.test(m.text()))errs.push(m.text())})
await page.setViewport({ width: 1440, height: 1100 })
await page.goto('http://localhost:5174/th/checkout?items=demo-jlpt-n5', { waitUntil:'networkidle2' })
await new Promise(r=>setTimeout(r,1500))
console.log('guest gate :', (await page.$('.co-guest')) !== null)
console.log('preview    :', await page.$$eval('.co-mini li', e=>e.map(x=>x.innerText.replace(/\n/g,' | '))))
console.log('errors     :', errs.slice(0,3))
await page.screenshot({ path: process.argv[2] })
await browser.close()
