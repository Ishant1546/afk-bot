const mineflayer = require("mineflayer");
const Movements = require("mineflayer-pathfinder").Movements;
const pathfinder = require("mineflayer-pathfinder").pathfinder;
const { GoalBlock, GoalNear } = require("mineflayer-pathfinder").goals;
const config = require("./settings2.json");
const express = require("express");

// Multi-bot configuration - 5 bots
const BOTS = [
   {
      id: 1,
      name: "Bot1",
      port: 8001,
      account: {
         username: "Heartless_MC8",  // Change these usernames
         password: "notasecurepassword123",
         type: "offline"
      }
   },
   {
      id: 2,
      name: "Bot2",
      port: 8002,
      account: {
         username: "Heartless_MC6",  // Change these usernames
         password: "notasecurepassword123",
         type: "offline"
      }
   },
   {
      id: 3,
      name: "Bot3",
      port: 8003,
      account: {
         username: "Heartless_MC7",  // Change these usernames
         password: "notasecurepassword123",
         type: "offline"
      }
   },
   {
      id: 4,
      name: "Bot4",
      port: 8004,
      account: {
         username: "Heartless_MC9",  // Change these usernames
         password: "notasecurepassword123",
         type: "offline"
      }
   },
   {
      id: 5,
      name: "Bot5",
      port: 8005,
      account: {
         username: "Heartless_MC10",  // Change these usernames
         password: "notasecurepassword123",
         type: "offline"
      }
   }
];

// Store all bot instances
const botInstances = [];

// Create web servers for each bot
BOTS.forEach(botConfig => {
   const app = express();
   app.get("/", (req, res) => {
      const bot = botInstances.find(b => b.id === botConfig.id);
      const status = bot && bot.instance && bot.instance.isOnline ? 'Online' : 'Offline';
      res.send(`
         <html>
         <head><title>${botConfig.name} Status</title>
         <style>
            body { font-family: Arial; padding: 20px; background: #1a1a1a; color: #fff; }
            .online { color: #00ff00; }
            .offline { color: #ff0000; }
         </style>
         </head>
         <body>
            <h1>${botConfig.name}</h1>
            <p>Username: ${botConfig.account.username}</p>
            <p>Status: <span class="${status.toLowerCase()}">${status}</span></p>
            <p>Uptime: ${bot ? bot.uptime : 0} seconds</p>
            <p><a href="/restart">Restart Bot</a></p>
         </body>
         </html>
      `);
   });
   
   app.get("/restart", (req, res) => {
      console.log(`[${botConfig.name}] 🔄 Manual restart triggered`);
      const bot = botInstances.find(b => b.id === botConfig.id);
      if (bot && bot.instance) {
         bot.instance.end();
      }
      setTimeout(() => {
         createBot(botConfig);
      }, 3000);
      res.send(`Restarting ${botConfig.name}...`);
   });
   
   app.listen(botConfig.port, () => {
      console.log(`✅ Web server for ${botConfig.name} started on port ${botConfig.port}`);
   });
});

