const mineflayer = require('mineflayer')
const { Vec3 } = require('vec3')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const fs = require('fs')
const axios = require('axios')
const path = require('path')
const chalk = require('chalk')
const notifier = require('node-notifier')
const { playNotification } = require('./notification')

// Kit chest locations
let kitChests = {}

// Load saved kit locations
const KITS_FILE = path.join(__dirname, 'kits.json')
try {
  if (fs.existsSync(KITS_FILE)) {
    const savedKits = JSON.parse(fs.readFileSync(KITS_FILE, 'utf8'))
    // Convert saved positions back to Vec3 objects
    for (const [name, pos] of Object.entries(savedKits)) {
      kitChests[name] = new Vec3(pos.x, pos.y, pos.z)
    }
    console.log('Loaded saved kits:', kitChests)
  }
} catch (err) {
  console.error('Error loading kits:', err)
}

// Function to save kit locations
function saveKitLocations() {
  try {
    fs.writeFileSync(KITS_FILE, JSON.stringify(kitChests, null, 2))
    console.log('Saved kit locations to file')
  } catch (err) {
    console.error('Error saving kits:', err)
  }
}

// Function to log delivery
async function logDelivery(username, coords, kitType) {
  const deliveriesFile = path.join(__dirname, 'deliveries.json')
  let deliveries = []
  
  try {
    if (fs.existsSync(deliveriesFile)) {
      deliveries = JSON.parse(fs.readFileSync(deliveriesFile, 'utf8'))
    }
    
    deliveries.push({
      username,
      coords: {
        x: Math.round(coords.x),
        y: Math.round(coords.y),
        z: Math.round(coords.z)
      },
      kitType,
      timestamp: new Date().toISOString()
    })
    
    fs.writeFileSync(deliveriesFile, JSON.stringify(deliveries, null, 2))
  } catch (err) {
    console.error('Error logging delivery:', err)
  }
}

// Function to send Discord webhook
async function sendDiscordEmbed(username, coords, kitType) {
  const x = Math.round(coords.x)
  const y = Math.round(coords.y)
  const z = Math.round(coords.z)
  
  const embed = {
    title: '⚠️ TARGET ACQUIRED ⚠️',
    color: 0xFF0000, // Red color
    fields: [
      {
        name: '👤 TARGET',
        value: `\`${username}\``,
        inline: true
      },
      {
        name: '📦 KIT',
        value: `\`${kitType}\``,
        inline: true
      },
      {
        name: '📍 LOCATION',
        value: `\`[${x}, ${y}, ${z}]\``,
        inline: false
      },
      {
        name: '📡 STATUS',
        value: '```diff\n+ DELIVERED\n- TERMINATED\n```',
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: '🤖 SolaraBot | Target Eliminated'
    }
  }

  try {
    const response = await fetch('https://discord.com/api/webhooks/1335262206610116720/qfnSAJrzyunCEf0jjlUBQDIxCS2357eFQifv4bgFG9fad6DyD6ILZRPfEurC_vY3f1Ui', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    })
    
    if (!response.ok) {
      console.error('Error sending webhook:', await response.text())
    }
  } catch (err) {
    console.error('Error sending Discord webhook:', err)
  }
}

// Function to send malicious-looking embed
function sendDeliveryEmbed(username, coords, kitType) {
  const x = Math.round(coords.x)
  const y = Math.round(coords.y)
  const z = Math.round(coords.z)
  
  bot.chat(`/msg aetqo ⚠️ TARGET ACQUIRED ⚠️`)
  bot.chat(`/msg aetqo ▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄`)
  bot.chat(`/msg aetqo TARGET: ${username}`)
  bot.chat(`/msg aetqo LOCATION: [${x}, ${y}, ${z}]`)
  bot.chat(`/msg aetqo KIT: ${kitType}`)
  bot.chat(`/msg aetqo STATUS: DELIVERED`)
  bot.chat(`/msg aetqo TERMINATION: COMPLETE`)
  bot.chat(`/msg aetqo ▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀`)
}

