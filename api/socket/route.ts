import type { NextApiRequest, NextApiResponse } from "next"
import { Server as IOServer } from "socket.io"
import type { Server as HTTPServer } from "http"
import type { Socket } from "net"

type NextApiResponseWithSocket = NextApiResponse & {
  socket: Socket & {
    server: HTTPServer & {
      io?: IOServer
    }
  }
}

export default function GET(
  _req: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  if (!res.socket.server.io) {
    console.log("socket server starting...")

    const io = new IOServer(res.socket.server, {
      path: "/api/socket",
    })

    res.socket.server.io = io

    io.on("connection", (socket) => {
      console.log("New user connected:", socket.id)

      socket.on("chat:message", (message: string) => {
        io.emit("chat:message", message)
      })

      socket.on("disconnect", () => {
        console.log("User left:", socket.id)
      })
    })
  }

  res.end()
}
