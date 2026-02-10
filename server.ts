import { createServer } from "http"
import { Server } from "socket.io"

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
})

const users = new Map<string, string>()

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`)

  socket.on("register", (userId: string) => {
    users.set(socket.id, userId)
    socket.join(userId)

    console.log(`${userId} joined room ${userId}`)
    io.emit("user_list", Array.from(new Set(users.values())))
  })

  socket.on("join_room", (roomName: string) => {
    socket.join(roomName)
    console.log(`User ${users.get(socket.id)} joined room: ${roomName}`)
  })

  socket.on("private_message", (data) => {

    io.to(data.targetId).to(data.user).emit("message", data)

    console.log(`Message from ${data.user} to ${data.targetId}`)
  })

  socket.on("disconnect", () => {
    const userId = users.get(socket.id)
    users.delete(socket.id)

    if (userId) {
      // Emit the new list of users
      const uniqueUsers = Array.from(new Set(users.values()))
      io.emit("user_list", uniqueUsers)
      console.log(`${userId} disconnected.`)
    }
  })
})

httpServer.listen(4000, () => {
  console.log("Server runs on port 4000")
})