// Function to send death webhook
async function sendDeathEmbed(coords) {
  const x = Math.round(coords.x)
  const y = Math.round(coords.y)
  const z = Math.round(coords.z)
  
  const embed = {
    title: '💀 BOT ELIMINATED 💀',
    color: 0x000000, // Black color
    fields: [
      {
        name: '🤖 MULE',
        value: '`SharpAsABullet`',
        inline: true
      },
      {
        name: '⚰️ STATUS',
        value: '`TERMINATED`',
        inline: true
      },
      {
        name: '📍 DEATH LOCATION',
        value: `\`[${x}, ${y}, ${z}]\``,
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: '🔄 Respawning...'
    }
  }

  try {
    const response = await fetch('https://discord.com/api/webhooks/1335262206610116720/qfnSAJrzyunCEf0jjlUBQDIxCS2357eFQifv4bgFG9fad6DyD6ILZRPfEurC_vY3f1Ui', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    })
    
    if (!response.ok) {
      console.error('Error sending death webhook:', await response.text())
    }
  } catch (err) {
    console.error('Error sending death webhook:', err)
  }
}

// Function to record coordinates
async function recordCoordinate(type, username, x, y, z) {
  try {
    await axios.post('http://localhost:3000/api/coordinates', {
      type,
      username,
      x,
      y,
      z,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error recording coordinate:', error);
  }
}

// Global variables for TPA
let tpaRequestActive = false
let currentTpaTarget = null

// Function to send TPA request
async function sendTpaRequest(bot, username) {
  return new Promise((resolve) => {
    // Create a chat listener for confirmation
    const chatHandler = (sender, message) => {
      if (message.includes('teleport') || message.includes('tpa')) {
        bot.removeListener('chat', chatHandler)
        resolve()
      }
    }
    
    // Add temporary chat listener
    bot.on('chat', chatHandler)
    
    // Send the command
    setTimeout(() => {
      bot.chat(`/tpa ${username}`)
    }, 100)
    
    // Remove listener after timeout
    setTimeout(() => {
      bot.removeListener('chat', chatHandler)
      resolve()
    }, 5000)
  })
}

// Bot configuration
const options = {
  host: '6b6t.org', // Server IP
  username: 'SharpAsABullet', // Your Minecraft username
  auth: 'microsoft', // Authentication type: 'microsoft' for Microsoft account
  version: '1.21.1' // Minecraft version
}

const bot = mineflayer.createBot(options)

// Function to check if user can use kit
async function canUseKit(username) {
  try {
    const response = await axios.get(`http://localhost:3000/api/timeout/${username}`);
    return response.data;
  } catch (error) {
    console.error('Error checking timeout:', error);
    return { canUse: false, error: 'Timeout service unavailable' };
  }
}

// Function to set timeout for user
async function setUserTimeout(username) {
  try {
    await axios.post('http://localhost:3000/api/timeout', { username });
  } catch (error) {
    console.error('Error setting timeout:', error);
  }
}

// Function to check and manage current orders
async function checkCurrentOrder(username, orderType) {
  try {
    const response = await fetch('http://localhost:3000/api/current-order');
    const currentOrder = await response.json();
    
    if (currentOrder) {
      return {
        busy: true,
        message: `I'm currently processing an order for ${currentOrder.username}. Please wait until I'm finished.`
      };
    }

    // Set new current order
    await fetch('http://localhost:3000/api/current-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        orderType,
        timestamp: Date.now()
      })
    });

    return { busy: false };
  } catch (error) {
    console.error('Error checking current order:', error);
    return { busy: false }; // Fallback to allow order if server is down
  }
}

// Function to clear the current order
async function clearCurrentOrder() {
  try {
    await fetch('http://localhost:3000/api/current-order', {
      method: 'DELETE'
    });
  } catch (error) {
    console.error('Error clearing current order:', error);
  }
}

