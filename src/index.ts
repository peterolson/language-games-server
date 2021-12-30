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
    const matchedIds = new Set<string>();
    const byGame: Record<string, RemoteSocket<DefaultEventsMap>[]> = {};
    for (const player of players) {
      const games = player.data.criteria.games;
      for (const game of games) {
        if (!byGame[game]) {
          byGame[game] = [];
        }
        byGame[game].push(player);
      }
    }
    const games = shuffle(Object.keys(byGame));
    const newRooms: {
      game: string;
      players: RemoteSocket<DefaultEventsMap>[];
    }[] = [];
    for (const game of games) {
      const [min, max] = playerCount[game];
      const players = byGame[game].filter(
        (player) => !matchedIds.has(player.id)
      );
      if (players.length < min) continue;
      let i = 0;
      while (i < players.length) {
        const count = Math.min(max, players.length - i);
        if (count < min) {
          break;
        }
        const room = { game, players: players.slice(i, i + count) };
        newRooms.push(room);
        room.players.forEach((player) => matchedIds.add(player.id));
        i += count;
      }
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

    socket.on("playqueue.add", async ({ lang, games, name }) => {
      socket.data.criteria = { games };
      socket.data.name = name;
      socket.join(`waiting-${lang}`);
      connectPlayers(lang);
    });

    socket.on("user:rtc:offer", ({ id, offer }) => {
      io.to(id).emit("user:rtc:offer", { id: socket.id, offer });
    });

    socket.on("user:rtc:answer", ({ id, answer }) => {
      io.to(id).emit("user:rtc:answer", { id: socket.id, answer });
    });

    socket.on("user:rtc:candidate", ({ id, candidate }) => {
      io.to(id).emit("user:rtc:candidate", { id: socket.id, candidate });
    });

    socket.on("user:leave", (room) => {
      socket.leave(room);
      socket.broadcast.in(room).emit("user:leave", socket.id);
    });

    socket.on("user:message:send", ({ room, message }) => {
      socket.broadcast.in(room).emit("user:message:send", {
        id: socket.id,
        message,
        timestamp: +new Date(),
      });
    });
  });

  console.log(`Listening on port ${port}`);
});
