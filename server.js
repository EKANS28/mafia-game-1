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

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Mafia Pro</title>

<style>
body {
  font-family: Arial;
  text-align:center;
  color:white;
  margin:0;
  height:100vh;
  background: linear-gradient(-45deg, #000, #1a1a1a, #330000, #111);
  background-size: 400% 400%;
  animation: bg 10s infinite;
}

@keyframes bg {
  0% {background-position:0% 50%;}
  50% {background-position:100% 50%;}
  100% {background-position:0% 50%;}
}

input, button {
  padding:10px;
  margin:5px;
  border-radius:5px;
  border:none;
}

button {
  background: crimson;
  color:white;
  cursor:pointer;
}

button:hover {
  background: gold;
  color:black;
}

.card {
  margin-top:20px;
  padding:20px;
  border:2px solid white;
  border-radius:10px;
  font-size:24px;
}

.mafia { background:red; }
.doctor { background:green; }
.villager { background:gray; }
</style>
</head>

<body>

<h1>🎮 Mafia Pro</h1>

<input id="name" placeholder="Name">
<input id="room" placeholder="Room Code">
<input id="mafia" placeholder="Mafia Count">
<input id="maxPlayers" placeholder="Max Players">

<br>

<button onclick="create()">Create</button>
<button onclick="join()">Join</button>
<button onclick="start()">Start</button>

<h2 id="code"></h2>

<ul id="players"></ul>

<div id="role"></div>
<ul id="hostView"></ul>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let code = "";
let isHost = false;

function create(){
  socket.emit("createRoom", {
    name: document.getElementById("name").value,
    mafiaCount: parseInt(document.getElementById("mafia").value) || 1,
    maxPlayers: parseInt(document.getElementById("maxPlayers").value) || 5
  });
}

function join(){
  code = document.getElementById("room").value.trim().toUpperCase();
  socket.emit("joinRoom", {
    name: document.getElementById("name").value,
    code
  });
}

function start(){
  socket.emit("startGame", code);
}

socket.on("roomCode", c=>{
  code = c;
  isHost = true;
  document.getElementById("code").innerText = "Room: " + c + " (HOST)";
});

socket.on("players", players=>{
  document.getElementById("players").innerHTML =
    players.map(p=>"<li>"+p.name+"</li>").join("");
});

socket.on("role", role=>{
  if(!isHost){
    document.getElementById("role").innerHTML =
      "<div class='card'>🎴 "+role+"</div>";
  }
});

socket.on("hostRoles", list=>{
  if(isHost){
    document.getElementById("hostView").innerHTML =
      list.map(p=>{
        return "<li class='"+p.role.toLowerCase()+"'>"+p.name+" - "+p.role+"</li>";
      }).join("");
  }
});

socket.on("errorMsg", msg=>{
  alert(msg);
});
</script>

</body>
</html>
`);
});

io.on("connection", socket => {

  socket.on("createRoom", ({ name, mafiaCount, maxPlayers }) => {
    const code = makeCode();

    rooms[code] = {
      host: socket.id,
      players: [],
      roles: {},
      mafiaCount,
      maxPlayers
    };

    socket.join(code);
    rooms[code].players.push({ id: socket.id, name });

    socket.emit("roomCode", code);
    io.to(code).emit("players", rooms[code].players);
  });

  socket.on("joinRoom", ({ name, code }) => {
    let room = rooms[code];

    if (!room) {
      socket.emit("errorMsg", "Room not found ❌");
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit("errorMsg", "Room full 🚫");
      return;
    }

    socket.join(code);
    room.players.push({ id: socket.id, name });

    io.to(code).emit("players", room.players);
  });

  // 🔥 UPDATED START GAME
  socket.on("startGame", (code) => {
    let room = rooms[code];
    if (!room) return;

    if (socket.id !== room.host) return;

    if (room.players.length < room.maxPlayers) {
      io.to(room.host).emit("errorMsg", "Players not full ❌");
      return;
    }

    let shuffled = [...room.players].sort(() => Math.random() - 0.5);

    room.roles = {};

    // Mafia
    for (let i = 0; i < room.mafiaCount; i++) {
      if (shuffled[i]) room.roles[shuffled[i].id] = "Mafia";
    }

    // Doctor
    if (shuffled[room.mafiaCount]) {
      room.roles[shuffled[room.mafiaCount].id] = "Doctor";
    }

    // Villagers
    shuffled.forEach(p => {
      if (!room.roles[p.id]) room.roles[p.id] = "Villager";
    });

    // 🔥 Mafia list
    let mafiaPlayers = room.players.filter(p => room.roles[p.id] === "Mafia");

    // Send roles
    room.players.forEach(p => {

      let role = room.roles[p.id];

      if (role === "Mafia") {

        let teammates = mafiaPlayers
          .filter(mp => mp.id !== p.id)
          .map(mp => mp.name);

        io.to(p.id).emit("role",
          "Mafia 🔪<br>Team: " + (teammates.length ? teammates.join(", ") : "You are alone")
        );

      } else {
        io.to(p.id).emit("role", role);
      }
    });

    // Host view
    let list = room.players.map(p=>{
      return { name: p.name, role: room.roles[p.id] };
    });

    io.to(room.host).emit("hostRoles", list);
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log("Running on " + PORT));