// Function to handle kit command
async function handleKitCommand(bot, username, args) {
  try {
    // Check if user can use kit
    const status = await canUseKit(username)
    if (!status.canUse) {
      if (status.error) {
        bot.chat(status.error);
      } else {
        bot.chat(`${username}, you are on timeout. Please wait ${status.minutesLeft} minute${status.minutesLeft === 1 ? '' : 's'} before requesting another kit.`);
      }
      return;
    }

    if (args.length < 1) {
      bot.chat(`${username}: Usage: ;kit <kit_name>`);
      return;
    }

    const requestedKit = args[0].toLowerCase();
    if (requestedKit !== 'pvp') {
      bot.chat(`${username}: Only pvp kit is available!`);
      return;
    }

    // Check if bot is busy with another order
    const orderStatus = await checkCurrentOrder(username, requestedKit);
    if (orderStatus.busy) {
      bot.chat(`/msg${username}: ${orderStatus.message}`);
      return;
    }

    // Play notification sound and show green console message
    playNotification();
    console.log(chalk.green.bold(`⚡ NEW ORDER: ${username} requested ${requestedKit} kit ⚡`));

    // Set timeout immediately
    await setUserTimeout(username);

    console.log('Requested kit:', requestedKit);
    console.log('Available kits:', kitChests);
    const kitLocation = kitChests[requestedKit];

    if (!kitLocation) {
      bot.chat(`${username}: Kit "${requestedKit}" not found! Available kits: ${Object.keys(kitChests).join(', ')}`);
      await clearCurrentOrder();
      return;
    }

    // Wrap in async IIFE
    (async () => {
      try {
        // Move to the chest
        const chestPos = kitLocation;
        console.log('Bot position:', bot.entity.position);
        console.log('Trying to move to chest at:', chestPos);

        // Create a movements object for pathfinding
        const movements = new Movements(bot);
        bot.pathfinder.setMovements(movements);

        const chestGoal = new goals.GoalNear(chestPos.x, chestPos.y, chestPos.z, 2);

        // Set the goal and wait for arrival
        await bot.pathfinder.goto(chestGoal);

        // Open the chest
        const chestBlock = bot.blockAt(chestPos);
        if (!chestBlock) {
          await clearCurrentOrder();
          return;
        }

        const chest = await bot.openChest(chestBlock);

        // Wait a moment for the chest contents to load
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get all items from the chest window
        const items = chest.containerItems();
        console.log('Items in chest:', items.length);

        // Look for shulker box with the correct name
        const shulkerBox = items.find(item => {
          console.log('Checking item:', item.name);
          return item.name && item.name.toLowerCase().includes('shulker');
        });

        if (!shulkerBox) {
          await chest.close();
          await clearCurrentOrder();
          return;
        }

        // Try to withdraw the item
        await chest.withdraw(shulkerBox.type, shulkerBox.metadata, 1);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Close chest
        await chest.close();

        // Wait for inventory to update
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify we have the item
        const inventory = bot.inventory.items();
        const hasShulker = inventory.some(item => item.name.toLowerCase().includes('shulker'));
        if (!hasShulker) {
          await clearCurrentOrder();
          throw new Error('Failed to get shulker box');
        }

        // Wait before sending TPA
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Send TPA command
        bot.chat(`/tpa ${username}`);

        // Wait for TPA to be sent
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Tell user to accept
        bot.chat(`${username}: Please accept the teleport request! If I do not die automatically, please kill me.`);

        // Store current position
        const startPosition = bot.entity.position.clone();

        // Wait for teleport to complete
        let teleportTimeout;
        const checkInterval = setInterval(() => {
          const currentPos = bot.entity.position;
          const distance = startPosition.distanceTo(currentPos);

          if (distance > 10) {
            console.log('Teleport successful');
            clearInterval(checkInterval);
            clearTimeout(teleportTimeout);

            // Record teleport location
            recordCoordinate('teleport', username, bot.entity.position.x, bot.entity.position.y, bot.entity.position.z);
            
            // Log the delivery and send Discord embed
            const teleportCoords = bot.entity.position.clone();
            logDelivery(username, teleportCoords, requestedKit)
              .then(() => sendDiscordEmbed(username, teleportCoords, requestedKit))
              .then(() => {
                // Kill bot after successful delivery
                bot.chat('/kill');
                clearCurrentOrder();
              })
              .catch(error => {
                console.error('Error in delivery:', error);
                bot.chat(`${username}: Error during delivery: ${error.message}`);
                clearCurrentOrder();
              });
          }
        }, 500);

        // Set timeout for teleport
        teleportTimeout = setTimeout(() => {
          clearInterval(checkInterval);
          clearCurrentOrder();
        }, 30000);

      } catch (err) {
        console.error('Error in kit delivery:', err);
        await clearCurrentOrder();
      }
    })();
  } catch (error) {
    console.error('Error in handleKitCommand:', error);
    await clearCurrentOrder();
  }
}

