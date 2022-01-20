import { RemoteSocket, Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { guid, shuffle } from "./util";
import { playerCount } from "./gameinfo";

const io = new Server();
const port = +process.env.PORT || 3004;

const pubClient = createClient();
const subClient = pubClient.duplicate();

const onError = (err) => {
  console.error("Redis error:", err);
};

pubClient.on("error", onError);
subClient.on("error", onError);

io.adapter(createAdapter(pubClient, subClient));

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.listen(port);

  async function connectPlayers(lang: string) {
    const roomName = `waiting-${lang}`;
    const players = await io.in(roomName).fetchSockets();

    const newRooms: {
      game: string;
      players: RemoteSocket<DefaultEventsMap>[];
    }[] = [];

    for (let i = 0; i + 1 < players.length; i += 2) {
      newRooms.push({
        game: "chat",
        players: [players[i], players[i + 1]],
      });
    }

    for (const room of newRooms) {
      const gameRoomName = `${lang}|${room.game}|${guid()}`;
      const playerNames: Record<string, string> = {};
      for (const player of room.players) {
        playerNames[player.id] = player.data.name;
      }
      for (const player of room.players) {
        player.leave(roomName);
        player.join(gameRoomName);
        let selfId = player.id;

        player.emit("game-joined", {
          game: room.game,
          room: gameRoomName,
          playerCount: room.players.length,
          selfId,
          peerIds: room.players.filter((p) => p.id !== selfId).map((p) => p.id),
          playerNames,
          minPlayers: playerCount[room.game][0],
        });
        player.data.room = gameRoomName;
      }
      console.log(`${gameRoomName} ${room.players.length}`);
    }
  }

  io.on("connection", (socket) => {
    console.log("New connection", socket.id);
    socket.on("disconnect", (reason) => {
      console.log("Disconnected", socket.id, reason, socket.data);
      if (socket.data.room) {
        socket.broadcast.to(socket.data.room).emit("user:leave", socket.id);
      }
    });

    socket.on("playqueue.add", async ({ lang, name }) => {
      socket.data.name = name;
      socket.join(`waiting-${lang}`);
      connectPlayers(lang);
    });

    socket.on("user:leave", (room) => {
      socket.leave(room);
      socket.broadcast.in(room).emit("user:leave", socket.id);
      console.log("user:leave", room, socket.id);
    });

    socket.on("user:message:send", ({ room, message }) => {
      socket.broadcast.in(room).emit("user:message:send", {
        id: socket.id,
        message,
        timestamp: +new Date(),
      });
    });
  });

  console.log(`Listening on port ${port}.`);
});
