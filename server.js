const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let rooms = {};

function makeCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// 🌐 FRONTEND
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Mafia Role Card</title>
  <style>
    body {
      font-family: Arial;
      text-align: center;
      background: #111;
      color: white;
    }
    input, button {
      padding: 10px;
      margin: 5px;
    }
    .card {
      margin-top: 20px;
      padding: 20px;
      border-radius: 10px;
      background: #222;
      font-size: 25px;
      border: 2px solid white;
    }
  </style>
</head>
<body>

<h1>🎴 Mafia Role Card</h1>

<input id="name" placeholder="Your name">
<input id="room" placeholder="Room code">
<input id="mafia" placeholder="Mafia count">

<br>

<button onclick="create()">Create Room</button>
<button onclick="join()">Join Room</button>
<button onclick="start()">Start Game</button>

<h2 id="code"></h2>
<div id="role"></div>

<ul id="players"></ul>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let code = "";

// CREATE ROOM
function create() {
  socket.emit("createRoom", {
    name: document.getElementById("name").value,
    mafiaCount: parseInt(document.getElementById("mafia").value)
  });
}

// JOIN ROOM
function join() {
  code = document.getElementById("room").value.trim();

  socket.emit("joinRoom", {
    name: document.getElementById("name").value,
    code
  });
}

// START GAME
function start() {
  socket.emit("startGame", code);
}

// RECEIVE ROOM CODE
socket.on("roomCode", c => {
  code = c; // 🔥 IMPORTANT FIX
  document.getElementById("code").innerText = "Room Code: " + c;
});

// UPDATE PLAYERS
socket.on("players", players => {
  document.getElementById("players").innerHTML =
    players.map(p => "<li>" + p.name + "</li>").join("");
});

// SHOW ROLE CARD
socket.on("role", role => {
  document.getElementById("role").innerHTML = \`
    <div class="card">
      🎴 Your Role: <b>\${role}</b>
    </div>
  \`;
});

// ERROR MESSAGE
socket.on("errorMsg", msg => {
  alert(msg);
});
</script>

</body>
</html>
  `);
});

// 🎮 BACKEND
io.on("connection", (socket) => {

  socket.on("createRoom", ({ name, mafiaCount }) => {
    const code = makeCode();

    rooms[code] = {
      host: socket.id,
      players: [],
      roles: {},
      mafiaCount
    };

    socket.join(code);
    rooms[code].players.push({ id: socket.id, name });

    socket.emit("roomCode", code);
    io.to(code).emit("players", rooms[code].players);
  });

  socket.on("joinRoom", ({ name, code }) => {
    if (!rooms[code]) {
      socket.emit("errorMsg", "Room not found ❌");
      return;
    }

    socket.join(code);
    rooms[code].players.push({ id: socket.id, name });

    io.to(code).emit("players", rooms[code].players);
  });

  socket.on("startGame", (code) => {
    let room = rooms[code];
    if (!room) return;

    let shuffled = [...room.players].sort(() => Math.random() - 0.5);

    // Mafia
    for (let i = 0; i < room.mafiaCount; i++) {
      room.roles[shuffled[i].id] = "Mafia";
    }

    // Doctor
    if (shuffled.length > room.mafiaCount) {
      room.roles[shuffled[room.mafiaCount].id] = "Doctor";
    }

    // Villagers
    shuffled.forEach(p => {
      if (!room.roles[p.id]) {
        room.roles[p.id] = "Villager";
      }
    });

    // Send role
    room.players.forEach(p => {
      io.to(p.id).emit("role", room.roles[p.id]);
    });
  });

});

// 🔥 PORT FIX
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
