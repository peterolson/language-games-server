import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { guid, shortCode } from "./util";

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

  function joinRoom(
    roomMap: Map<string, Set<string>>,
    room: string,
    socket: Socket
  ) {
    const players = roomMap.get(room) || new Set();
    const peerIds = Array.from(players);
    const playerNames = { [socket.id]: socket.data.name };
    for (const id of peerIds) {
      const name = io.sockets.sockets.get(id).data.name;
      playerNames[id] = name;
    }
    socket.join(room);
    socket.data.room = room;
    socket.emit("room-joined", {
      room: room,
      peerIds,
      playerNames,
      selfId: socket.id,
    });
    socket.broadcast.to(room).emit("player-joined", {
      playerId: socket.id,
      playerName: socket.data.name,
    });
  }

  function searchRooms(
    socket: Socket,
    lang: string,
    isPublic: boolean,
    room: string,
    useVideo: boolean
  ) {
    const roomMap = io.sockets.adapter.rooms;
    if (room) {
      const players = roomMap.get(room) || new Set();
      const size = players.size;
      if (useVideo && size > 1) {
        socket.emit("room-full", room);
        return;
      }
      joinRoom(roomMap, room, socket);
      return;
    }
    if (isPublic) {
      const roomsInLang = [...roomMap.keys()].filter((r) =>
        r.startsWith(lang + "|")
      );
      for (const roomName of roomsInLang) {
        const players = roomMap.get(roomName);
        if (players.size === 1) {
          joinRoom(roomMap, roomName, socket);
          return;
        }
      }
    }
    const roomName = isPublic ? `${lang}|${guid()}` : shortCode(useVideo);
    joinRoom(roomMap, roomName, socket);
  }

  io.on("connection", (socket) => {
    socket.on("disconnect", (reason) => {
      if (socket.data.room) {
        socket.broadcast.to(socket.data.room).emit("user:leave", {
          id: socket.id,
          playerIds: Array.from(
            io.sockets.adapter.rooms.get(socket.data.room) || []
          ),
        });
      }
    });

    socket.on(
      "playqueue.add",
      async ({ lang, name, isPublic, room, useVideo }) => {
        socket.data.name = name;
        searchRooms(socket, lang, isPublic, room, useVideo);
      }
    );

    socket.on("playqueue.remove", async () => {
      const room = socket.data.room;
      if (room) {
        socket.leave(room);
        socket.broadcast.in(room).emit("user:leave", {
          id: socket.id,
          playerIds: Array.from(io.sockets.adapter.rooms.get(room) || []),
        });
      }
    });

    socket.on("user:leave", (room) => {
      socket.leave(room);
      socket.broadcast.in(room).emit("user:leave", {
        id: socket.id,
        playerIds: Array.from(io.sockets.adapter.rooms.get(room) || []),
      });
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