function createBot(botConfig) {
   console.log(`🤖 [${botConfig.name}] Attempting to create bot...`);
   
   // Merge bot-specific config with main config
   const botAccount = {
      username: botConfig.account.username,
      password: botConfig.account.password,
      type: botConfig.account.type
   };
   
   const bot = mineflayer.createBot({
      username: botAccount.username,
      password: botAccount.password,
      auth: botAccount.type,
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version,
      viewDistance: "tiny",
      chatLengthLimit: 256
   });

   // Add bot metadata
   bot.botId = botConfig.id;
   bot.botName = botConfig.name;
   bot.isOnline = false;
   bot.uptime = 0;
   bot.startTime = Date.now();
   bot.reconnectAttempts = 0;
   bot.maxReconnectAttempts = Infinity; // Never give up
   bot.reconnectDelay = 10000; // Start with 5 seconds

   // Load pathfinder
   bot.loadPlugin(pathfinder);
   
   // Load minecraft data with error handling
   let mcData;
   try {
      mcData = require("minecraft-data")(bot.version);
      console.log(`[${botConfig.name}] ✅ Loaded Minecraft data for version ${bot.version}`);
   } catch (err) {
      console.log(`[${botConfig.name}] ⚠️ Could not load data for ${bot.version}, falling back to 1.12.2`);
      mcData = require("minecraft-data")("1.12.2");
   }
   
   const defaultMove = new Movements(bot, mcData);
   defaultMove.canDig = false;
   defaultMove.maxDropDown = 3;

   // Variables
   let spawnPoint = null;
   let reconnectTimer = null;

   // Update uptime
   const uptimeInterval = setInterval(() => {
      if (bot.isOnline) {
         bot.uptime = Math.floor((Date.now() - bot.startTime) / 1000);
      }
   }, 1000);

   // Connection timeout
   const connectionTimeout = setTimeout(() => {
      if (!bot.entity) {
         console.log(`[${botConfig.name}] ❌ Connection timeout - server may be offline`);
         bot.end();
      }
   }, 30000);

   // Auth functions (keeping auth for servers that need it)
   function sendRegister(password) {
      return new Promise((resolve) => {
         bot.chat(`/register ${password} ${password}`);
         console.log(`[${botConfig.name}] 🔐 [Auth] Sent /register command`);

         setTimeout(() => {
            resolve(); // Always resolve, don't wait for response
         }, 3000);
      });
   }

   function sendLogin(password) {
      return new Promise((resolve) => {
         bot.chat(`/login ${password}`);
         console.log(`[${botConfig.name}] 🔐 [Auth] Sent /login command`);

         setTimeout(() => {
            resolve(); // Always resolve, don't wait for response
         }, 3000);
      });
   }

   // Event: Connected
   bot.once("connect", () => {
      console.log(`[${botConfig.name}] 🔌 Connected to server, waiting for login...`);
   });

   // Event: Login
   bot.once("login", () => {
      console.log(`[${botConfig.name}] ✅ Logged in as ${bot.username}`);
      bot.reconnectAttempts = 0; // Reset reconnect attempts on successful login
      bot.reconnectDelay = 10000; // Reset delay
   });

   // Event: Spawn
   bot.once("spawn", () => {
      clearTimeout(connectionTimeout);
      console.log(`\x1b[32m[${botConfig.name}] ✅ Bot joined the server\x1b[0m`);
      
      bot.isOnline = true;
      bot.startTime = Date.now();

      // Set settings
      try {
         bot.settings.colorsEnabled = false;
         bot.settings.chat = "enabled";
      } catch (err) {
         console.log(`[${botConfig.name}] ⚠️ Could not modify bot settings`);
      }

      // Store spawn point
      spawnPoint = bot.entity.position.clone();
      console.log(`[${botConfig.name}] 📍 Spawn point: ${Math.round(spawnPoint.x)}, ${Math.round(spawnPoint.y)}, ${Math.round(spawnPoint.z)}`);

      // Auto-auth module (keep for servers that need it)
      if (config.utils["auto-auth"].enabled) {
         console.log(`[${botConfig.name}] 🔐 [Auth] Starting auto-auth module`);
         const password = config.utils["auto-auth"]["password"];

         // Send auth commands without waiting for responses
         setTimeout(() => {
            sendRegister(password);
         }, 2000);
         
         setTimeout(() => {
            sendLogin(password);
         }, 5000);
      }

      // Position movement if enabled
      const pos = config.position;
      if (config.position.enabled && pos.x !== 0 && pos.y !== 0 && pos.z !== 0) {
         console.log(`[${botConfig.name}] 🚶 Moving to target location (${pos.x}, ${pos.y}, ${pos.z})`);
         bot.pathfinder.setMovements(defaultMove);
         bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
      }

      // Anti-AFK module - ONLY movement and looking
      console.log(`[${botConfig.name}] 🔄 [Anti-AFK] Started with movement and look rotation`);
      
      // Random movement every 5-10 seconds
      const movementInterval = setInterval(() => {
         if (!bot.entity || !spawnPoint || !bot.isOnline) return;

         // Check distance from spawn
         const pos = bot.entity.position;
         const distance = Math.sqrt(
            Math.pow(pos.x - spawnPoint.x, 2) + 
            Math.pow(pos.z - spawnPoint.z, 2)
         );

         // If too far, go back to spawn
         if (distance > 15) {
            console.log(`[${botConfig.name}] 📍 Returning to spawn area...`);
            bot.pathfinder.setMovements(defaultMove);
            bot.pathfinder.setGoal(new GoalNear(spawnPoint.x, spawnPoint.y, spawnPoint.z, 2));
            return;
         }

         // Random movement - 70% movement, 30% looking
         const action = Math.random();

         if (action < 0.35) {
            // Move forward
            bot.setControlState("forward", true);
            setTimeout(() => bot.setControlState("forward", false), 2000 + Math.random() * 2000);
         } else if (action < 0.7) {
            // Move backward or strafe
            const dirs = ["back", "left", "right"];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            bot.setControlState(dir, true);
            setTimeout(() => bot.setControlState(dir, false), 1500 + Math.random() * 1500);
         } else {
            // Just look around
            const yaw = Math.random() * Math.PI * 2;
            const pitch = (Math.random() - 0.5) * 0.5; // Small pitch variation
            bot.look(yaw, pitch);
         }

         // Occasionally jump
         if (Math.random() < 0.2) {
            bot.setControlState("jump", true);
            setTimeout(() => bot.setControlState("jump", false), 500);
         }

      }, 6000 + Math.random() * 4000); // Random interval between 6-10 seconds

      // Player tracking (look at nearest player)
      const lookInterval = setInterval(() => {
         if (!bot.entity || !bot.players || !bot.isOnline) return;

         let nearest = null;
         let nearestDist = Infinity;

         for (const [name, player] of Object.entries(bot.players)) {
            if (name !== bot.username && player.entity) {
               const dist = bot.entity.position.distanceTo(player.entity.position);
               if (dist < nearestDist && dist < 15) {
                  nearestDist = dist;
                  nearest = player;
               }
            }
         }

         if (nearest && nearest.entity) {
            bot.lookAt(nearest.entity.position.offset(0, 1.6, 0));
         }
      }, 3000);

      // Store intervals to clear on disconnect
      bot.intervals = [movementInterval, lookInterval, uptimeInterval];
   });

   // NO CHAT HANDLERS - all chat functionality removed

   // Event: Goal reached
   bot.on("goal_reached", () => {
      console.log(`[${botConfig.name}] ✅ Reached destination at ${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.y)}, ${Math.round(bot.entity.position.z)}`);
   });

   // Event: Death
   bot.on("death", () => {
      console.log(`[${botConfig.name}] 💀 Bot died, respawning...`);
      setTimeout(() => {
         bot.chat("/spawn");
      }, 3000);
   });

   // Event: Health
   bot.on("health", () => {
      if (bot.health < 10) {
         console.log(`[${botConfig.name}] ⚠️ Low health: ${bot.health}/20`);
      }
   });

   // Event: Kicked
   bot.on("kicked", (reason) => {
      console.log(`\x1b[33m[${botConfig.name}] ❌ Bot was kicked:\x1b[0m`, reason);
      bot.isOnline = false;
      
      // Clear intervals
      if (bot.intervals) {
         bot.intervals.forEach(clearInterval);
      }
   });

   // Event: Error
   bot.on("error", (err) => {
      console.log(`\x1b[31m[${botConfig.name}] ❌ Error:\x1b[0m`, err.message);
   });

   // Event: End with infinite auto-reconnect
   bot.on("end", (reason) => {
      console.log(`[${botConfig.name}] 🔌 Disconnected: ${reason || 'Unknown reason'}`);
      bot.isOnline = false;
      
      // Clear intervals
      if (bot.intervals) {
         bot.intervals.forEach(clearInterval);
      }
      
      // Clear any existing reconnect timer
      if (reconnectTimer) {
         clearTimeout(reconnectTimer);
      }
      
      // Infinite reconnect with exponential backoff
      bot.reconnectAttempts++;
      
      // Calculate delay with exponential backoff (max 60 seconds)
      const delay = Math.min(60000, bot.reconnectDelay * Math.pow(1.5, bot.reconnectAttempts - 1));
      
      console.log(`[${botConfig.name}] 🔄 Reconnecting in ${Math.round(delay/1000)}s (Attempt ${bot.reconnectAttempts})...`);
      
      reconnectTimer = setTimeout(() => {
         console.log(`[${botConfig.name}] 🔄 Attempting to reconnect...`);
         createBot(botConfig);
      }, delay);
   });

   // Update or add bot to instances
   const existingIndex = botInstances.findIndex(b => b.id === botConfig.id);
   const botData = {
      id: botConfig.id,
      name: botConfig.name,
      instance: bot,
      isOnline: false,
      uptime: 0
   };
   
   if (existingIndex >= 0) {
      botInstances[existingIndex] = botData;
   } else {
      botInstances.push(botData);
   }

   return bot;
}

