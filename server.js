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

// 🌐 Serve frontend
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Mafia Multiplayer</title>
  <style>
    body { font-family: Arial; text-align: center; background:#111; color:white; }
    input, button { padding:10px; margin:5px; }
    button { cursor:pointer; }
  </style>
</head>
<body>

<h1>🕵️ Mafia Game</h1>

<input id="name" placeholder="Your name">
<input id="room" placeholder="Room code">
<input id="mafia" placeholder="Mafia count">

<br>

<button onclick="create()">Create Room</button>
<button onclick="join()">Join Room</button>
<button onclick="start()">Start Game</button>

<h2 id="code"></h2>
<h3 id="role"></h3>
<h3 id="phase"></h3>

<ul id="players"></ul>

<div id="actions"></div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let code = "";
let myRole = "";

function create() {
  socket.emit("createRoom", {
    name: document.getElementById("name").value,
    mafiaCount: parseInt(document.getElementById("mafia").value)
  });
}

function join() {
  code = document.getElementById("room").value;
  socket.emit("joinRoom", {
    name: document.getElementById("name").value,
    code
  });
}

function start() {
  socket.emit("startGame", code);
}

socket.on("roomCode", c => {
  code = c;
  document.getElementById("code").innerText = "Room Code: " + c;
});

socket.on("players", players => {
  document.getElementById("players").innerHTML =
    players.map(p => "<li>" + p.name + "</li>").join("");

  showActions(players);
});

socket.on("role", role => {
  myRole = role;
  document.getElementById("role").innerText = "Role: " + role;
});

socket.on("phase", phase => {
  document.getElementById("phase").innerText = "Phase: " + phase;
});

function showActions(players) {
  let html = "";

  players.forEach(p => {
    if (myRole === "Mafia") {
      html += "<button onclick=\\"kill('" + p.id + "')\\">Kill " + p.name + "</button>";
    }
    if (myRole === "Doctor") {
      html += "<button onclick=\\"save('" + p.id + "')\\">Save " + p.name + "</button>";
    }
    html += "<button onclick=\\"vote('" + p.id + "')\\">Vote " + p.name + "</button>";
  });

  document.getElementById("actions").innerHTML = html;
}

function kill(id) {
  socket.emit("nightAction", { code, type: "kill", target: id });
}

function save(id) {
  socket.emit("nightAction", { code, type: "save", target: id });
}

function vote(id) {
  socket.emit("vote", { code, target: id });
}
</script>

</body>
</html>
  `);
});

// 🔥 Multiplayer logic
io.on("connection", (socket) => {

  socket.on("createRoom", ({ name, mafiaCount }) => {
    const code = makeCode();

    rooms[code] = {
      host: socket.id,
      players: [],
      roles: {},
      mafiaCount,
      votes: {},
      actions: {}
    };

    socket.join(code);
    rooms[code].players.push({ id: socket.id, name });

    socket.emit("roomCode", code);
    io.to(code).emit("players", rooms[code].players);
  });

  socket.on("joinRoom", ({ name, code }) => {
    if (!rooms[code]) return;

    socket.join(code);
    rooms[code].players.push({ id: socket.id, name });

    io.to(code).emit("players", rooms[code].players);
  });

  socket.on("startGame", (code) => {
    let room = rooms[code];
    if (!room) return;

    let shuffled = [...room.players].sort(() => Math.random() - 0.5);

    for (let i = 0; i < room.mafiaCount; i++) {
      room.roles[shuffled[i].id] = "Mafia";
    }

    room.roles[shuffled[room.mafiaCount].id] = "Doctor";

    shuffled.forEach(p => {
      if (!room.roles[p.id]) room.roles[p.id] = "Villager";
    });

    room.players.forEach(p => {
      io.to(p.id).emit("role", room.roles[p.id]);
    });

    io.to(code).emit("phase", "night");
  });

  socket.on("nightAction", ({ code, type, target }) => {
    let room = rooms[code];
    if (!room) return;

    room.actions[type] = target;
  });

  socket.on("vote", ({ code, target }) => {
    let room = rooms[code];
    if (!room) return;

    room.votes[target] = (room.votes[target] || 0) + 1;

    if (room.votes[target] >= Math.ceil(room.players.length / 2)) {
      room.players = room.players.filter(p => p.id !== target);
      room.votes = {};

      io.to(code).emit("players", room.players);
      io.to(code).emit("phase", "night");
    }
  });

});

// 🔥 HOSTING FIX (IMPORTANT)
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});