// Function to set up all bot event handlers
function setupBot(bot) {
  // Handle successful spawn
  bot.on('spawn', async () => {
    console.log('Bot has spawned!')
    
    // Initialize pathfinder
    bot.loadPlugin(pathfinder)
    const defaultMove = new Movements(bot)
    bot.pathfinder.setMovements(defaultMove)
  })

  // Handle errors
  bot.on('error', async (err) => {
    console.error('Error occurred:', err)
  })

  // Handle being kicked
  bot.on('kicked', async (reason, loggedIn) => {
    console.log('Bot was kicked:', reason)
  })

  // Handle disconnections
  bot.on('end', async () => {
    console.log('Bot disconnected, attempting to reconnect...')
    setTimeout(() => {
      bot = mineflayer.createBot(options)
      setupBot(bot)
    }, 5000)
  })

  // Handle death
  bot.on('death', async () => {
    // Record death location
    await recordCoordinate('death', bot.username, bot.entity.position.x, bot.entity.position.y, bot.entity.position.z);
    
    await clearCurrentOrder();
    
    // Send death webhook with last position
    const deathCoords = bot.entity.position.clone();
    const dimension = bot.game.dimension;
    
    // Send webhook for death
    sendDeathEmbed(deathCoords);
  })

  // Handle chat messages
  bot.on('chat', async (username, message) => {
    // Ignore messages from the bot itself
    if (username === bot.username) return

    // Clean up the message by removing spam prevention numbers
    message = message.replace(/\s*\(\d+\)\s*$/, '')

    // Split message into command and arguments
    const args = message.split(' ')
    const command = args[0].toLowerCase()

    // Handle kit command for all users
    if (command === ';kit') {
      await handleKitCommand(bot, username, args.slice(1));
      return;
    }

    // Only process admin commands from here
    if (username === 'aetqo') {
      // Clean up the message by removing spam prevention numbers
      message = message.replace(/\s*\(\d+\)\s*$/, '')
      
      // Helper function for private messages to admin
      const sendAdminMessage = (msg) => {
        bot.chat(`/msg aetqo ${msg}`)
      }

      switch (command) {
        case ';kill':
          console.log('Admin requested bot kill')
          const dimension = bot.game.dimension
          bot.chat(`/msg ${username} Killing bot in dimension: ${dimension}`)
          // Wait a moment for message to send
          setTimeout(() => {
            bot.chat('/kill')
            // Make sure kill happens
            setTimeout(() => {
              if (bot.health > 0) {
                console.log('First kill attempt failed, trying again...')
                bot.chat('/kill')
              }
            }, 1000)
          }, 500)
          break

        case ';rotate':
          // Rotate the bot by the specified degrees (default 90)
          const degrees = args[1] ? parseFloat(args[1]) : 90
          const radians = degrees * Math.PI / 180
          bot.look(bot.entity.yaw + radians, bot.entity.pitch)
          break

        case ';lookat':
          // Make the bot look at the owner's position
          const playerEntity = bot.players[username]?.entity
          if (playerEntity) {
            bot.lookAt(playerEntity.position.offset(0, playerEntity.height, 0))
          }
          break

        case ';follow':
          // Make the bot move to the position where the command was sent
          const player = bot.players[username]?.entity
          if (player) {
            bot.pathfinder.setGoal(null) // Clear any existing movement goals
            const goal = new goals.GoalNear(player.position.x, player.position.y, player.position.z, 1)
            bot.pathfinder.setGoal(goal)
          }
          break

        case ';setkit':
          // Set the location of a kit chest
          if (args.length < 2) {
            sendAdminMessage('Usage: ;setkit <kit_name>')
            break
          }
          const kitName = args[1].toLowerCase()
          // Find the closest chest
          const chest = bot.findBlock({
            matching: block => block.name === 'chest',
            maxDistance: 4
          })
          if (!chest) {
            sendAdminMessage('No chest found nearby! Stand closer to the chest.')
            break
          }
          kitChests[kitName] = chest.position
          saveKitLocations() // Save to file
          console.log('Registered kit:', kitName, 'at position:', chest.position)
          console.log('Current kits:', kitChests)
          sendAdminMessage(`Set ${kitName} kit location successfully`)
          break

        case ';setspawn':
          // Find nearest bed
          const bed = bot.findBlock({
            matching: block => block.name.includes('bed'),
            maxDistance: 4
          })
          
          if (!bed) {
            sendAdminMessage('No bed found nearby! Stand closer to a bed.')
            break
          }
          
          // Wrap in async IIFE
          (async () => {
            try {
              // Try to right click the bed to set spawn
              console.log('Found bed, attempting to set spawn...')
              await bot.lookAt(bed.position)
              
              // Need to be close enough to interact
              if (bed.position.distanceTo(bot.entity.position) > 3) {
                const bedGoal = new goals.GoalNear(bed.position.x, bed.position.y, bed.position.z, 2)
                await bot.pathfinder.goto(bedGoal)
              }
              
              // Right click the bed
              await bot.activateBlock(bed)
              sendAdminMessage('Spawn point set successfully!')
            } catch (err) {
              console.error('Error setting spawn:', err)
              sendAdminMessage('Error setting spawn point! Make sure bed is accessible.')
            }
          })()
          break
      }
    }

    console.log(`${username}: ${message}`)
  })
}

// Call setupBot initially
setupBot(bot)
