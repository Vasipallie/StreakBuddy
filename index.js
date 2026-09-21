const path = require('path')
const { app, BrowserWindow, Menu, shell } = require('electron')
const express = require('express')
const fs = require('fs')
const dotenv = require('dotenv')

dotenv.config({ path: path.join(__dirname, '.env') })

const server = express()
const PORT = 5000
const UID = process.env.UID || process.env.hackatimeuid || process.env.HACKATIME_UID
const SECRET = process.env.SECRET || process.env.hackatimesecret || process.env.HACKATIME_SECRET

if (!UID || !SECRET) {
  console.warn('Missing Hackatime credentials. Check .env for UID/SECRET or hackatimeuid/hackatimesecret.')
}

const stageGoals = [0.5, 1, 1.6, 2.5, 3.8, 5.5, 7, 8, 10]
const stageNames = [
  'Unhatched Seed',
  'Sprouting Seed',
  'Overly Excited Seedling',
  'Budding Plant',
  'Crackling Seed',
  'Sprouts',
  'Young Plant',
  'Budding Flower',
  'Blooming Flower',
  'Full Bloom'
]

function getStageFromHours(hours) {
  let stage = 0
  for (let i = 0; i < stageGoals.length; i++) {
    if (hours >= stageGoals[i]) {
      stage = i
    }
  }
  return {
    stage: Math.min(stage, stageGoals.length - 1),
    final: stageGoals[Math.min(stage, stageGoals.length - 1)],
    name: stageNames[Math.min(stage, stageNames.length - 1)]
  }
}

server.use(express.json())

server.get(['/authored', '/authoured'], (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'authord.html'))
})

server.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

server.get('/hackauth', (req, res) => {
  if (!UID || !SECRET) {
    return res.status(500).send('Hackatime credentials are missing. Add UID/SECRET to your .env file.')
  }

  const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  const redirectUri = 'http://localhost:5000/hackauth/c'
  const authurl = `https://hackatime.hackclub.com/oauth/authorize?client_id=${UID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=profile+read&state=${state}`
  res.redirect(authurl)
})

server.get('/hackauth/c', async (req, res) => {
  const code = req.query.code

  if (!code) {
    return res.status(400).send('Hackatime OAuth callback did not include a code.')
  }

  try {
    const tokenParams = new URLSearchParams({
      client_id: UID,
      client_secret: SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:5000/hackauth/c'
    })

    const tokenResponse = await fetch('https://hackatime.hackclub.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: tokenParams.toString()
    })

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      throw new Error(tokenData.error_description || tokenData.error || 'Missing access token from Hackatime.')
    }

    fs.writeFileSync(path.join(__dirname, 'StreakBuddy_AccessToken.txt'), accessToken)
    res.redirect('/authored')
  } catch (error) {
    console.error('Hackatime auth failed:', error)
    res.status(500).send('Hackatime authentication failed. Please try again.')
  }
})

server.get('/hackdata', async (req, res) => {
  const tokenFile = path.join(__dirname, 'StreakBuddy_AccessToken.txt')

  if (!fs.existsSync(tokenFile)) {
    return res.json({ current: 0, final: 0.5, stage: 0 })
  }

  const token = fs.readFileSync(tokenFile, 'utf8').trim()

  if (!token) {
    return res.json({ current: 0, final: 0.5, stage: 0 })
  }

  try {
    const endDate = new Date()
    const startDate = new Date(endDate)
    startDate.setDate(endDate.getDate() - 6)

    const formatDate = (date) => date.toISOString().slice(0, 10)
    const hoursResponse = await fetch(`https://hackatime.hackclub.com/api/v1/authenticated/hours?start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!hoursResponse.ok) {
      throw new Error(`Hackatime hours request failed: ${hoursResponse.status}`)
    }

    const hoursData = await hoursResponse.json()
    const totalSeconds = Number(hoursData?.total_seconds ?? 0)
    const current = totalSeconds > 0 ? totalSeconds / 3600 : 0
    const stageInfo = getStageFromHours(current)

    return res.json({
      current: Number(current.toFixed(1)),
      final: Number(stageInfo.final.toFixed(1)),
      stage: stageInfo.stage,
      name: stageInfo.name,
      range: 'last_7_days',
      total_seconds: totalSeconds,
      start_date: formatDate(startDate),
      end_date: formatDate(endDate)
    })
  } catch (error) {
    console.warn('Hackatime summary fetch failed:', error)
    return res.json({ current: 0, final: 0.5, stage: 0, range: 'last_7_days' })
  }
})

const expressServer = server.listen(PORT, () => {
  console.log(`Express server listening on http://localhost:${PORT}`)
})

const createWindow = () => {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 400,
    height: 686,
    backgroundColor: '#00AAF1',
    webPreferences:{
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'icons', 'png', '256x256.png')
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.loadFile('src/index.html')
}

app.whenReady().then(() => {
  createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  expressServer.close()
})