// Start all bots
console.log("🚀 Starting 5 bot instances...");
BOTS.forEach((botConfig, index) => {
   setTimeout(() => {
      createBot(botConfig);
   }, index * 3000); // Stagger bot connections by 3 seconds each
});

// Status dashboard
const dashboardApp = express();
dashboardApp.get("/", (req, res) => {
   let html = `
   <html>
   <head>
      <title>Multi-Bot Dashboard - 5 Bots</title>
      <meta http-equiv="refresh" content="10">
      <style>
         body { font-family: Arial; padding: 20px; background: #1a1a1a; color: #fff; }
         .bot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
         .bot { border: 1px solid #333; padding: 15px; border-radius: 10px; background: #2a2a2a; }
         .online { color: #00ff00; font-weight: bold; }
         .offline { color: #ff0000; font-weight: bold; }
         h1 { color: #ff9900; text-align: center; }
         .port { color: #888; }
         .stats { display: flex; justify-content: space-between; margin-top: 10px; }
         .restart-btn { background: #ff9900; color: #000; padding: 5px 10px; text-decoration: none; border-radius: 5px; }
         .footer { text-align: center; margin-top: 20px; color: #666; }
      </style>
   </head>
   <body>
      <h1>🤖 5-Bot Status Dashboard</h1>
      <div class="bot-grid">
   `;
   
   BOTS.forEach(botConfig => {
      const bot = botInstances.find(b => b.id === botConfig.id);
      const status = bot && bot.instance && bot.instance.isOnline ? 'Online' : 'Offline';
      const uptime = bot ? bot.uptime : 0;
      const reconnectAttempts = bot && bot.instance ? bot.instance.reconnectAttempts : 0;
      
      html += `
      <div class="bot">
         <h2>${botConfig.name}</h2>
         <p>Username: ${botConfig.account.username}</p>
         <p>Status: <span class="${status.toLowerCase()}">${status}</span></p>
         <p>Uptime: ${uptime} seconds</p>
         <p>Reconnect Attempts: ${reconnectAttempts}</p>
         <p class="port">Port: ${botConfig.port}</p>
         <div class="stats">
            <a href="http://localhost:${botConfig.port}" target="_blank" class="restart-btn">View Bot</a>
            <a href="http://localhost:${botConfig.port}/restart" class="restart-btn">Restart</a>
         </div>
      </div>
      `;
   });
   
   html += `
      </div>
      <div class="footer">
         <p>Dashboard auto-refreshes every 10 seconds | Total Bots: 5</p>
         <p>Created by DISCORD:- mr.ishantsharma</p>
      </div>
   </body></html>`;
   
   res.send(html);
});

