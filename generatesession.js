const { spawnSync, spawn } = require('child_process')
const { existsSync, writeFileSync } = require('fs')
const path = require('path')

const SESSION_ID = 'updateThis' // Mets ta vraie session ici

let nodeRestartCount = 0
const maxNodeRestarts = 5
const restartWindow = 30000 // 30 secondes
let lastRestartTime = Date.now()

function startNode() {
  const child = spawn('node', ['index.js'], { cwd: 'SPIDER-NET-SECURE-BOT', stdio: 'inherit' })

  child.on('exit', (code) => {
    if (code !== 0) {
      const currentTime = Date.now()
      if (currentTime - lastRestartTime > restartWindow) {
        nodeRestartCount = 0
      }
      lastRestartTime = currentTime
      nodeRestartCount++

      if (nodeRestartCount > maxNodeRestarts) {
        console.error('Node.js redémarre en boucle. Arrêt...')
        return
      }
      console.log(
        `Node.js a quitté avec code ${code}. Redémarrage... (Tentative ${nodeRestartCount})`
      )
      startNode()
    }
  })
}

function startPm2() {
  const pm2 = spawn('yarn', ['pm2', 'start', 'index.js', '--name', 'SPIDER-NET-SECURE-BOT', '--attach'], {
    cwd: 'SPIDER-NET-SECURE-BOT',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let restartCount = 0
  const maxRestarts = 5

  pm2.on('exit', (code) => {
    if (code !== 0) {
      startNode()
    }
  })

  pm2.on('error', (error) => {
    console.error(`Erreur pm2: ${error.message}`)
    startNode()
  })

  if (pm2.stderr) {
    pm2.stderr.on('data', (data) => {
      const output = data.toString()
      if (output.includes('restart')) {
        restartCount++
        if (restartCount > maxRestarts) {
          spawnSync('yarn', ['pm2', 'delete', 'SPIDER-NET-SECURE-BOT'], { cwd: 'SPIDER-NET-SECURE-BOT', stdio: 'inherit' })
          startNode()
        }
      }
    })
  }

  if (pm2.stdout) {
    pm2.stdout.on('data', (data) => {
      const output = data.toString()
      console.log(output)
      if (output.includes('Connecting')) {
        restartCount = 0
      }
    })
  }
}

function installDependencies() {
  const installResult = spawnSync(
    'yarn',
    ['install', '--force', '--non-interactive', '--network-concurrency', '3'],
    {
      cwd: 'SPIDER-NET-SECURE-BOT',
      stdio: 'inherit',
      env: { ...process.env, CI: 'true' },
    }
  )

  if (installResult.error || installResult.status !== 0) {
    console.error(
      `Erreur installation dépendances: ${
        installResult.error ? installResult.error.message : 'inconnue'
      }`
    )
    process.exit(1)
  }
}

function checkDependencies() {
  if (!existsSync(path.resolve('SPIDER-NET-SECURE-BOT/package.json'))) {
    console.error('package.json manquant!')
    process.exit(1)
  }

  const result = spawnSync('yarn', ['check', '--verify-tree'], {
    cwd: 'SPIDER-NET-SECURE-BOT',
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    console.log('Dépendances manquantes. Installation...')
    installDependencies()
  }
}

function cloneRepository() {
  const cloneResult = spawnSync(
    'git',
    ['clone', 'https://github.com/Junior1253/PROJET-SPIDER-NET-BOZ.git', 'SPIDER-NET-SECURE-BOT'],
    {
      stdio: 'inherit',
    }
  )

  if (cloneResult.error) {
    throw new Error(`Échec du clone: ${cloneResult.error.message}`)
  }

  const configPath = 'SPIDER-NET-SECURE-BOT/config.env'
  try {
    writeFileSync(configPath, `VPS=true\nSESSION_ID=${SESSION_ID}`)
  } catch (err) {
    throw new Error(`Impossible d'écrire dans config.env: ${err.message}`)
  }

  installDependencies()
}

if (!existsSync('SPIDER-NET-SECURE-BOT')) {
  cloneRepository()
  checkDependencies()
} else {
  checkDependencies()
}

startPm2()