// JSON endpoint for API access
dashboardApp.get("/api/status", (req, res) => {
   const status = BOTS.map(botConfig => {
      const bot = botInstances.find(b => b.id === botConfig.id);
      return {
         id: botConfig.id,
         name: botConfig.name,
         username: botConfig.account.username,
         status: bot && bot.instance && bot.instance.isOnline ? 'online' : 'offline',
         uptime: bot ? bot.uptime : 0,
         reconnectAttempts: bot && bot.instance ? bot.instance.reconnectAttempts : 0,
         port: botConfig.port
      };
   });
   res.json(status);
});

dashboardApp.listen(8000, () => {
   console.log("📊 Multi-bot dashboard started on port 8000");
   console.log("🌐 Visit http://localhost:8000 to see all 5 bots status");
   console.log("📡 API available at http://localhost:8000/api/status");
});

// Global error handler to prevent crashes
process.on("uncaughtException", (err) => {
   console.log("❌ Uncaught Exception:", err.message);
   // Don't exit, keep running
});

process.on("unhandledRejection", (reason, promise) => {
   console.log("❌ Unhandled Rejection:", reason);
   // Don't exit, keep running
});

// Handle process termination
process.on("SIGINT", () => {
   console.log("\n👋 Shutting down all bots...");
   botInstances.forEach(bot => {
      if (bot.instance) {
         bot.instance.end();
      }
   });
   process.exit();
});

console.log("🚀 Bot system started with infinite reconnect enabled");
